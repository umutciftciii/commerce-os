/**
 * TODO-178 §Lifecycle — Store→Platform request durum makinesi (SAF modul; Product Support
 * `status-map.ts` PARİTESİ, tablo/enum reuse YOK — yalnız desen).
 *
 * Statuler: OPEN, TRIAGED, IN_PROGRESS, WAITING_STORE, RESOLVED, CLOSED (CANCELLED YOK).
 * Aktörler: STORE (talep eden mağaza), PLATFORM (assignee/ops), SYSTEM (reply-driven otomasyon).
 *
 * İki kapı:
 *  - `evaluateTransition` → CLOSED HARİCİ status geçişleri (aktör-bazlı allowlist). CLOSED buradan
 *    ULAŞILAMAZ; kapanış DAİMA `evaluateClose`'dan geçer (closeReason zorunlu).
 *  - `evaluateClose` → kapanış + closeReason guard (aktör × from-state × reason).
 *  - `evaluateReopen` → yalnız talep eden mağaza, RESOLVED, 7 gün içinde (taze SLA döngüsü servis
 *    katmanında; IN_PROGRESS'e döner).
 */

import type { PlatformRequestStatus, PlatformRequestCloseReason } from "@prisma/client";

export type PlatformRequestActor = "STORE" | "PLATFORM" | "SYSTEM";

export type TransitionCode = "OK" | "INVALID_TRANSITION";
export type CloseCode = "OK" | "ALREADY_CLOSED" | "ACTOR_NOT_ALLOWED" | "INVALID_CLOSE_REASON";
export type ReopenCode =
  | "OK"
  | "CLOSED_CANNOT_REOPEN"
  | "INVALID_TRANSITION"
  | "NOT_OWNER"
  | "REOPEN_WINDOW_EXPIRED";

export const REOPEN_WINDOW_DAYS = 7;
const REOPEN_WINDOW_MS = REOPEN_WINDOW_DAYS * 86_400_000;

type Pair = `${PlatformRequestStatus}->${PlatformRequestStatus}`;

// Non-close geçişler (Faz B lifecycle kuralları). STORE'un doğrudan status geçişi YOKTUR
// (yalnız reply + withdraw/confirm/reopen). RESOLVED'dan çıkış yalnız `evaluateReopen`/reopenRequest
// ile (setStatus ile RESOLVED→IN_PROGRESS YOK); WAITING_STORE resolve etmez (önce IN_PROGRESS).
const PLATFORM_ALLOWED = new Set<Pair>([
  "OPEN->TRIAGED",
  "OPEN->IN_PROGRESS",
  "OPEN->WAITING_STORE",
  "OPEN->RESOLVED",
  "TRIAGED->IN_PROGRESS",
  "TRIAGED->WAITING_STORE",
  "TRIAGED->RESOLVED",
  "IN_PROGRESS->WAITING_STORE",
  "IN_PROGRESS->RESOLVED",
  "WAITING_STORE->IN_PROGRESS",
]);

// Store cevabı geldiğinde bekleyen request otomatik işe döner (server-authoritative).
const SYSTEM_ALLOWED = new Set<Pair>(["WAITING_STORE->IN_PROGRESS"]);

const ALLOWED_BY_ACTOR: Record<PlatformRequestActor, Set<Pair>> = {
  STORE: new Set<Pair>(),
  PLATFORM: PLATFORM_ALLOWED,
  SYSTEM: SYSTEM_ALLOWED,
};

export function evaluateTransition(
  from: PlatformRequestStatus,
  to: PlatformRequestStatus,
  actor: PlatformRequestActor,
): { ok: boolean; code: TransitionCode } {
  // CLOSED yalnız evaluateClose üzerinden (reason zorunlu) — burada asla izin verme.
  if (to === "CLOSED") return { ok: false, code: "INVALID_TRANSITION" };
  const pair = `${from}->${to}` as Pair;
  return ALLOWED_BY_ACTOR[actor].has(pair)
    ? { ok: true, code: "OK" }
    : { ok: false, code: "INVALID_TRANSITION" };
}

// Aktörün KULLANABİLECEĞİ kapanış nedenleri (from-state kısıtı ayrıca aşağıda uygulanır).
const CLOSE_REASONS_BY_ACTOR: Record<PlatformRequestActor, Set<PlatformRequestCloseReason>> = {
  STORE: new Set<PlatformRequestCloseReason>(["WITHDRAWN_BY_STORE", "COMPLETED"]),
  PLATFORM: new Set<PlatformRequestCloseReason>([
    "COMPLETED",
    "NOT_ACTIONABLE",
    "DUPLICATE",
    "REJECTED",
  ]),
  SYSTEM: new Set<PlatformRequestCloseReason>(),
};

const STORE_WITHDRAW_FROM = new Set<PlatformRequestStatus>(["OPEN", "TRIAGED", "WAITING_STORE"]);
const PLATFORM_OPERATIONAL_FROM = new Set<PlatformRequestStatus>([
  "OPEN",
  "TRIAGED",
  "IN_PROGRESS",
  "WAITING_STORE",
]);

/**
 * Kapanış değerlendirmesi. Sıra: ALREADY_CLOSED → aktör reason'a yetkili mi → reason from-state'te
 * geçerli mi. `COMPLETED` yalnız RESOLVED'dan; `WITHDRAWN_BY_STORE` yalnız STORE + aktif (OPEN/TRIAGED/
 * WAITING_STORE); operasyonel red nedenleri (NOT_ACTIONABLE/DUPLICATE/REJECTED) yalnız PLATFORM + aktif.
 */
export function evaluateClose(
  from: PlatformRequestStatus,
  actor: PlatformRequestActor,
  reason: PlatformRequestCloseReason,
): { ok: boolean; code: CloseCode } {
  if (from === "CLOSED") return { ok: false, code: "ALREADY_CLOSED" };
  if (!CLOSE_REASONS_BY_ACTOR[actor].has(reason)) return { ok: false, code: "ACTOR_NOT_ALLOWED" };

  // COMPLETED (her iki aktör de) yalnız RESOLVED'dan geçerlidir.
  if (reason === "COMPLETED") {
    return from === "RESOLVED"
      ? { ok: true, code: "OK" }
      : { ok: false, code: "INVALID_CLOSE_REASON" };
  }
  // Store withdraw: yalnız aktif ön durumlar (RESOLVED'dan withdraw yok — orada confirm-close vardır).
  if (reason === "WITHDRAWN_BY_STORE") {
    return STORE_WITHDRAW_FROM.has(from)
      ? { ok: true, code: "OK" }
      : { ok: false, code: "INVALID_CLOSE_REASON" };
  }
  // Platform operasyonel red: aktif ön durumlardan (RESOLVED'dan operasyonel-red beklenmez).
  return PLATFORM_OPERATIONAL_FROM.has(from)
    ? { ok: true, code: "OK" }
    : { ok: false, code: "INVALID_CLOSE_REASON" };
}

/**
 * Reopen değerlendirmesi. Sıra: CLOSED → RESOLVED-değil → owner-değil → pencere. (owner kontrolü
 * pencereden ÖNCE: canlı pencerede yabancı → NOT_OWNER; owner ama geç → EXPIRED.) Owner = talep eden
 * mağaza. Başarılıysa servis IN_PROGRESS'e döndürür + cycle+1 SLA snapshot'ı yazar.
 */
export function evaluateReopen(
  status: PlatformRequestStatus,
  resolvedAt: Date | null,
  now: Date,
  isOwnerStore: boolean,
): { ok: boolean; code: ReopenCode } {
  if (status === "CLOSED") return { ok: false, code: "CLOSED_CANNOT_REOPEN" };
  if (status !== "RESOLVED") return { ok: false, code: "INVALID_TRANSITION" };
  if (!isOwnerStore) return { ok: false, code: "NOT_OWNER" };
  if (resolvedAt == null) return { ok: false, code: "REOPEN_WINDOW_EXPIRED" };
  if (now.getTime() > resolvedAt.getTime() + REOPEN_WINDOW_MS)
    return { ok: false, code: "REOPEN_WINDOW_EXPIRED" };
  return { ok: true, code: "OK" };
}
