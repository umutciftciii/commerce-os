/**
 * TODO-178 — Store→Platform Request DTO projeksiyonları (allowlist; prisma satırı ASLA spread edilmez).
 *
 * İKİ AYRI projeksiyon (platform DTO filtrelenip reuse EDİLMEZ):
 *  - STORE projeksiyonu = allowlist; INTERNAL mesaj/ek YAPISAL olarak dışarıda; `visibility` alanı
 *    bile yoktur; SLA sadeleştirilmiş (cycle/policyLabel/internal debug alanı yok).
 *  - PLATFORM projeksiyonu = tam operasyonel yüzey (INTERNAL dahil, visibility + timeline + full SLA).
 *
 * HARD SECURITY INVARIANT: store payload'ına INTERNAL gövde/metadata/attachment ASLA girmez
 * (platform-request-serialize.test.ts ile kilitli).
 */

import type {
  PlatformRequest,
  PlatformRequestMessage,
  PlatformRequestHistory,
  PlatformRequestSlaSnapshot,
  PlatformRequestAttachment,
  PlatformRequestPriority,
  PlatformRequestCloseReason,
} from "@prisma/client";
import { slaStateFor, liveSlaSnapshot, type SlaStateKind } from "./sla.js";
import { evaluateReopen, evaluateClose } from "./status-map.js";

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const byCreatedAsc = (a: { createdAt: Date }, b: { createdAt: Date }) =>
  a.createdAt.getTime() - b.createdAt.getTime();

// contextSnapshot (Json) → allowlist'li okunur alanlar (serbest JSON sızmaz).
function projectContextSnapshot(
  value: unknown,
): { label?: string; reference?: string; detail?: string } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const out: { label?: string; reference?: string; detail?: string } = {};
  if (typeof v.label === "string") out.label = v.label;
  if (typeof v.reference === "string") out.reference = v.reference;
  if (typeof v.detail === "string") out.detail = v.detail;
  return Object.keys(out).length > 0 ? out : null;
}

const isTerminalStatus = (s: string): boolean => s === "RESOLVED" || s === "CLOSED";

// ---------- shared shapes ----------

export type MessageRow = Pick<
  PlatformRequestMessage,
  "id" | "authorType" | "visibility" | "body" | "createdAt"
>;

// Bilingual kategori referansı (TD-178-5). Operasyonel yüzeyde CURRENT (relation), audit'te FILED (snapshot).
export interface CategoryRef {
  key: string;
  labelTr: string;
  labelEn: string;
}
// CURRENT kategori = category relation'ı (recategorize'ı yansıtır). Snapshot DEĞİL (TD-178-4).
type CategoryRelation = { key: string; labelTr: string; labelEn: string };

const categoryRef = (c: CategoryRelation): CategoryRef => ({
  key: c.key,
  labelTr: c.labelTr,
  labelEn: c.labelEn,
});

// ---------- STORE projections ----------

/** HARD INVARIANT: INTERNAL mesajlar filtrelenir; `visibility` alanı çıktı DTO'sunda yer almaz. */
export function projectStoreMessages(rows: MessageRow[]): Array<{
  id: string;
  authorType: PlatformRequestMessage["authorType"];
  body: string;
  createdAt: string;
}> {
  return rows
    .filter((m) => m.visibility === "STORE_VISIBLE")
    .sort(byCreatedAsc)
    .map((m) => ({
      id: m.id,
      authorType: m.authorType,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    }));
}

// TODO-178 (Faz E) — Attachment projeksiyonu. `type` alanı yalnız PHOTO/PDF'e daraltılır; ham
// storageKey/mediaAssetId ASLA çıkmaz (yalnız güvenli `id` referansı UI serve path'i için).
export type AttachmentRow = Pick<
  PlatformRequestAttachment,
  "id" | "type" | "visibility" | "createdAt"
>;
const attType = (t: string): "PHOTO" | "PDF" => (t === "PDF" ? "PDF" : "PHOTO");

/** HARD INVARIANT: store yüzeyine YALNIZ STORE_VISIBLE ekler; INTERNAL count/preview bile sızmaz. */
export function projectStoreAttachments(rows: AttachmentRow[]) {
  return rows
    .filter((a) => a.visibility === "STORE_VISIBLE")
    .sort(byCreatedAsc)
    .map((a) => ({ id: a.id, type: attType(a.type), createdAt: a.createdAt.toISOString() }));
}

/** Platform yüzeyi: STORE_VISIBLE + INTERNAL ekler (visibility ile). */
export function projectPlatformAttachments(rows: AttachmentRow[]) {
  return [...rows]
    .sort(byCreatedAsc)
    .map((a) => ({
      id: a.id,
      type: attType(a.type),
      visibility: a.visibility,
      createdAt: a.createdAt.toISOString(),
    }));
}

export function projectStoreSla(
  snaps: PlatformRequestSlaSnapshot[],
  isTerminal: boolean,
  now: Date,
): {
  firstResponseState: SlaStateKind;
  firstResponseDueAt: string;
  resolutionState: SlaStateKind;
  resolutionDueAt: string;
} | null {
  const live = liveSlaSnapshot(snaps);
  if (!live) return null;
  return {
    firstResponseState: slaStateFor(live.firstResponseDueAt, live.firstResponseMetAt, now, isTerminal),
    firstResponseDueAt: live.firstResponseDueAt.toISOString(),
    resolutionState: slaStateFor(live.resolutionDueAt, live.resolvedAt, now, isTerminal),
    resolutionDueAt: live.resolutionDueAt.toISOString(),
  };
}

export type StoreListRow = Pick<
  PlatformRequest,
  "id" | "requestNumber" | "subject" | "status" | "priority" | "storeImpact" | "createdAt" | "lastActivityAt"
> & {
  category: CategoryRelation;
  slaSnapshots: PlatformRequestSlaSnapshot[];
  // TODO-178 (Faz D) — çözülmüş insan-okunur ad (raw id ASLA store DTO'suna girmez); atanmamış/silinmiş → null.
  assigneeName: string | null;
};

export function projectStoreListItem(row: StoreListRow, now: Date) {
  const terminal = isTerminalStatus(row.status);
  const live = liveSlaSnapshot(row.slaSnapshots);
  return {
    id: row.id,
    requestNumber: row.requestNumber,
    subject: row.subject,
    category: categoryRef(row.category),
    status: row.status,
    priority: row.priority,
    storeImpact: row.storeImpact,
    assigneeName: row.assigneeName,
    // Sadeleştirilmiş SLA: yalnız live cycle durumları (dueAt/policy YOK); snapshot yoksa null.
    sla: live
      ? {
          firstResponseState: slaStateFor(live.firstResponseDueAt, live.firstResponseMetAt, now, terminal),
          resolutionState: slaStateFor(live.resolutionDueAt, live.resolvedAt, now, terminal),
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
  };
}

// ---------- STORE audit timeline (AYRI allowlist; platform history reuse EDİLMEZ) ----------

// Store'a görünmesine izin verilen lifecycle event'leri → normalize edilmiş store event tipi.
// LİSTEDE OLMAYAN her eventType (REQUEST_STORE_REPLY / REQUEST_PLATFORM_REPLY / REQUEST_INTERNAL_NOTE
// ve gelecekteki bilinmeyenler) store timeline'a HİÇ GİRMEZ (internal not existence leak'i imkânsız).
const STORE_PRIORITY_SET = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);
const STORE_CLOSE_REASON_SET = new Set([
  "COMPLETED",
  "WITHDRAWN_BY_STORE",
  "NOT_ACTIONABLE",
  "DUPLICATE",
  "REJECTED",
]);
const asPriority = (v: unknown): PlatformRequestPriority | null =>
  typeof v === "string" && STORE_PRIORITY_SET.has(v) ? (v as PlatformRequestPriority) : null;
const asCloseReason = (v: unknown): PlatformRequestCloseReason | null =>
  typeof v === "string" && STORE_CLOSE_REASON_SET.has(v) ? (v as PlatformRequestCloseReason) : null;

export type StoreHistoryRow = Pick<
  PlatformRequestHistory,
  "id" | "eventType" | "fromStatus" | "toStatus" | "actorType" | "createdAt"
> & { metadata: unknown };

/**
 * Store audit timeline projeksiyonu. HARD SECURITY: `note`, ham `metadata`, `actorId` (UUID) ÇIKTIYA
 * ASLA girmez; yalnız güvenli türetimler (status/priority label'a çevrilecek enum, resolve edilmiş
 * assignee ADI, kategori referansı, closeReason). Bilinmeyen/mesaj event'leri filtrelenir.
 */
export function projectStoreTimeline(
  rows: StoreHistoryRow[],
  assigneeNameById: Map<string, string>,
  categoryById: Map<string, CategoryRelation>,
) {
  const out: Array<{
    id: string;
    event: string;
    actorType: PlatformRequestHistory["actorType"];
    fromStatus: PlatformRequest["status"] | null;
    toStatus: PlatformRequest["status"] | null;
    fromPriority: PlatformRequestPriority | null;
    toPriority: PlatformRequestPriority | null;
    category: CategoryRef | null;
    assigneeName: string | null;
    closeReason: PlatformRequestCloseReason | null;
    createdAt: string;
  }> = [];
  for (const row of [...rows].sort(byCreatedAsc)) {
    const meta =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    const base = {
      id: row.id,
      actorType: row.actorType,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      fromPriority: null as PlatformRequestPriority | null,
      toPriority: null as PlatformRequestPriority | null,
      category: null as CategoryRef | null,
      assigneeName: null as string | null,
      closeReason: null as PlatformRequestCloseReason | null,
      createdAt: row.createdAt.toISOString(),
    };
    switch (row.eventType) {
      case "REQUEST_OPENED":
        out.push({ ...base, event: "CREATED" });
        break;
      case "REQUEST_ASSIGNED": {
        const id = typeof meta.assigneePlatformUserId === "string" ? meta.assigneePlatformUserId : null;
        out.push({
          ...base,
          event: id ? "ASSIGNED" : "UNASSIGNED",
          assigneeName: id ? assigneeNameById.get(id) ?? null : null,
        });
        break;
      }
      case "REQUEST_PRIORITY_CHANGED":
        out.push({
          ...base,
          event: "PRIORITY_CHANGED",
          fromPriority: asPriority(meta.from),
          toPriority: asPriority(meta.to),
        });
        break;
      case "REQUEST_RECATEGORIZED": {
        const toId = typeof meta.toCategoryId === "string" ? meta.toCategoryId : null;
        const cat = toId ? categoryById.get(toId) ?? null : null;
        out.push({ ...base, event: "CATEGORY_CHANGED", category: cat ? categoryRef(cat) : null });
        break;
      }
      case "REQUEST_CLOSED": {
        const reason = asCloseReason(meta.closeReason);
        out.push({ ...base, event: reason === "WITHDRAWN_BY_STORE" ? "WITHDRAWN" : "CLOSED", closeReason: reason });
        break;
      }
      case "REQUEST_RESOLVED":
        out.push({ ...base, event: "RESOLVED" });
        break;
      case "REQUEST_REOPENED":
        out.push({ ...base, event: "REOPENED" });
        break;
      case "REQUEST_STATUS_TRIAGED":
      case "REQUEST_STATUS_IN_PROGRESS":
      case "REQUEST_STATUS_WAITING_STORE":
      case "REQUEST_STATUS_OPEN":
        out.push({ ...base, event: "STATUS_CHANGED" });
        break;
      default:
        // REQUEST_STORE_REPLY / REQUEST_PLATFORM_REPLY / REQUEST_INTERNAL_NOTE / bilinmeyen → HARİÇ.
        break;
    }
  }
  return out;
}

export type StoreRequestDetailRow = PlatformRequest & {
  category: CategoryRelation;
  messages: MessageRow[];
  slaSnapshots: PlatformRequestSlaSnapshot[];
};

export function projectStoreRequestDetail(
  row: StoreRequestDetailRow,
  assigneeName: string | null,
  timeline: ReturnType<typeof projectStoreTimeline>,
  attachments: ReturnType<typeof projectStoreAttachments>,
  now: Date,
) {
  const terminal = isTerminalStatus(row.status);
  const reopen = evaluateReopen(row.status, row.resolvedAt, now, true);
  const withdraw = evaluateClose(row.status, "STORE", "WITHDRAWN_BY_STORE");
  const confirm = evaluateClose(row.status, "STORE", "COMPLETED");
  return {
    id: row.id,
    requestNumber: row.requestNumber,
    subject: row.subject,
    description: row.description,
    category: categoryRef(row.category), // CURRENT (TD-178-4)
    status: row.status,
    priority: row.priority,
    storeImpact: row.storeImpact,
    // TODO-178 (Faz D) — insan-okunur ad (raw id ASLA); atanmamış/silinmiş → null (güvenli fallback).
    assigneeName,
    contextKind: row.contextKind,
    contextSnapshot: projectContextSnapshot(row.contextSnapshot),
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    resolvedAt: iso(row.resolvedAt),
    closedAt: iso(row.closedAt),
    closeReason: row.closeReason,
    reopenCount: row.reopenCount,
    version: row.version,
    canReopen: reopen.ok,
    canWithdraw: withdraw.ok,
    canConfirmClose: confirm.ok,
    messages: projectStoreMessages(row.messages),
    attachments,
    timeline,
    sla: projectStoreSla(row.slaSnapshots, terminal, now),
  };
}

// ---------- PLATFORM projections (full) ----------

export function projectPlatformMessages(rows: MessageRow[]): Array<{
  id: string;
  authorType: PlatformRequestMessage["authorType"];
  visibility: PlatformRequestMessage["visibility"];
  body: string;
  createdAt: string;
}> {
  return rows.sort(byCreatedAsc).map((m) => ({
    id: m.id,
    authorType: m.authorType,
    visibility: m.visibility,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  }));
}

export function projectPlatformSla(
  snaps: PlatformRequestSlaSnapshot[],
  isTerminal: boolean,
  now: Date,
): {
  cycle: number;
  firstResponseDueAt: string;
  firstResponseState: SlaStateKind;
  resolutionDueAt: string;
  resolutionState: SlaStateKind;
} | null {
  const live = liveSlaSnapshot(snaps);
  if (!live) return null;
  return {
    cycle: live.cycle,
    firstResponseDueAt: live.firstResponseDueAt.toISOString(),
    firstResponseState: slaStateFor(live.firstResponseDueAt, live.firstResponseMetAt, now, isTerminal),
    resolutionDueAt: live.resolutionDueAt.toISOString(),
    resolutionState: slaStateFor(live.resolutionDueAt, live.resolvedAt, now, isTerminal),
  };
}

export function projectPlatformTimeline(rows: PlatformRequestHistory[]) {
  return [...rows].sort(byCreatedAsc).map((h) => ({
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actorType: h.actorType,
    eventType: h.eventType,
    note: h.note,
    createdAt: h.createdAt.toISOString(),
  }));
}

export type PlatformListRow = Pick<
  PlatformRequest,
  "id" | "requestNumber" | "storeId" | "subject" | "priority" | "status" | "assigneePlatformUserId" | "lastActivityAt"
> & {
  category: CategoryRelation;
  slaSnapshots: PlatformRequestSlaSnapshot[];
  storeName: string;
  assigneeName: string | null;
};

export function projectPlatformListItem(row: PlatformListRow, now: Date) {
  const terminal = isTerminalStatus(row.status);
  const live = liveSlaSnapshot(row.slaSnapshots);
  return {
    requestId: row.id,
    requestNumber: row.requestNumber,
    storeId: row.storeId,
    storeName: row.storeName,
    category: categoryRef(row.category), // CURRENT (TD-178-4)
    subject: row.subject,
    priority: row.priority,
    status: row.status,
    assigneePlatformUserId: row.assigneePlatformUserId,
    assigneeName: row.assigneeName,
    firstResponseState: live
      ? slaStateFor(live.firstResponseDueAt, live.firstResponseMetAt, now, terminal)
      : ("DONE" as SlaStateKind),
    resolutionState: live
      ? slaStateFor(live.resolutionDueAt, live.resolvedAt, now, terminal)
      : ("DONE" as SlaStateKind),
    lastActivityAt: row.lastActivityAt.toISOString(),
  };
}

export type PlatformRequestDetailRow = PlatformRequest & {
  category: CategoryRelation;
  messages: MessageRow[];
  slaSnapshots: PlatformRequestSlaSnapshot[];
  timeline: PlatformRequestHistory[];
};

export function projectPlatformRequestDetail(
  row: PlatformRequestDetailRow,
  assigneeName: string | null,
  storeName: string,
  attachments: ReturnType<typeof projectPlatformAttachments>,
  now: Date,
) {
  const terminal = isTerminalStatus(row.status);
  return {
    requestId: row.id,
    requestNumber: row.requestNumber,
    storeId: row.storeId,
    storeName,
    categoryId: row.categoryId,
    // CURRENT kategori (operasyonel; TD-178-4) + FILED snapshot (audit; bilingual TD-178-5).
    category: categoryRef(row.category),
    filedCategory: {
      key: row.categoryKey,
      labelTr: row.categoryLabel,
      labelEn: row.categoryLabelEn,
    },
    subject: row.subject,
    description: row.description,
    status: row.status,
    priority: row.priority,
    storeImpact: row.storeImpact,
    contextKind: row.contextKind,
    contextSnapshot: projectContextSnapshot(row.contextSnapshot),
    version: row.version,
    createdByName: row.createdByName,
    createdByEmail: row.createdByEmail,
    assigneePlatformUserId: row.assigneePlatformUserId,
    assigneeName,
    firstResponseAt: iso(row.firstResponseAt),
    resolvedAt: iso(row.resolvedAt),
    closedAt: iso(row.closedAt),
    closeReason: row.closeReason,
    reopenCount: row.reopenCount,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    messages: projectPlatformMessages(row.messages),
    attachments,
    timeline: projectPlatformTimeline(row.timeline),
    sla: projectPlatformSla(row.slaSnapshots, terminal, now),
  };
}
