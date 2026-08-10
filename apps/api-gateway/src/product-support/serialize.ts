/**
 * TODO-177 (ADR-289) — Ürün Desteği DTO projeksiyonları (allowlist; ham enum kod olarak, internal SIZMAZ).
 *
 * Kural: prisma satırı ASLA spread edilmez; her alan açıkça seçilir. storageKey/mimeType DTO'ya
 * girmez (attachment yalnız auth-gate'li URL olarak). Enum'lar kod olarak döner (UI etiketler).
 */

import type {
  SupportTicket,
  SupportTicketMessage,
  SupportTicketAttachment,
  SupportTicketAnswerSnapshot,
  SupportTicketStatusHistory,
  SupportSlaSnapshot,
  SupportQuestion,
  SupportQuestionOption,
  SupportQuestionTransition,
  SupportQuestionSetVersion,
} from "@prisma/client";
import { slaStateFor, type SlaStateKind } from "./sla.js";
import { evaluateReopen } from "./status-map.js";
import type { WarrantyAnchorSource } from "./warranty.js";

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

// answerValue (Json) → DTO union. Bilinmeyen şekil güvenli boş metne düşer.
function projectAnswerValue(value: unknown): { optionKeys: string[] } | { boolean: boolean } | { text: string } {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.optionKeys)) return { optionKeys: v.optionKeys.map(String) };
    if (typeof v.boolean === "boolean") return { boolean: v.boolean };
    if (typeof v.text === "string") return { text: v.text };
  }
  return { text: "" };
}

export interface WarrantySnapshotView {
  warrantyEndsAt: Date | null;
  warrantyAnchorSource: string | null;
}
export function projectWarranty(
  view: WarrantySnapshotView,
  now: Date,
): { warrantyEndsAt: string | null; anchorSource: WarrantyAnchorSource; inWarranty: boolean | null } {
  const anchorSource = (view.warrantyAnchorSource ?? "NONE") as WarrantyAnchorSource;
  const warrantyEndsAt = view.warrantyEndsAt;
  const inWarranty = warrantyEndsAt ? now.getTime() <= warrantyEndsAt.getTime() : null;
  return { warrantyEndsAt: iso(warrantyEndsAt), anchorSource, inWarranty };
}

export function attachmentUrl(base: string, attachmentId: string): string {
  return `${base}/attachments/${attachmentId}`;
}

export function projectAttachment(
  att: Pick<SupportTicketAttachment, "id" | "type">,
  base: string,
): { id: string; type: string; url: string } {
  return { id: att.id, type: att.type, url: attachmentUrl(base, att.id) };
}

export function projectAnswer(row: SupportTicketAnswerSnapshot) {
  return {
    questionKey: row.questionKey,
    questionPrompt: row.questionPrompt,
    questionType: row.questionType,
    value: projectAnswerValue(row.answerValue),
    sortOrder: row.sortOrder,
  };
}

type MessageWithAttachments = SupportTicketMessage & {
  attachments: Array<Pick<SupportTicketAttachment, "id" | "type">>;
};
export function projectMessage(row: MessageWithAttachments, attachmentBase: string) {
  return {
    id: row.id,
    actorType: row.actorType,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    attachments: row.attachments.map((a) => projectAttachment(a, attachmentBase)),
  };
}

// Canlı SLA = en yüksek cycle'lı snapshot. state read-time türetilir.
export function projectSla(
  snapshots: SupportSlaSnapshot[],
  isTerminal: boolean,
  now: Date,
): {
  cycle: number;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: SlaStateKind;
  resolutionState: SlaStateKind;
} | null {
  if (snapshots.length === 0) return null;
  const live = snapshots.reduce((a, b) => (b.cycle > a.cycle ? b : a));
  return {
    cycle: live.cycle,
    firstResponseDueAt: live.firstResponseDueAt.toISOString(),
    resolutionDueAt: live.resolutionDueAt.toISOString(),
    firstResponseState: slaStateFor(live.firstResponseDueAt, live.firstResponseMetAt, now, isTerminal),
    resolutionState: slaStateFor(live.resolutionDueAt, live.resolvedAt, now, isTerminal),
  };
}

const isTerminalStatus = (s: string): boolean => s === "RESOLVED" || s === "CLOSED";

// --- Graph DTO (resolved published version) ---
type VersionWithGraph = SupportQuestionSetVersion & {
  questions: Array<SupportQuestion & { options: SupportQuestionOption[] }>;
  transitions: SupportQuestionTransition[];
};
export function projectGraph(version: VersionWithGraph): {
  questionSetId: string;
  questionSetVersionId: string;
  version: number;
  entryQuestionKey: string;
  questions: Array<{
    key: string;
    type: SupportQuestion["type"];
    prompt: string;
    helpText: string | null;
    sortOrder: number;
    required: boolean;
    isEntry: boolean;
    options: Array<{ key: string; label: string; sortOrder: number }>;
  }>;
  transitions: Array<{
    fromKey: string;
    matchKind: SupportQuestionTransition["matchKind"];
    matchOptionKey: string | null;
    action: SupportQuestionTransition["action"];
    toKey: string | null;
    sortOrder: number;
  }>;
} {
  const byId = new Map(version.questions.map((q) => [q.id, q.key]));
  const optionKeyById = new Map<string, string>();
  for (const q of version.questions) for (const o of q.options) optionKeyById.set(o.id, o.key);
  const entry = version.questions.find((q) => q.isEntry);
  return {
    questionSetId: version.questionSetId,
    questionSetVersionId: version.id,
    version: version.version,
    entryQuestionKey: entry?.key ?? "",
    questions: [...version.questions]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((q) => ({
        key: q.key,
        type: q.type,
        prompt: q.prompt,
        helpText: q.helpText,
        sortOrder: q.sortOrder,
        required: q.required,
        isEntry: q.isEntry,
        options: [...q.options]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((o) => ({ key: o.key, label: o.label, sortOrder: o.sortOrder })),
      })),
    transitions: [...version.transitions]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({
        fromKey: byId.get(t.fromQuestionId) ?? "",
        matchKind: t.matchKind,
        matchOptionKey: t.matchOptionId ? (optionKeyById.get(t.matchOptionId) ?? null) : null,
        action: t.action,
        toKey: t.toQuestionId ? (byId.get(t.toQuestionId) ?? null) : null,
        sortOrder: t.sortOrder,
      })),
  };
}

// --- Customer ticket detail ---
export type TicketDetailRow = SupportTicket & {
  product: { title: string };
  order: { orderNumber: string };
  answers: SupportTicketAnswerSnapshot[];
  messages: MessageWithAttachments[];
  attachments: Array<Pick<SupportTicketAttachment, "id" | "type">>;
  slaSnapshots: SupportSlaSnapshot[];
};

export function projectCustomerTicketDetail(row: TicketDetailRow, attachmentBase: string, now: Date) {
  const terminal = isTerminalStatus(row.status);
  const reopen = evaluateReopen(row.status, row.resolvedAt, now, true);
  return {
    ticketNumber: row.ticketNumber,
    status: row.status,
    topic: row.topic,
    productTitle: row.product.title,
    variantTitle: null as string | null,
    orderNumber: row.order.orderNumber,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    resolvedAt: iso(row.resolvedAt),
    reopenCount: row.reopenCount,
    canReopen: reopen.ok,
    warranty: projectWarranty(row, now),
    suggestedResolutionText: row.suggestedResolutionText,
    answers: [...row.answers].sort((a, b) => a.sortOrder - b.sortOrder).map(projectAnswer),
    messages: [...row.messages]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => projectMessage(m, attachmentBase)),
    attachments: row.attachments.map((a) => projectAttachment(a, attachmentBase)),
    sla: projectSla(row.slaSnapshots, terminal, now) ?? emptySla(),
  };
}

// --- Admin ticket detail ---
export type AdminTicketDetailRow = TicketDetailRow & {
  variant: { title: string } | null;
  customer: { firstName: string | null; lastName: string | null; email: string };
  statusHistory: SupportTicketStatusHistory[];
};

export function projectAdminTicketDetail(
  row: AdminTicketDetailRow,
  attachmentBase: string,
  assigneeName: string | null,
  now: Date,
) {
  const terminal = isTerminalStatus(row.status);
  return {
    ticketId: row.id,
    ticketNumber: row.ticketNumber,
    status: row.status,
    topic: row.topic,
    version: row.version,
    customerName: fullName(row.customer),
    customerEmail: row.customer.email,
    productTitle: row.product.title,
    variantTitle: row.variant?.title ?? null,
    orderNumber: row.order.orderNumber,
    orderId: row.orderId,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    firstResponseAt: iso(row.firstResponseAt),
    resolvedAt: iso(row.resolvedAt),
    closedAt: iso(row.closedAt),
    reopenCount: row.reopenCount,
    assigneePlatformUserId: row.assigneePlatformUserId,
    assigneeName,
    warranty: projectWarranty(row, now),
    suggestedResolutionText: row.suggestedResolutionText,
    answers: [...row.answers].sort((a, b) => a.sortOrder - b.sortOrder).map(projectAnswer),
    messages: [...row.messages]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => projectMessage(m, attachmentBase)),
    attachments: row.attachments.map((a) => projectAttachment(a, attachmentBase)),
    timeline: [...row.statusHistory]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorType: h.actorType,
        eventType: h.eventType,
        note: h.note,
        createdAt: h.createdAt.toISOString(),
      })),
    sla: projectSla(row.slaSnapshots, terminal, now) ?? emptySla(),
  };
}

function fullName(c: { firstName: string | null; lastName: string | null }): string | null {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return n.length > 0 ? n : null;
}

function emptySla() {
  const nowIso = new Date(0).toISOString();
  return {
    cycle: 0,
    firstResponseDueAt: nowIso,
    resolutionDueAt: nowIso,
    firstResponseState: "DONE" as SlaStateKind,
    resolutionState: "DONE" as SlaStateKind,
  };
}

export { fullName };
