/**
 * ADR-289 (TODO-177) §7 — Ticket durum gecis + reopen state machine (SAF modul).
 *
 * Statuler: OPEN, WAITING_STORE, WAITING_CUSTOMER, RESOLVED, CLOSED (CANCELLED YOK).
 * Gecisler aktor-bazli allowlist ile server-authoritative dogrulanir. Reopen ayri fonksiyondur
 * (yalniz owner musteri, RESOLVED, 7 gun icinde; taze SLA dongusu servis katmaninda yazilir).
 */

import type { SupportTicketStatus } from "@prisma/client";

export type SupportActor = "CUSTOMER" | "STORE_ADMIN" | "SYSTEM";

export type TransitionCode =
  | "OK"
  | "INVALID_TRANSITION"
  | "REOPEN_WINDOW_EXPIRED"
  | "CLOSED_CANNOT_REOPEN"
  | "NOT_OWNER";

export const REOPEN_WINDOW_DAYS = 7;
const REOPEN_WINDOW_MS = REOPEN_WINDOW_DAYS * 86_400_000;

type Pair = `${SupportTicketStatus}->${SupportTicketStatus}`;

const CUSTOMER_ALLOWED = new Set<Pair>([
  "OPEN->WAITING_STORE",
  "WAITING_CUSTOMER->WAITING_STORE",
]);

const STORE_ADMIN_ALLOWED = new Set<Pair>([
  "OPEN->WAITING_CUSTOMER",
  "OPEN->WAITING_STORE",
  "WAITING_STORE->WAITING_CUSTOMER",
  "WAITING_CUSTOMER->WAITING_STORE",
  "OPEN->RESOLVED",
  "WAITING_STORE->RESOLVED",
  "WAITING_CUSTOMER->RESOLVED",
  "OPEN->CLOSED",
  "WAITING_STORE->CLOSED",
  "WAITING_CUSTOMER->CLOSED",
  "RESOLVED->CLOSED",
]);

const SYSTEM_ALLOWED = new Set<Pair>([
  "OPEN->WAITING_CUSTOMER",
  "WAITING_STORE->WAITING_CUSTOMER",
]);

const ALLOWED_BY_ACTOR: Record<SupportActor, Set<Pair>> = {
  CUSTOMER: CUSTOMER_ALLOWED,
  STORE_ADMIN: STORE_ADMIN_ALLOWED,
  SYSTEM: SYSTEM_ALLOWED,
};

export function evaluateStatusTransition(
  from: SupportTicketStatus,
  to: SupportTicketStatus,
  actor: SupportActor,
): { ok: boolean; code: TransitionCode } {
  const pair = `${from}->${to}` as Pair;
  return ALLOWED_BY_ACTOR[actor].has(pair)
    ? { ok: true, code: "OK" }
    : { ok: false, code: "INVALID_TRANSITION" };
}

/**
 * Reopen degerlendirmesi. Sira: CLOSED → RESOLVED-degil → owner-degil → pencere.
 * (owner kontrolu pencereden ONCE: canli pencere icinde yabanci → NOT_OWNER; owner ama gec → EXPIRED.)
 */
export function evaluateReopen(
  status: SupportTicketStatus,
  resolvedAt: Date | null,
  now: Date,
  isOwner: boolean,
): { ok: boolean; code: TransitionCode } {
  if (status === "CLOSED") return { ok: false, code: "CLOSED_CANNOT_REOPEN" };
  if (status !== "RESOLVED") return { ok: false, code: "INVALID_TRANSITION" };
  if (!isOwner) return { ok: false, code: "NOT_OWNER" };
  if (resolvedAt == null) return { ok: false, code: "REOPEN_WINDOW_EXPIRED" };
  if (now.getTime() > resolvedAt.getTime() + REOPEN_WINDOW_MS)
    return { ok: false, code: "REOPEN_WINDOW_EXPIRED" };
  return { ok: true, code: "OK" };
}
