/**
 * TODO-174B (ADR-283) — Order Experience Recovery Operations · domain servisi.
 *
 * Framework-agnostik; domain hataları `{ ok:false, code }` sentinel. storeId-first scoped. 1-2★ review →
 * OTOMATİK case (review create hook'unda); 3★ → yalnız MANUEL; 4-5★ → case yok. Review başına en fazla
 * bir case (@@unique(orderExperienceReviewId)). Append-only activity/history; internal note storefront'a
 * ASLA sızmaz. ProductReview/ProductRatingAggregate'e SIFIR dokunuş.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type {
  CreditActorType,
  RecoveryActivityType,
  RecoveryCaseStatus,
  RecoveryOutcome,
  RecoveryPriority,
  RecoveryResolutionType,
  PrismaClient,
} from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Aktif (henüz sonuçlanmamış) case statüleri — SLA/geciken hesabı ve KPI için. */
export const ACTIVE_RECOVERY_STATUSES: RecoveryCaseStatus[] = [
  "OPEN",
  "ASSIGNED",
  "CONTACT_ATTEMPTED",
  "CUSTOMER_REACHED",
  "ACTION_REQUIRED",
];

/** Terminal case statüleri (aksiyon kabul etmez; CLOSED tekrar açılmaz). */
export const TERMINAL_RECOVERY_STATUSES: RecoveryCaseStatus[] = [
  "RESOLVED",
  "CLOSED",
  "UNREACHABLE",
  "NO_ACTION_REQUIRED",
];

/** Rating → öncelik (1★=HIGH, 2★=MEDIUM, 3★ manuel=LOW). */
export function priorityForRating(rating: number): RecoveryPriority {
  if (rating <= 1) return "HIGH";
  if (rating === 2) return "MEDIUM";
  return "LOW";
}

/** Önceliğe göre SLA (saat): HIGH 24, MEDIUM 48, LOW 72. */
export function slaHoursForPriority(priority: RecoveryPriority): number {
  return priority === "HIGH" ? 24 : priority === "MEDIUM" ? 48 : 72;
}

function computeDueAt(openedAt: Date, priority: RecoveryPriority): Date {
  return new Date(openedAt.getTime() + slaHoursForPriority(priority) * 60 * 60 * 1000);
}

/**
 * Review için recovery case açar. auto=true (1-2★): otomatik; rating>=3 auto çağrıda no-op. manual=true
 * (3★): createdBy zorunlu, rating===3 dışında reddedilmez ama tipik 3★. Idempotent: review başına tek case
 * (@@unique) → varsa mevcut döner. Tx içinde çalışır (review create ile atomik) ya da standalone.
 */
export async function openRecoveryCaseForReview(
  tx: Tx,
  input: {
    storeId: string;
    orderExperienceReviewId: string;
    customerId: string;
    orderId: string;
    rating: number;
    mode: "AUTO" | "MANUAL";
    createdByPlatformUserId?: string | null;
    /** Backfill için: SLA'yı gerçek şikâyet (review) zamanından başlat. Yoksa şimdi. */
    openedAt?: Date;
  },
): Promise<{ id: string; created: boolean } | null> {
  // AUTO yalnız 1-2★; MANUAL yalnız 3★ (4-5★ hiçbir modda case açmaz).
  if (input.mode === "AUTO" && input.rating > 2) return null;
  if (input.mode === "MANUAL" && input.rating !== 3) return null;

  const existing = await tx.orderRecoveryCase.findUnique({
    where: { orderExperienceReviewId: input.orderExperienceReviewId },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const priority = priorityForRating(input.rating);
  const openedAt = input.openedAt ?? new Date();
  try {
    const kase = await tx.orderRecoveryCase.create({
      data: {
        storeId: input.storeId,
        orderExperienceReviewId: input.orderExperienceReviewId,
        customerId: input.customerId,
        orderId: input.orderId,
        status: "OPEN",
        priority,
        openedAt,
        dueAt: computeDueAt(openedAt, priority),
        createdByPlatformUserId: input.createdByPlatformUserId ?? null,
      },
      select: { id: true },
    });
    return { id: kase.id, created: true };
  } catch (err) {
    // Yarış: eşzamanlı auto+manual → unique ihlali → mevcut case.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const dupe = await tx.orderRecoveryCase.findUnique({
        where: { orderExperienceReviewId: input.orderExperienceReviewId },
        select: { id: true },
      });
      if (dupe) return { id: dupe.id, created: false };
    }
    throw err;
  }
}

/**
 * Backfill: `createOrderExperienceReview` (review-submit) auto-case açan `openRecoveryCaseForReview`'den
 * ÖNCE deploy edildiği için arada girmiş 1-2★ review'lar case'siz kaldı. Bu fonksiyon o orphan'ları
 * onarır. Idempotent (@@unique(orderExperienceReviewId) + openRecoveryCaseForReview mevcut case'i döner);
 * tekrar çalıştırmak yeni case üretmez. SLA gerçek şikâyet zamanından hesaplanır (openedAt=review.createdAt).
 * 3★ (manuel) ve 4-5★ (case gerekmez) kapsam DIŞI. storeId-scoped. apply=false → yalnız aday sayımı.
 */
export async function backfillMissingRecoveryCasesForStore(
  storeId: string,
  opts: { apply: boolean; createdByPlatformUserId?: string | null },
): Promise<{ scanned: number; created: number; skipped: number }> {
  const orphans = await prisma.orderExperienceReview.findMany({
    where: { storeId, rating: { lte: 2 }, recoveryCase: { is: null } },
    select: { id: true, customerId: true, orderId: true, rating: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (!opts.apply) return { scanned: orphans.length, created: 0, skipped: orphans.length };

  let created = 0;
  for (const r of orphans) {
    const res = await prisma.$transaction((tx) =>
      openRecoveryCaseForReview(tx, {
        storeId,
        orderExperienceReviewId: r.id,
        customerId: r.customerId,
        orderId: r.orderId,
        rating: r.rating,
        mode: "AUTO",
        openedAt: r.createdAt,
        createdByPlatformUserId: opts.createdByPlatformUserId ?? null,
      }),
    );
    if (res?.created) created += 1;
  }
  return { scanned: orphans.length, created, skipped: orphans.length - created };
}

// ---------------------------------------------------------------------------
// Lifecycle aksiyonları (append-only activity + version-guarded transition).
// ---------------------------------------------------------------------------

export type RecoveryActionType =
  | "ASSIGN"
  | "CONTACT_CALL"
  | "CONTACT_EMAIL"
  | "UNREACHABLE"
  | "ISSUE_HEARD"
  | "ACTION_REQUIRED"
  | "RESOLVE"
  | "CLOSE"
  | "NO_ACTION_REQUIRED"
  | "NOTE";

export type RecoveryErrorCode =
  | "CASE_NOT_FOUND"
  | "CASE_CLOSED"
  | "VERSION_CONFLICT"
  | "NOTE_REQUIRED"
  | "RESOLUTION_REQUIRED"
  | "ASSIGNEE_REQUIRED"
  // Faz E2 — "me" self-assign, linked PlatformUser'ı olmayan native StoreUser için geçersiz.
  | "ASSIGNEE_NOT_ALLOWED";

export interface RecoveryActionInput {
  storeId: string;
  caseId: string;
  action: RecoveryActionType;
  actorPlatformUserId: string;
  expectedVersion?: number;
  assigneePlatformUserId?: string | null;
  outcome?: RecoveryOutcome | null;
  resolutionType?: RecoveryResolutionType | null;
  note?: string | null;
}

export type RecoveryActionResult = { ok: true; caseId: string } | { ok: false; code: RecoveryErrorCode };

const ACTION_TO_ACTIVITY: Record<RecoveryActionType, RecoveryActivityType> = {
  ASSIGN: "ASSIGNED",
  CONTACT_CALL: "CONTACT_CALL",
  CONTACT_EMAIL: "CONTACT_EMAIL",
  UNREACHABLE: "UNREACHABLE",
  ISSUE_HEARD: "ISSUE_HEARD",
  ACTION_REQUIRED: "ACTION_REQUIRED",
  RESOLVE: "RESOLVED",
  CLOSE: "CLOSED",
  NO_ACTION_REQUIRED: "NOTE",
  NOTE: "NOTE",
};

const ACTION_TO_STATUS: Partial<Record<RecoveryActionType, RecoveryCaseStatus>> = {
  ASSIGN: "ASSIGNED",
  CONTACT_CALL: "CONTACT_ATTEMPTED",
  CONTACT_EMAIL: "CONTACT_ATTEMPTED",
  UNREACHABLE: "UNREACHABLE",
  ISSUE_HEARD: "CUSTOMER_REACHED",
  ACTION_REQUIRED: "ACTION_REQUIRED",
  RESOLVE: "RESOLVED",
  CLOSE: "CLOSED",
  NO_ACTION_REQUIRED: "NO_ACTION_REQUIRED",
  // NOTE: statü değiştirmez.
};

export async function applyRecoveryAction(input: RecoveryActionInput): Promise<RecoveryActionResult> {
  // OTHER outcome → note zorunlu; RESOLVE → resolutionType zorunlu; ASSIGN → assignee zorunlu.
  if (input.outcome === "OTHER" && !input.note?.trim()) return { ok: false, code: "NOTE_REQUIRED" };
  if (input.action === "RESOLVE" && !input.resolutionType) return { ok: false, code: "RESOLUTION_REQUIRED" };
  if (input.action === "ASSIGN" && !input.assigneePlatformUserId) return { ok: false, code: "ASSIGNEE_REQUIRED" };

  return prisma.$transaction(async (tx) => {
    const kase = await tx.orderRecoveryCase.findFirst({
      where: { id: input.caseId, storeId: input.storeId },
      select: { id: true, status: true, version: true, firstContactAt: true },
    });
    if (!kase) return { ok: false as const, code: "CASE_NOT_FOUND" };
    if (kase.status === "CLOSED") return { ok: false as const, code: "CASE_CLOSED" };

    const now = new Date();
    const nextStatus = ACTION_TO_STATUS[input.action];
    const data: Prisma.OrderRecoveryCaseUpdateManyMutationInput = {
      version: { increment: 1 },
      updatedByPlatformUserId: input.actorPlatformUserId,
    };
    if (nextStatus) data.status = nextStatus;
    if (input.action === "ASSIGN") {
      // Faz E2 — assignee MODELİ PlatformUser (dropdown = listAssignableUsers → linkedPlatformUserId).
      // "me" self-assign, acting StoreUser'ın KENDİ linkedPlatformUserId'sine çözülür (HAM StoreUser id
      // YAZILMAZ — aksi halde ad çözümü PlatformUser ile eşleşmez; TD-AUTH-002). Native/unlinked →
      // self-assign edilemez (dropdown da onları göstermez, tutarlı).
      if (input.assigneePlatformUserId === "me") {
        const self = await tx.storeUser.findUnique({
          where: { id: input.actorPlatformUserId },
          select: { linkedPlatformUserId: true },
        });
        if (!self?.linkedPlatformUserId) return { ok: false as const, code: "ASSIGNEE_NOT_ALLOWED" };
        data.assigneePlatformUserId = self.linkedPlatformUserId;
      } else {
        data.assigneePlatformUserId = input.assigneePlatformUserId;
      }
    }
    if ((input.action === "CONTACT_CALL" || input.action === "CONTACT_EMAIL") && !kase.firstContactAt) {
      data.firstContactAt = now;
    }
    if (input.action === "RESOLVE") {
      data.resolvedAt = now;
      data.resolutionType = input.resolutionType ?? undefined;
      if (input.note) data.resolutionNote = input.note;
    }
    if (input.action === "CLOSE") data.closedAt = now;

    const updated = await tx.orderRecoveryCase.updateMany({
      where:
        input.expectedVersion !== undefined
          ? { id: kase.id, storeId: input.storeId, version: input.expectedVersion }
          : { id: kase.id, storeId: input.storeId, version: kase.version },
      data,
    });
    if (updated.count !== 1) return { ok: false as const, code: "VERSION_CONFLICT" };

    await tx.orderRecoveryActivity.create({
      data: {
        storeId: input.storeId,
        recoveryCaseId: kase.id,
        type: ACTION_TO_ACTIVITY[input.action],
        // Faz E2 — aktör artık StoreUser (recovery route'ları StoreUser auth'a geçti). actorId
        // legacy-adlı `actorPlatformUserId` param'ıyla gelir (opak StoreUser id); type = STORE_USER.
        actorType: "STORE_USER" as CreditActorType,
        actorId: input.actorPlatformUserId,
        outcome: input.outcome ?? null,
        note: input.note?.trim() ? input.note.trim() : null,
      },
    });
    return { ok: true as const, caseId: kase.id };
  });
}

/** Recovery case'e goodwill kredi aktivitesi bağlar (credit route'undan çağrılır; append-only). */
export async function recordGoodwillCreditActivity(
  tx: Tx,
  input: { storeId: string; caseId: string; actorPlatformUserId: string; creditLedgerEntryId: string; amountLabel: string },
): Promise<void> {
  await tx.orderRecoveryActivity.create({
    data: {
      storeId: input.storeId,
      recoveryCaseId: input.caseId,
      type: "GOODWILL_CREDIT",
      // Faz E2 — StoreUser aktör (recovery StoreUser auth). actorId opak StoreUser id.
      actorType: "STORE_USER",
      actorId: input.actorPlatformUserId,
      creditLedgerEntryId: input.creditLedgerEntryId,
      note: input.amountLabel,
    },
  });
}
