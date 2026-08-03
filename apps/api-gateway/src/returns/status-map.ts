import type { ReturnStatus, ReturnActorType } from "@prisma/client";

/**
 * TODO-169 (ADR-269) — İade talebi yaşam döngüsü SAF state-machine'i.
 *
 * Route'lar dağınık `if` zinciri kurmaz; her geçiş bu tek otoriteden geçer
 * (evaluateReturnTransition). Kurallar (ADR-269 §4):
 *  - Yalnız izinli (from → to) geçişleri kabul edilir; aksi ILLEGAL_TRANSITION (fail-closed).
 *  - Terminal durumlar immutable (REJECTED/CANCELLED_BY_CUSTOMER/EXPIRED/CLOSED).
 *  - Her geçişin izinli AKTÖR kümesi vardır (müşteri yalnız iptal + kargo-verildi; sistem yalnız
 *    süre-doldu; kalan operasyonel geçişler admin).
 *  - Müşteri iptali YALNIZ onay öncesi (REQUESTED/UNDER_REVIEW).
 *  - REFUND_PENDING/REPLACEMENT_PENDING finansal iade YAPILDI anlamına GELMEZ (operasyonel durum).
 *  - COMPLETED yalnız sonuç doğrulandıktan sonra (TODO-170); bu fazda REFUND_PENDING/…_PENDING →
 *    CLOSED ile arşivlenir; COMPLETED geçişi TODO-170'e kapılıdır.
 */

export const RETURN_TERMINAL_STATUSES: ReturnStatus[] = [
  "REJECTED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED",
  "CLOSED",
];

/** İzinli geçiş tablosu (from → izinli to kümesi). Terminal durumların boş kümesi vardır. */
export const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: [
    "UNDER_REVIEW",
    "APPROVED",
    "PARTIALLY_APPROVED",
    "REJECTED",
    "CANCELLED_BY_CUSTOMER",
    "EXPIRED",
  ],
  UNDER_REVIEW: [
    "APPROVED",
    "PARTIALLY_APPROVED",
    "REJECTED",
    "CANCELLED_BY_CUSTOMER",
    "EXPIRED",
  ],
  APPROVED: ["AWAITING_SHIPMENT"],
  PARTIALLY_APPROVED: ["AWAITING_SHIPMENT"],
  AWAITING_SHIPMENT: ["RETURN_SHIPPED", "EXPIRED"],
  RETURN_SHIPPED: ["RECEIVED"],
  RECEIVED: ["INSPECTION_REQUIRED", "INSPECTED"],
  INSPECTION_REQUIRED: ["INSPECTED"],
  INSPECTED: ["REFUND_PENDING", "REPLACEMENT_PENDING", "REJECTED"],
  REFUND_PENDING: ["COMPLETED", "CLOSED"],
  REPLACEMENT_PENDING: ["COMPLETED", "CLOSED"],
  COMPLETED: ["CLOSED"],
  REJECTED: [],
  CANCELLED_BY_CUSTOMER: [],
  EXPIRED: [],
  CLOSED: [],
};

// Geçiş → izinli aktör(ler). Anahtar `${from}->${to}`. Listelenmeyen geçiş yalnız ADMIN'e açıktır.
const CUSTOMER_TRANSITIONS = new Set<string>([
  "REQUESTED->CANCELLED_BY_CUSTOMER",
  "UNDER_REVIEW->CANCELLED_BY_CUSTOMER",
  "AWAITING_SHIPMENT->RETURN_SHIPPED",
]);

const SYSTEM_TRANSITIONS = new Set<string>([
  "REQUESTED->EXPIRED",
  "UNDER_REVIEW->EXPIRED",
  "AWAITING_SHIPMENT->EXPIRED",
]);

export type ReturnTransitionRejection =
  | "ILLEGAL_TRANSITION"
  | "TERMINAL"
  | "NO_CHANGE"
  | "ACTOR_NOT_ALLOWED";

/**
 * Bir (from → to) geçişinin verilen aktör tarafından yapılıp yapılamayacağını belirleyen SAF kural.
 * Sağlayıcıya/DB'ye çağrı YOK. İllegal geçiş fail-closed reddedilir.
 */
export function evaluateReturnTransition(
  from: ReturnStatus,
  to: ReturnStatus,
  actor: ReturnActorType,
): { ok: true } | { ok: false; reason: ReturnTransitionRejection } {
  if (from === to) {
    return { ok: false, reason: "NO_CHANGE" };
  }
  if (RETURN_TERMINAL_STATUSES.includes(from)) {
    return { ok: false, reason: "TERMINAL" };
  }
  if (!RETURN_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: "ILLEGAL_TRANSITION" };
  }
  const key = `${from}->${to}`;
  const allowedActor = transitionActor(key);
  if (!isActorAllowed(actor, allowedActor)) {
    return { ok: false, reason: "ACTOR_NOT_ALLOWED" };
  }
  return { ok: true };
}

type AllowedActor = "CUSTOMER" | "SYSTEM" | "ADMIN";

function transitionActor(key: string): AllowedActor {
  if (CUSTOMER_TRANSITIONS.has(key)) return "CUSTOMER";
  if (SYSTEM_TRANSITIONS.has(key)) return "SYSTEM";
  return "ADMIN";
}

// ADMIN aktörü müşteri/sistem geçişlerini de yapabilir mi? HAYIR — yetki ayrımı korunur:
// müşteri iptali yalnız müşteriden, süre-doldu yalnız sistemden. Bu, admin'in müşteri adına
// "iptal etti" gibi yanıltıcı bir geçiş yazmasını önler (dürüst audit trail).
function isActorAllowed(actor: ReturnActorType, allowed: AllowedActor): boolean {
  return actor === allowed;
}

/** Bir durumdan hâlâ ilerlenebilir mi (terminal değilse)? */
export function isTerminalReturnStatus(status: ReturnStatus): boolean {
  return RETURN_TERMINAL_STATUSES.includes(status);
}
