/**
 * TODO-174B (ADR-281/282/284) — Customer Shopping Balance / Store Credit · domain servisi.
 *
 * Framework-agnostik (prisma doğrudan). Domain hataları THROW EDİLMEZ → `{ ok:false, code }` sentinel;
 * route katmanı HTTP'ye eşler (fail-closed). Tüm sorgular storeId-first scoped. Değer hareketi
 * IMMUTABLE ledger'da (append-only); bakiye OTORİTESİ = Σ spendable lot remaining (ledger-calc).
 *
 * Concurrency: (store,customer) başına `pg_advisory_xact_lock` ile serialize. No negative balance:
 * FEFO tahsis kilit altında yeniden hesaplanır + koşullu lot güncellemesi (remaining>=take) ile çift
 * harcama engellenir. Idempotency: LedgerEntry @@unique([storeId, idempotencyKey]) — aynı key ikinci
 * hareket üretmez (P2002 → dedup). cachedAvailableMinor kilit altında lot'lardan yeniden türetilir.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type {
  CreditActorType,
  CreditLedgerType,
  CreditSourceType,
  PrismaClient,
} from "@prisma/client";
import {
  allocateFefo,
  availableBalanceMinor,
  computeExpiresAt,
  isValidExpiryDays,
  planRestore,
  planReturnRestore,
  type CreditExpiryDays,
  type CreditLotView,
} from "./ledger-calc.js";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * TODO-175 (ADR-286, Düzeltme B) — expiryDays=null (non-expiring) YALNIZ bu allowlist'teki
 * refund-origin sistem yollarında mümkün. Goodwill/admin/route asla non-expiring lot üretemez.
 */
export const REFUND_ORIGIN_SYSTEM_SOURCE_TYPES: ReadonlySet<CreditSourceType> = new Set([
  "ORDER_REFUND",
  "ORDER_CANCELLATION",
  "ORDER_RETURN",
]);

export type CreditErrorCode =
  | "INVALID_AMOUNT"
  | "INVALID_EXPIRY"
  | "POLICY_DISABLED"
  | "EXCEEDS_POLICY_LIMIT"
  | "ACCOUNT_NOT_FOUND"
  | "INSUFFICIENT_BALANCE"
  | "CURRENCY_MISMATCH";

export interface CreditActor {
  type: CreditActorType;
  id: string | null;
}

async function lockCustomer(tx: Tx, storeId: string, customerId: string): Promise<void> {
  // $executeRaw ($queryRaw DEĞİL): pg_advisory_xact_lock void döner. (store,customer) başına serialize.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credit:${storeId}:${customerId}`}))`;
}

/** ACTIVE lot'ları (FEFO/available için) storeId+customerId+currency scoped yükler. */
async function loadActiveLots(
  tx: Tx,
  storeId: string,
  customerId: string,
  currency: string,
): Promise<CreditLotView[]> {
  const rows = await tx.customerCreditLot.findMany({
    where: { storeId, customerId, currency, status: "ACTIVE" },
    select: { id: true, remainingAmountMinor: true, expiresAt: true, status: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    remainingAmountMinor: r.remainingAmountMinor,
    expiresAt: r.expiresAt,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

/** Hesabı upsert eder (yoksa oluşturur), id döner. */
async function getOrCreateAccountId(
  tx: Tx,
  storeId: string,
  customerId: string,
  currency: string,
): Promise<string> {
  const existing = await tx.customerCreditAccount.findUnique({
    where: { storeId_customerId_currency: { storeId, customerId, currency } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.customerCreditAccount.create({
    data: { storeId, customerId, currency },
    select: { id: true },
  });
  return created.id;
}

/** cachedAvailableMinor'ı ACTIVE lot'lardan kilit altında yeniden türetir (deterministik otorite). */
async function refreshCache(
  tx: Tx,
  accountId: string,
  storeId: string,
  customerId: string,
  currency: string,
  now: Date,
): Promise<bigint> {
  const lots = await loadActiveLots(tx, storeId, customerId, currency);
  const available = availableBalanceMinor(lots, now);
  await tx.customerCreditAccount.update({
    where: { id: accountId },
    data: { cachedAvailableMinor: available, version: { increment: 1 } },
  });
  return available;
}

// ---------------------------------------------------------------------------
// 1) CREDIT: goodwill / adjustment kredisi (admin + recovery). Top-level (kendi tx + kilit).
// ---------------------------------------------------------------------------

export interface IssueCreditParams {
  storeId: string;
  customerId: string;
  currency: string;
  amountMinor: bigint;
  /** 30/60/120/180 (goodwill). null = non-expiring (yalnız allowlisted refund-origin sistem yolu; TODO-175). */
  expiryDays: number | null;
  sourceType: CreditSourceType;
  sourceId?: string | null;
  ledgerType: CreditLedgerType;
  description: string;
  actor: CreditActor;
  idempotencyKey: string;
  /** TODO-175 — ledger entry order attribution (hareket geçmişinde OS-{orderNumber} çözümlemesi için). */
  orderId?: string | null;
  /** TODO-175 — expiryDays=null'ı allowlist ile yetkilendirir (SYSTEM aktör + refund-origin sourceType). */
  refundOriginSystemPath?: boolean;
  /** Politika sınırı (minor). null = özellik KAPALI (reddedilir). undefined = politika denetimi atla (sistem). */
  policyMaxMinor?: bigint | null;
  /** true → policyMaxMinor aşımı serbest (SUPER_ADMIN override). */
  overridePolicy?: boolean;
}

export type IssueCreditResult =
  | { ok: true; entryId: string; lotId: string; balanceAfterMinor: bigint; deduped: boolean }
  | { ok: false; code: CreditErrorCode };

/**
 * issueCredit'in tx-İÇİ çekirdeği. Mevcut bir transaction içinde (örn. iptal/return execution)
 * non-expiring refund-origin credit üretmek için kullanılır. Çağıran tx + (dolaylı) advisory lock
 * bağlamını sağlar; burada lockCustomer re-entrant olarak alınır. P2002 sarmalama YOK — çağıran tx'in
 * dedup okuması (advisory lock altında) idempotency'yi sağlar.
 */
export async function issueCreditInTx(tx: Tx, params: IssueCreditParams): Promise<IssueCreditResult> {
  const { storeId, customerId, currency, amountMinor } = params;
  if (amountMinor <= 0n) return { ok: false, code: "INVALID_AMOUNT" };
  // TODO-175: non-expiring (null) YALNIZ allowlisted refund-origin sistem yolunda; aksi INVALID_EXPIRY.
  if (params.expiryDays === null) {
    const allowed =
      params.refundOriginSystemPath === true &&
      params.actor.type === "SYSTEM" &&
      REFUND_ORIGIN_SYSTEM_SOURCE_TYPES.has(params.sourceType);
    if (!allowed) return { ok: false, code: "INVALID_EXPIRY" };
  } else if (!isValidExpiryDays(params.expiryDays)) {
    return { ok: false, code: "INVALID_EXPIRY" };
  }
  // Politika: undefined → sistem (atla). null → KAPALI. override yoksa sınır uygulanır.
  // Non-expiring refund-origin sistem yolunda politika denetimi anlamsız (atlanır).
  if (params.expiryDays !== null && params.policyMaxMinor !== undefined && !params.overridePolicy) {
    if (params.policyMaxMinor === null) return { ok: false, code: "POLICY_DISABLED" };
    if (amountMinor > params.policyMaxMinor) return { ok: false, code: "EXCEEDS_POLICY_LIMIT" };
  }
  const now = new Date();
  const expiresAt = params.expiryDays === null ? null : computeExpiresAt(now, params.expiryDays as CreditExpiryDays);

  await lockCustomer(tx, storeId, customerId);
  // Idempotency (dedup) — aynı key varsa mevcut hareketi döndür (sayfa refresh / retry güvenli).
  const dupe = await tx.customerCreditLedgerEntry.findUnique({
    where: { storeId_idempotencyKey: { storeId, idempotencyKey: params.idempotencyKey } },
    select: { id: true, lotId: true, balanceAfterMinor: true },
  });
  if (dupe) {
    return { ok: true as const, entryId: dupe.id, lotId: dupe.lotId ?? "", balanceAfterMinor: dupe.balanceAfterMinor, deduped: true };
  }
  const accountId = await getOrCreateAccountId(tx, storeId, customerId, currency);
  const lot = await tx.customerCreditLot.create({
    data: {
      storeId,
      customerId,
      accountId,
      currency,
      originalAmountMinor: amountMinor,
      remainingAmountMinor: amountMinor,
      expiresAt,
      status: "ACTIVE",
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      issuedByType: params.actor.type,
      issuedById: params.actor.id,
    },
    select: { id: true },
  });
  const available = await refreshCache(tx, accountId, storeId, customerId, currency, now);
  const entry = await tx.customerCreditLedgerEntry.create({
    data: {
      storeId,
      customerId,
      accountId,
      lotId: lot.id,
      type: params.ledgerType,
      direction: "CREDIT",
      amountMinor,
      balanceAfterMinor: available,
      currency,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      orderId: params.orderId ?? null,
      description: params.description,
      createdByType: params.actor.type,
      createdById: params.actor.id,
      idempotencyKey: params.idempotencyKey,
    },
    select: { id: true },
  });
  return { ok: true as const, entryId: entry.id, lotId: lot.id, balanceAfterMinor: available, deduped: false };
}

export async function issueCredit(params: IssueCreditParams): Promise<IssueCreditResult> {
  const { storeId, idempotencyKey } = params;
  try {
    return await prisma.$transaction((tx) => issueCreditInTx(tx, params));
  } catch (err) {
    // Yarış: aynı key iki eşzamanlı istek → unique ihlali → dedup okuması.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.customerCreditLedgerEntry.findUnique({
        where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
        select: { id: true, lotId: true, balanceAfterMinor: true },
      });
      if (existing) {
        return { ok: true, entryId: existing.id, lotId: existing.lotId ?? "", balanceAfterMinor: existing.balanceAfterMinor, deduped: true };
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 1b) ADMIN ADJUSTMENT: manuel düzeltme (CREDIT ekle / DEBIT çıkar). GÜÇLÜ YETKİ (SUPER_ADMIN;
//     route-seviyesi guard). CREDIT → issueCredit reuse (adjustment tipi, policy bypass). DEBIT →
//     FEFO azaltma + ADMIN_ADJUSTMENT_DEBIT (no-negative; idempotent — advisory lock serialize eder).
// ---------------------------------------------------------------------------

export interface AdjustBalanceParams {
  storeId: string;
  customerId: string;
  currency: string;
  direction: "CREDIT" | "DEBIT";
  amountMinor: bigint;
  /** İç neden kodu (audit); müşteri-facing ledger description'ı ayrıdır ("credit.adjustment"). */
  reason: string;
  note?: string | null;
  actor: CreditActor;
  idempotencyKey: string;
  /** CREDIT için zorunlu (grant expiry). DEBIT'te yoksayılır. */
  expiryDays?: number;
}

export type AdjustBalanceResult =
  | { ok: true; entryIds: string[]; deduped: boolean }
  | { ok: false; code: CreditErrorCode };

export async function adminAdjustBalance(params: AdjustBalanceParams): Promise<AdjustBalanceResult> {
  if (params.amountMinor <= 0n) return { ok: false, code: "INVALID_AMOUNT" };

  if (params.direction === "CREDIT") {
    // Adjustment CREDIT = issueCredit (adjustment tipi + policy bypass; expiry zorunlu).
    if (!isValidExpiryDays(params.expiryDays ?? -1)) return { ok: false, code: "INVALID_EXPIRY" };
    const res = await issueCredit({
      storeId: params.storeId,
      customerId: params.customerId,
      currency: params.currency,
      amountMinor: params.amountMinor,
      expiryDays: params.expiryDays as CreditExpiryDays,
      sourceType: "ADMIN_ADJUSTMENT",
      ledgerType: "ADMIN_ADJUSTMENT_CREDIT",
      description: "credit.adjustment",
      actor: params.actor,
      idempotencyKey: `adjust:${params.idempotencyKey}`,
      overridePolicy: true, // SUPER_ADMIN düzeltmesi; policy limitine tabi değil.
    });
    if (!res.ok) return res;
    return { ok: true, entryIds: [res.entryId], deduped: res.deduped };
  }

  // DEBIT: FEFO azaltma (bakiyeyi düşür). No-negative; advisory lock + koşullu guard.
  const { storeId, customerId, currency } = params;
  const groupKey = `adjust:${params.idempotencyKey}`;
  return prisma.$transaction(async (tx) => {
    await lockCustomer(tx, storeId, customerId);
    // Idempotency (kilit altında güvenilir): bu grup zaten işlendiyse dedup.
    const dupe = await tx.customerCreditLedgerEntry.findFirst({
      where: { storeId, groupKey },
      select: { id: true },
    });
    if (dupe) return { ok: true as const, entryIds: [], deduped: true };

    const account = await tx.customerCreditAccount.findUnique({
      where: { storeId_customerId_currency: { storeId, customerId, currency } },
      select: { id: true },
    });
    if (!account) return { ok: false as const, code: "ACCOUNT_NOT_FOUND" };

    const now = new Date();
    const lots = await loadActiveLots(tx, storeId, customerId, currency);
    const alloc = allocateFefo(lots, params.amountMinor, now);
    if (!alloc.ok) return { ok: false as const, code: "INSUFFICIENT_BALANCE" };

    const preAvailable = availableBalanceMinor(lots, now);
    let running = preAvailable;
    const entryIds: string[] = [];
    for (const a of alloc.allocations) {
      const updated = await tx.customerCreditLot.updateMany({
        where: { id: a.lotId, storeId, status: "ACTIVE", remainingAmountMinor: { gte: a.amountMinor } },
        data: { remainingAmountMinor: { decrement: a.amountMinor }, version: { increment: 1 } },
      });
      if (updated.count !== 1) return { ok: false as const, code: "INSUFFICIENT_BALANCE" };
      await tx.customerCreditLot.updateMany({
        where: { id: a.lotId, storeId, remainingAmountMinor: 0n, status: "ACTIVE" },
        data: { status: "CONSUMED" },
      });
      running -= a.amountMinor;
      const entry = await tx.customerCreditLedgerEntry.create({
        data: {
          storeId,
          customerId,
          accountId: account.id,
          lotId: a.lotId,
          type: "ADMIN_ADJUSTMENT_DEBIT",
          direction: "DEBIT",
          amountMinor: a.amountMinor,
          balanceAfterMinor: running,
          currency,
          sourceType: "ADMIN_ADJUSTMENT",
          description: "credit.adjustment",
          createdByType: params.actor.type,
          createdById: params.actor.id,
          groupKey,
          idempotencyKey: `${groupKey}:${a.lotId}`,
        },
        select: { id: true },
      });
      entryIds.push(entry.id);
    }
    await refreshCache(tx, account.id, storeId, customerId, currency, now);
    return { ok: true as const, entryIds, deduped: false };
  });
}

// ---------------------------------------------------------------------------
// 2) DEBIT: checkout harcaması (FEFO). Çağıranın tx'i İÇİNDE çalışır (placeOrder ile atomik).
// ---------------------------------------------------------------------------

export interface SpendCreditParams {
  storeId: string;
  customerId: string;
  currency: string;
  /** Harcanacak tutar; çağıran zaten min(available, payable) verir. 0 → no-op. */
  requestedMinor: bigint;
  orderId: string;
  actor: CreditActor;
  /** Ledger açıklaması (i18n değil; storefront'ta key ile render). */
  description: string;
}

export type SpendCreditResult =
  | { ok: true; usedMinor: bigint; groupKey: string; allocations: { lotId: string; amountMinor: bigint }[] }
  | { ok: false; code: CreditErrorCode };

export async function spendCreditInTx(tx: Tx, params: SpendCreditParams): Promise<SpendCreditResult> {
  const { storeId, customerId, currency, orderId } = params;
  const groupKey = `credit-spend:${orderId}`;
  if (params.requestedMinor <= 0n) {
    return { ok: true, usedMinor: 0n, groupKey, allocations: [] };
  }
  await lockCustomer(tx, storeId, customerId);

  const account = await tx.customerCreditAccount.findUnique({
    where: { storeId_customerId_currency: { storeId, customerId, currency } },
    select: { id: true },
  });
  if (!account) return { ok: false, code: "ACCOUNT_NOT_FOUND" };

  const now = new Date();
  const lots = await loadActiveLots(tx, storeId, customerId, currency);
  const alloc = allocateFefo(lots, params.requestedMinor, now);
  if (!alloc.ok) return { ok: false, code: "INSUFFICIENT_BALANCE" };

  const preAvailable = availableBalanceMinor(lots, now);
  let running = preAvailable;
  for (const a of alloc.allocations) {
    // Koşullu güncelleme (remaining>=take) — çift harcama / yarış savunması (kilit + guard).
    const updated = await tx.customerCreditLot.updateMany({
      where: { id: a.lotId, storeId, status: "ACTIVE", remainingAmountMinor: { gte: a.amountMinor } },
      data: {
        remainingAmountMinor: { decrement: a.amountMinor },
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) return { ok: false, code: "INSUFFICIENT_BALANCE" };
    // Lot bittiyse CONSUMED işaretle.
    await tx.customerCreditLot.updateMany({
      where: { id: a.lotId, storeId, remainingAmountMinor: 0n, status: "ACTIVE" },
      data: { status: "CONSUMED" },
    });
    running -= a.amountMinor;
    await tx.customerCreditLedgerEntry.create({
      data: {
        storeId,
        customerId,
        accountId: account.id,
        lotId: a.lotId,
        type: "ORDER_PAYMENT_DEBIT",
        direction: "DEBIT",
        amountMinor: a.amountMinor,
        balanceAfterMinor: running,
        currency,
        sourceType: "ORDER_PAYMENT",
        sourceId: orderId,
        orderId,
        groupKey,
        description: params.description,
        createdByType: params.actor.type,
        createdById: params.actor.id,
        idempotencyKey: `credit-spend:${orderId}:${a.lotId}`,
      },
    });
  }
  await refreshCache(tx, account.id, storeId, customerId, currency, now);
  return { ok: true, usedMinor: alloc.totalMinor, groupKey, allocations: alloc.allocations };
}

// ---------------------------------------------------------------------------
// 3) RESTORE: iptal/iade sonrası bakiye geri yükleme. Çağıranın tx'i İÇİNDE (cancellation ile atomik).
// ---------------------------------------------------------------------------

export interface RestoreCreditParams {
  storeId: string;
  customerId: string;
  currency: string;
  orderId: string;
  ledgerType: Extract<CreditLedgerType, "ORDER_CANCELLATION_RESTORE" | "REFUND_RESTORE">;
  sourceType: Extract<CreditSourceType, "ORDER_CANCELLATION" | "ORDER_REFUND">;
  actor: CreditActor;
  description: string;
}

export interface RestoreCreditResult {
  restoredMinor: bigint;
  skippedExpiredMinor: bigint;
  entriesCreated: number;
}

/**
 * Siparişin ORDER_PAYMENT_DEBIT hareketlerini lot bazında toplar; her lot için expiry hâlâ
 * gelecekteyse remaining geri yüklenir + lot ACTIVE'e döner (revive); süresi geçmişse revive YOK
 * (skippedExpired). Idempotent: her lot için `credit-restore:<orderId>:<lotId>` key; tekrar çağrıda
 * duplicate restore üretmez (P2002 → o lot atlanır).
 */
export async function restoreCreditForOrderInTx(
  tx: Tx,
  params: RestoreCreditParams,
): Promise<RestoreCreditResult> {
  const { storeId, customerId, currency, orderId } = params;
  await lockCustomer(tx, storeId, customerId);

  const account = await tx.customerCreditAccount.findUnique({
    where: { storeId_customerId_currency: { storeId, customerId, currency } },
    select: { id: true },
  });
  if (!account) return { restoredMinor: 0n, skippedExpiredMinor: 0n, entriesCreated: 0 };

  const debits = await tx.customerCreditLedgerEntry.findMany({
    where: { storeId, orderId, type: "ORDER_PAYMENT_DEBIT", direction: "DEBIT" },
    select: { lotId: true, amountMinor: true },
  });
  // Lot bazında topla (aynı lot birden çok debit taşımaz normalde ama savunmacı).
  const perLot = new Map<string, bigint>();
  for (const d of debits) {
    if (!d.lotId) continue;
    perLot.set(d.lotId, (perLot.get(d.lotId) ?? 0n) + d.amountMinor);
  }
  if (perLot.size === 0) return { restoredMinor: 0n, skippedExpiredMinor: 0n, entriesCreated: 0 };

  const now = new Date();
  const lotRows = await tx.customerCreditLot.findMany({
    where: { storeId, id: { in: [...perLot.keys()] } },
    select: { id: true, expiresAt: true },
  });
  const lotById = new Map(lotRows.map((l) => [l.id, { expiresAt: l.expiresAt }]));
  const decisions = planRestore(
    [...perLot.entries()].map(([lotId, amountMinor]) => ({ lotId, amountMinor })),
    lotById,
    now,
  );

  let restoredMinor = 0n;
  let skippedExpiredMinor = 0n;
  let entriesCreated = 0;
  for (const dec of decisions) {
    skippedExpiredMinor += dec.skippedExpiredMinor;
    if (dec.restoreMinor <= 0n) continue;
    const idempotencyKey = `credit-restore:${orderId}:${dec.lotId}`;
    // Idempotency guard: bu lot için restore zaten yazıldıysa atla.
    const exists = await tx.customerCreditLedgerEntry.findUnique({
      where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
      select: { id: true },
    });
    if (exists) continue;
    // Lot'u revive et: remaining geri yükle + ACTIVE (CONSUMED'dan dönebilir). Süresi geçmiş lot
    // buraya gelmez (planRestore skip etti) → yapay canlandırma YOK.
    await tx.customerCreditLot.updateMany({
      where: { id: dec.lotId, storeId },
      data: { remainingAmountMinor: { increment: dec.restoreMinor }, status: "ACTIVE", version: { increment: 1 } },
    });
    restoredMinor += dec.restoreMinor;
    entriesCreated += 1;
    // balanceAfter geçici; refreshCache sonrası doğru available zaten cache'te. Entry balanceAfter'ı
    // running olarak hesaplamak yerine restore sonrası nihai available'ı kullanacağız (aşağıda).
    await tx.customerCreditLedgerEntry.create({
      data: {
        storeId,
        customerId,
        accountId: account.id,
        lotId: dec.lotId,
        type: params.ledgerType,
        direction: "CREDIT",
        amountMinor: dec.restoreMinor,
        balanceAfterMinor: 0n, // aşağıda düzeltilir
        currency,
        sourceType: params.sourceType,
        sourceId: orderId,
        orderId,
        groupKey: `credit-restore:${orderId}`,
        description: params.description,
        createdByType: params.actor.type,
        createdById: params.actor.id,
        idempotencyKey,
      },
    });
  }
  const available = await refreshCache(tx, account.id, storeId, customerId, currency, now);
  // Bu restore grubunun balanceAfter'larını nihai available'a hizala (append-only; yalnız bu order'ın
  // henüz 0 bırakılmış restore satırları — deterministik son değer).
  if (entriesCreated > 0) {
    await tx.customerCreditLedgerEntry.updateMany({
      where: { storeId, orderId, type: params.ledgerType, balanceAfterMinor: 0n },
      data: { balanceAfterMinor: available },
    });
  }
  return { restoredMinor, skippedExpiredMinor, entriesCreated };
}

// ---------------------------------------------------------------------------
// 3b) TODO-175 (ADR-286): Onaylı return credit-origin KISMİ restore. Cancellation'dan FARKLI:
//     expired original lot değeri SKIP edilmez — cash'e çevrilmeden yeni NON-EXPIRING lot olarak
//     reissue edilir (değer kaybolmaz, ama STORE_CREDIT değeri de asla cash'e dönmez). Kısmi tutar
//     (amountMinor = split'in credit-origin bileşeni Rc) order'ın original lot'larına dağıtılır:
//     önce alive lot'lar revive (provenance/expiry korunur), kalan expired lot'lar reissue.
//     Per-original-lot cap: spent(ORDER_PAYMENT_DEBIT) − prior RETURN_CREDIT_RESTORE (sourceId=origLot).
//     Grup idempotency: groupKey `credit-return-restore:<returnId>` — tekrar çağrı no-op (aynı toplam).
// ---------------------------------------------------------------------------

export interface RestoreCreditAmountParams {
  storeId: string;
  customerId: string;
  currency: string;
  orderId: string;
  returnRequestId: string;
  amountMinor: bigint;
  actor: CreditActor;
}

export type RestoreCreditAmountResult =
  | { ok: true; restoredMinor: bigint; reissuedMinor: bigint; entriesCreated: number; deduped: boolean }
  | { ok: false; code: "EXCEEDS_RESTORABLE" };

export async function restoreCreditAmountForOrderInTx(
  tx: Tx,
  params: RestoreCreditAmountParams,
): Promise<RestoreCreditAmountResult> {
  const { storeId, customerId, currency, orderId, returnRequestId, amountMinor } = params;
  const now = new Date();
  if (amountMinor <= 0n) return { ok: true, restoredMinor: 0n, reissuedMinor: 0n, entriesCreated: 0, deduped: false };
  await lockCustomer(tx, storeId, customerId);

  const account = await tx.customerCreditAccount.findUnique({
    where: { storeId_customerId_currency: { storeId, customerId, currency } },
    select: { id: true },
  });
  if (!account) return { ok: false, code: "EXCEEDS_RESTORABLE" };

  const groupKey = `credit-return-restore:${returnRequestId}`;
  // Grup-seviyesi idempotency: bu return zaten işlendiyse mevcut satırlardan toplamları türet (no-op).
  const already = await tx.customerCreditLedgerEntry.findMany({
    where: { storeId, groupKey },
    select: { amountMinor: true, idempotencyKey: true },
  });
  if (already.length > 0) {
    let restoredMinor = 0n;
    let reissuedMinor = 0n;
    for (const e of already) {
      if (e.idempotencyKey.startsWith("return-credit-reissue:")) reissuedMinor += e.amountMinor;
      else restoredMinor += e.amountMinor;
    }
    return { ok: true, restoredMinor, reissuedMinor, entriesCreated: 0, deduped: true };
  }

  // Order'ın credit ödemesi (ORDER_PAYMENT_DEBIT) lot bazında.
  const debits = await tx.customerCreditLedgerEntry.findMany({
    where: { storeId, orderId, type: "ORDER_PAYMENT_DEBIT", direction: "DEBIT" },
    select: { lotId: true, amountMinor: true },
  });
  const spentPerLot = new Map<string, bigint>();
  for (const d of debits) {
    if (!d.lotId) continue;
    spentPerLot.set(d.lotId, (spentPerLot.get(d.lotId) ?? 0n) + d.amountMinor);
  }
  if (spentPerLot.size === 0) return { ok: false, code: "EXCEEDS_RESTORABLE" };

  // Bu order için önceki return restore/reissue'ları original lot'a (sourceId) göre topla.
  const priorReturns = await tx.customerCreditLedgerEntry.findMany({
    where: { storeId, orderId, type: "RETURN_CREDIT_RESTORE", direction: "CREDIT" },
    select: { sourceId: true, amountMinor: true },
  });
  const returnedPerLot = new Map<string, bigint>();
  for (const r of priorReturns) {
    if (!r.sourceId) continue;
    returnedPerLot.set(r.sourceId, (returnedPerLot.get(r.sourceId) ?? 0n) + r.amountMinor);
  }

  const lotRows = await tx.customerCreditLot.findMany({
    where: { storeId, id: { in: [...spentPerLot.keys()] } },
    select: { id: true, expiresAt: true },
  });
  const lotById = new Map<string, { expiresAt: Date | null }>(lotRows.map((l) => [l.id, { expiresAt: l.expiresAt }]));

  // Per-lot kalan restorable + alive; alive önce (expiry asc, null en sona), sonra expired.
  const lotEntries = [...spentPerLot.entries()]
    .map(([lotId, spent]) => {
      const remaining = spent - (returnedPerLot.get(lotId) ?? 0n);
      const exp = lotById.get(lotId)?.expiresAt ?? null;
      const alive = exp === null || exp.getTime() > now.getTime();
      return { lotId, remaining: remaining > 0n ? remaining : 0n, exp, alive };
    })
    .filter((e) => e.remaining > 0n);

  const totalRemaining = lotEntries.reduce((s, e) => s + e.remaining, 0n);
  if (amountMinor > totalRemaining) return { ok: false, code: "EXCEEDS_RESTORABLE" };

  lotEntries.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    const ax = a.exp === null ? Number.POSITIVE_INFINITY : a.exp.getTime();
    const bx = b.exp === null ? Number.POSITIVE_INFINITY : b.exp.getTime();
    if (ax !== bx) return ax - bx;
    return a.lotId < b.lotId ? -1 : a.lotId > b.lotId ? 1 : 0;
  });

  // amountMinor'ı lot'lara dağıt (kalan restorable ile sınırlı).
  const candidates: { lotId: string; amountMinor: bigint }[] = [];
  let remaining = amountMinor;
  for (const e of lotEntries) {
    if (remaining <= 0n) break;
    const take = e.remaining < remaining ? e.remaining : remaining;
    candidates.push({ lotId: e.lotId, amountMinor: take });
    remaining -= take;
  }

  const decisions = planReturnRestore(candidates, lotById, now);
  let restoredMinor = 0n;
  let reissuedMinor = 0n;
  let entriesCreated = 0;
  for (const dec of decisions) {
    if (dec.restoreMinor > 0n) {
      // Alive original lot: aynı lot'a revive (provenance/expiry korunur).
      await tx.customerCreditLot.updateMany({
        where: { id: dec.lotId, storeId },
        data: { remainingAmountMinor: { increment: dec.restoreMinor }, status: "ACTIVE", version: { increment: 1 } },
      });
      await tx.customerCreditLedgerEntry.create({
        data: {
          storeId,
          customerId,
          accountId: account.id,
          lotId: dec.lotId,
          type: "RETURN_CREDIT_RESTORE",
          direction: "CREDIT",
          amountMinor: dec.restoreMinor,
          balanceAfterMinor: 0n,
          currency,
          sourceType: "ORDER_RETURN",
          sourceId: dec.lotId, // original lot attribution (per-lot cap için)
          orderId,
          groupKey,
          description: "credit.returnCreditRestore",
          createdByType: params.actor.type,
          createdById: params.actor.id,
          idempotencyKey: `return-credit-restore:${returnRequestId}:${dec.lotId}`,
        },
      });
      restoredMinor += dec.restoreMinor;
      entriesCreated += 1;
    }
    if (dec.reissueMinor > 0n) {
      // Expired original lot: cash'e çevirmeden yeni NON-EXPIRING lot (değer korunur).
      const newLot = await tx.customerCreditLot.create({
        data: {
          storeId,
          customerId,
          accountId: account.id,
          currency,
          originalAmountMinor: dec.reissueMinor,
          remainingAmountMinor: dec.reissueMinor,
          expiresAt: null,
          status: "ACTIVE",
          sourceType: "ORDER_RETURN",
          sourceId: dec.lotId, // türetildiği original lot
          issuedByType: params.actor.type,
          issuedById: params.actor.id,
        },
        select: { id: true },
      });
      await tx.customerCreditLedgerEntry.create({
        data: {
          storeId,
          customerId,
          accountId: account.id,
          lotId: newLot.id,
          type: "RETURN_CREDIT_RESTORE",
          direction: "CREDIT",
          amountMinor: dec.reissueMinor,
          balanceAfterMinor: 0n,
          currency,
          sourceType: "ORDER_RETURN",
          sourceId: dec.lotId, // original lot attribution (per-lot cap için)
          orderId,
          groupKey,
          description: "credit.returnCreditReissued",
          createdByType: params.actor.type,
          createdById: params.actor.id,
          idempotencyKey: `return-credit-reissue:${returnRequestId}:${dec.lotId}`,
        },
      });
      reissuedMinor += dec.reissueMinor;
      entriesCreated += 1;
    }
  }

  const available = await refreshCache(tx, account.id, storeId, customerId, currency, now);
  if (entriesCreated > 0) {
    await tx.customerCreditLedgerEntry.updateMany({
      where: { storeId, groupKey, balanceAfterMinor: 0n },
      data: { balanceAfterMinor: available },
    });
  }
  return { ok: true, restoredMinor, reissuedMinor, entriesCreated, deduped: false };
}

/**
 * TODO-175 — Order'ın credit-origin restore edilebilir KALAN tutarı (minor):
 * Σ ORDER_PAYMENT_DEBIT(order) − Σ (ORDER_CANCELLATION_RESTORE + RETURN_CREDIT_RESTORE)(order).
 * Refund destination split'inin credit havuzu (Rc cap) buradan gelir. Read-only.
 */
export async function getOrderCreditRestorableMinor(tx: Tx, storeId: string, orderId: string): Promise<bigint> {
  const [debits, restores] = await Promise.all([
    tx.customerCreditLedgerEntry.aggregate({
      where: { storeId, orderId, type: "ORDER_PAYMENT_DEBIT", direction: "DEBIT" },
      _sum: { amountMinor: true },
    }),
    tx.customerCreditLedgerEntry.aggregate({
      where: { storeId, orderId, type: { in: ["ORDER_CANCELLATION_RESTORE", "RETURN_CREDIT_RESTORE"] }, direction: "CREDIT" },
      _sum: { amountMinor: true },
    }),
  ]);
  const spent = debits._sum.amountMinor ?? 0n;
  const restored = restores._sum.amountMinor ?? 0n;
  const remaining = spent - restored;
  return remaining > 0n ? remaining : 0n;
}

// ---------------------------------------------------------------------------
// 4) EXPIRE: worker housekeeping — süresi dolmuş lot'ları materialize et (available'a etkisi YOK,
//    zaten expiresAt>now ile hariç). Idempotent (status guard + per-lot idempotencyKey).
// ---------------------------------------------------------------------------

export async function expireLotsForStore(storeId: string, batchSize = 200): Promise<number> {
  const now = new Date();
  const due = await prisma.customerCreditLot.findMany({
    where: { storeId, status: "ACTIVE", remainingAmountMinor: { gt: 0n }, expiresAt: { lte: now } },
    select: { id: true, customerId: true, accountId: true, currency: true, remainingAmountMinor: true },
    take: batchSize,
  });
  let processed = 0;
  for (const lot of due) {
    await prisma.$transaction(async (tx) => {
      await lockCustomer(tx, storeId, lot.customerId);
      // Guard: hâlâ ACTIVE + süresi geçmiş mi (yarış: bu arada harcanmış/restore olmuş olabilir).
      const flipped = await tx.customerCreditLot.updateMany({
        where: { id: lot.id, storeId, status: "ACTIVE", expiresAt: { lte: new Date() }, remainingAmountMinor: { gt: 0n } },
        data: { status: "EXPIRED", version: { increment: 1 } },
      });
      if (flipped.count !== 1) return;
      const nowInner = new Date();
      const available = await refreshCache(tx, lot.accountId, storeId, lot.customerId, lot.currency, nowInner);
      await tx.customerCreditLedgerEntry.create({
        data: {
          storeId,
          customerId: lot.customerId,
          accountId: lot.accountId,
          lotId: lot.id,
          type: "EXPIRE",
          direction: "DEBIT",
          amountMinor: lot.remainingAmountMinor,
          balanceAfterMinor: available,
          currency: lot.currency,
          sourceType: "EXPIRY",
          sourceId: lot.id,
          description: "credit.expired",
          createdByType: "SYSTEM",
          createdById: null,
          idempotencyKey: `credit-expire:${lot.id}`,
        },
      });
      processed += 1;
    });
  }
  return processed;
}

/** Worker: süresi dolmuş lot'u olan mağazaları bulup her birini sweep eder. Toplam materialize sayısı döner. */
export async function sweepExpiredCreditAllStores(batchPerStore = 200): Promise<number> {
  const now = new Date();
  const due = await prisma.customerCreditLot.findMany({
    where: { status: "ACTIVE", remainingAmountMinor: { gt: 0n }, expiresAt: { lte: now } },
    select: { storeId: true },
    distinct: ["storeId"],
    take: 1000,
  });
  let total = 0;
  for (const { storeId } of due) {
    total += await expireLotsForStore(storeId, batchPerStore);
  }
  return total;
}

// ---------------------------------------------------------------------------
// 5) READ MODEL: bakiye + hareket geçmişi (storefront + admin). storeId-first scoped.
// ---------------------------------------------------------------------------

export interface CreditLedgerEntryView {
  id: string;
  type: CreditLedgerType;
  direction: "CREDIT" | "DEBIT";
  amountMinor: bigint;
  balanceAfterMinor: bigint;
  currency: string;
  description: string;
  orderId: string | null;
  createdAt: Date;
}

export interface CustomerBalanceView {
  currency: string;
  availableMinor: bigint;
  entries: CreditLedgerEntryView[];
}

/**
 * Müşteri bakiyesi + son hareketler. availableMinor ANLIK spendable (expiresAt>now); worker'dan
 * bağımsız (cache yerine lot'lardan türetilir → her zaman doğru). currency verilmezse mağaza para
 * biriminde tek hesap varsayımı: ilk/verilen currency. entries createdAt DESC, limit.
 */
export async function getCustomerBalance(
  storeId: string,
  customerId: string,
  currency: string,
  entryLimit = 50,
): Promise<CustomerBalanceView> {
  const now = new Date();
  const lots = await loadActiveLots(prisma, storeId, customerId, currency);
  const availableMinor = availableBalanceMinor(lots, now);
  const entryRows = await prisma.customerCreditLedgerEntry.findMany({
    where: { storeId, customerId, currency },
    orderBy: { createdAt: "desc" },
    take: entryLimit,
    select: {
      id: true,
      type: true,
      direction: true,
      amountMinor: true,
      balanceAfterMinor: true,
      currency: true,
      description: true,
      orderId: true,
      createdAt: true,
    },
  });
  return {
    currency,
    availableMinor,
    entries: entryRows.map((e) => ({
      id: e.id,
      type: e.type,
      direction: e.direction,
      amountMinor: e.amountMinor,
      balanceAfterMinor: e.balanceAfterMinor,
      currency: e.currency,
      description: e.description,
      orderId: e.orderId,
      createdAt: e.createdAt,
    })),
  };
}

/** Anlık kullanılabilir bakiye (minor) — checkout/read için hafif. */
export async function getAvailableBalanceMinor(
  tx: Tx,
  storeId: string,
  customerId: string,
  currency: string,
): Promise<bigint> {
  const now = new Date();
  const lots = await loadActiveLots(tx, storeId, customerId, currency);
  return availableBalanceMinor(lots, now);
}
