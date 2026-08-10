/**
 * TODO-177 (ADR-289) — Platform Admin question-set yönetim servisi (framework-agnostik).
 *
 * Platform-owned: store MUTATE EDEMEZ. Versioning: DRAFT düzenlenir, publish-time
 * `validateQuestionGraph` (cycle/dead-end/uncovered/…) geçen graf PUBLISHED olur. PUBLISHED
 * versiyon immutable (ticket'lar pinler). Transition/option key→id çözümü tek tx'te yapılır.
 */

import { prisma } from "@commerce-os/db";
import type { Prisma, SupportTopic } from "@prisma/client";
import { validateQuestionGraph } from "./question-engine.js";
import { projectGraph } from "./serialize.js";

type Err<C extends string> = { ok: false; code: C };

export interface QuestionInput {
  key: string;
  type: Prisma.SupportQuestionCreateManyInput["type"];
  prompt: string;
  helpText?: string | null;
  sortOrder: number;
  required?: boolean;
  isEntry?: boolean;
  options?: Array<{ key: string; label: string; sortOrder: number }>;
}
export interface TransitionInput {
  fromKey: string;
  matchKind: Prisma.SupportQuestionTransitionCreateManyInput["matchKind"];
  matchOptionKey?: string | null;
  action: Prisma.SupportQuestionTransitionCreateManyInput["action"];
  toKey?: string | null;
  sortOrder: number;
}

// ---------- question-set CRUD ----------

export async function listQuestionSets() {
  const sets = await prisma.supportQuestionSet.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      versions: { select: { version: true, status: true }, orderBy: { version: "desc" } },
    },
  });
  return sets.map((s) => ({
    id: s.id,
    key: s.key,
    title: s.title,
    description: s.description,
    isDefault: s.isDefault,
    status: s.status,
    latestPublishedVersion: s.versions.find((v) => v.status === "PUBLISHED")?.version ?? null,
    versionCount: s.versions.length,
  }));
}

export async function createQuestionSet(input: {
  key: string;
  title: string;
  description?: string;
  isDefault?: boolean;
}): Promise<{ ok: true; id: string } | Err<"KEY_TAKEN">> {
  const existing = await prisma.supportQuestionSet.findUnique({ where: { key: input.key }, select: { id: true } });
  if (existing) return { ok: false, code: "KEY_TAKEN" };
  const created = await prisma.supportQuestionSet.create({
    data: {
      key: input.key,
      title: input.title,
      description: input.description ?? null,
      isDefault: input.isDefault ?? false,
    },
    select: { id: true },
  });
  return { ok: true, id: created.id };
}

export async function updateQuestionSet(
  id: string,
  input: { title?: string; description?: string | null; status?: "ACTIVE" | "INACTIVE" },
): Promise<{ ok: true } | Err<"NOT_FOUND">> {
  const updated = await prisma.supportQuestionSet.updateMany({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
  return updated.count === 1 ? { ok: true } : { ok: false, code: "NOT_FOUND" };
}

export async function getQuestionSetDetail(id: string) {
  const set = await prisma.supportQuestionSet.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { version: "desc" },
        include: { questions: { include: { options: true } }, transitions: true },
      },
    },
  });
  if (!set) return null;
  return {
    id: set.id,
    key: set.key,
    title: set.title,
    description: set.description,
    isDefault: set.isDefault,
    status: set.status,
    latestPublishedVersion: set.versions.find((v) => v.status === "PUBLISHED")?.version ?? null,
    versionCount: set.versions.length,
    versions: set.versions.map((v) => {
      const g = projectGraph(v);
      return {
        id: v.id,
        version: v.version,
        status: v.status,
        publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
        questions: g.questions,
        transitions: g.transitions,
      };
    }),
  };
}

// ---------- versions ----------

export async function createVersion(
  questionSetId: string,
  cloneFromVersionId?: string,
): Promise<{ ok: true; versionId: string } | Err<"NOT_FOUND">> {
  return prisma.$transaction(async (tx) => {
    const set = await tx.supportQuestionSet.findUnique({ where: { id: questionSetId }, select: { id: true } });
    if (!set) return { ok: false, code: "NOT_FOUND" } as const;
    const max = await tx.supportQuestionSetVersion.aggregate({
      where: { questionSetId },
      _max: { version: true },
    });
    const nextVersion = (max._max.version ?? 0) + 1;
    const version = await tx.supportQuestionSetVersion.create({
      data: { questionSetId, version: nextVersion, status: "DRAFT" },
      select: { id: true },
    });
    if (cloneFromVersionId) {
      const src = await tx.supportQuestionSetVersion.findFirst({
        where: { id: cloneFromVersionId, questionSetId },
        include: { questions: { include: { options: true } }, transitions: true },
      });
      if (src) {
        const g = projectGraph(src);
        await persistDraftGraph(
          tx,
          version.id,
          g.questions.map((q) => ({ ...q, helpText: q.helpText })),
          g.transitions,
        );
      }
    }
    return { ok: true, versionId: version.id } as const;
  });
}

async function assertDraft(
  tx: Prisma.TransactionClient,
  versionId: string,
): Promise<{ ok: true; questionSetId: string } | Err<"NOT_FOUND" | "NOT_DRAFT">> {
  const v = await tx.supportQuestionSetVersion.findUnique({
    where: { id: versionId },
    select: { status: true, questionSetId: true },
  });
  if (!v) return { ok: false, code: "NOT_FOUND" };
  if (v.status !== "DRAFT") return { ok: false, code: "NOT_DRAFT" };
  return { ok: true, questionSetId: v.questionSetId };
}

async function persistDraftGraph(
  tx: Prisma.TransactionClient,
  versionId: string,
  questions: QuestionInput[],
  transitions: TransitionInput[],
): Promise<void> {
  // wipe existing (cascade removes options + transitions)
  await tx.supportQuestion.deleteMany({ where: { questionSetVersionId: versionId } });

  const questionIdByKey = new Map<string, string>();
  const optionIdByKey = new Map<string, string>(); // `${questionKey}:${optionKey}` -> id
  for (const q of questions) {
    const created = await tx.supportQuestion.create({
      data: {
        questionSetVersionId: versionId,
        key: q.key,
        type: q.type,
        prompt: q.prompt,
        helpText: q.helpText ?? null,
        sortOrder: q.sortOrder,
        required: q.required ?? true,
        isEntry: q.isEntry ?? false,
        options: q.options?.length
          ? { create: q.options.map((o) => ({ key: o.key, label: o.label, sortOrder: o.sortOrder })) }
          : undefined,
      },
      select: { id: true, options: { select: { id: true, key: true } } },
    });
    questionIdByKey.set(q.key, created.id);
    for (const o of created.options) optionIdByKey.set(`${q.key}:${o.key}`, o.id);
  }
  for (const t of transitions) {
    await tx.supportQuestionTransition.create({
      data: {
        questionSetVersionId: versionId,
        fromQuestionId: questionIdByKey.get(t.fromKey)!,
        matchKind: t.matchKind,
        matchOptionId:
          t.matchOptionKey != null ? (optionIdByKey.get(`${t.fromKey}:${t.matchOptionKey}`) ?? null) : null,
        action: t.action,
        toQuestionId: t.toKey ? (questionIdByKey.get(t.toKey) ?? null) : null,
        sortOrder: t.sortOrder,
      },
    });
  }
}

export async function editDraftVersion(
  versionId: string,
  input: { questions: QuestionInput[]; transitions: TransitionInput[] },
): Promise<{ ok: true } | Err<"NOT_FOUND" | "NOT_DRAFT">> {
  return prisma.$transaction(async (tx) => {
    const guard = await assertDraft(tx, versionId);
    if (!guard.ok) return guard;
    await persistDraftGraph(tx, versionId, input.questions, input.transitions);
    return { ok: true } as const;
  });
}

export async function validateVersion(versionId: string) {
  const v = await prisma.supportQuestionSetVersion.findUnique({
    where: { id: versionId },
    include: { questions: { include: { options: true } }, transitions: true },
  });
  if (!v) return { ok: false, errors: [{ code: "NOT_FOUND", detail: versionId }] };
  const g = projectGraph(v);
  const result = validateQuestionGraph({
    questions: g.questions.map((q) => ({
      key: q.key,
      type: q.type,
      isEntry: q.isEntry,
      optionKeys: q.options.map((o) => o.key),
    })),
    transitions: g.transitions,
  });
  return result.ok ? { ok: true, errors: [] } : { ok: false, errors: result.errors };
}

export async function publishVersion(
  versionId: string,
): Promise<{ ok: true } | Err<"NOT_FOUND" | "NOT_DRAFT" | "GRAPH_INVALID"> & { errors?: unknown[] }> {
  const validation = await validateVersion(versionId);
  if (!validation.ok) {
    if (validation.errors.some((e) => e.code === "NOT_FOUND")) return { ok: false, code: "NOT_FOUND" };
    return { ok: false, code: "GRAPH_INVALID", errors: validation.errors };
  }
  const updated = await prisma.supportQuestionSetVersion.updateMany({
    where: { id: versionId, status: "DRAFT" },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  return updated.count === 1 ? { ok: true } : { ok: false, code: "NOT_DRAFT" };
}

export async function archiveVersion(
  versionId: string,
): Promise<{ ok: true } | Err<"NOT_PUBLISHED">> {
  const updated = await prisma.supportQuestionSetVersion.updateMany({
    where: { id: versionId, status: "PUBLISHED" },
    data: { status: "ARCHIVED" },
  });
  return updated.count === 1 ? { ok: true } : { ok: false, code: "NOT_PUBLISHED" };
}

// ---------- mappings + topic defaults ----------

export async function upsertMapping(
  storeId: string,
  input: { scope: "PRODUCT" | "CATEGORY"; targetId: string; topic: SupportTopic; questionSetId: string },
): Promise<{ ok: true } | Err<"QUESTION_SET_NOT_FOUND">> {
  const set = await prisma.supportQuestionSet.findUnique({ where: { id: input.questionSetId }, select: { id: true } });
  if (!set) return { ok: false, code: "QUESTION_SET_NOT_FOUND" };
  await prisma.supportQuestionSetMapping.upsert({
    where: {
      storeId_scope_targetId_topic: {
        storeId,
        scope: input.scope,
        targetId: input.targetId,
        topic: input.topic,
      },
    },
    create: { storeId, scope: input.scope, targetId: input.targetId, topic: input.topic, questionSetId: input.questionSetId },
    update: { questionSetId: input.questionSetId },
  });
  return { ok: true };
}

export async function deleteMapping(
  storeId: string,
  input: { scope: "PRODUCT" | "CATEGORY"; targetId: string; topic: SupportTopic },
): Promise<{ ok: true }> {
  await prisma.supportQuestionSetMapping.deleteMany({
    where: { storeId, scope: input.scope, targetId: input.targetId, topic: input.topic },
  });
  return { ok: true };
}

export async function upsertTopicDefault(input: {
  topic: SupportTopic;
  questionSetId: string;
}): Promise<{ ok: true } | Err<"QUESTION_SET_NOT_FOUND">> {
  const set = await prisma.supportQuestionSet.findUnique({ where: { id: input.questionSetId }, select: { id: true } });
  if (!set) return { ok: false, code: "QUESTION_SET_NOT_FOUND" };
  await prisma.supportTopicDefault.upsert({
    where: { topic: input.topic },
    create: { topic: input.topic, questionSetId: input.questionSetId },
    update: { questionSetId: input.questionSetId },
  });
  return { ok: true };
}
