/**
 * ADR-289 (TODO-177) — Ürün Desteği topic-bazlı SLA politikası (platform-owned).
 *
 * SAF modul: `node:*` importu YOK, `process.env`e TOP-LEVEL erisim YOK (session-policy.ts deseni).
 * Boylece gateway (Node) + Next BFF (server) tarafindan guvenle import edilir ve pure fonksiyonlar
 * unit-test edilebilir. Store MUTATE EDEMEZ: politika yalniz burada (config) tanimlidir ve yalniz
 * sunucu tarafinda tuketilir → mağazanin mutasyon yolu YOK (platform-owned by construction).
 *
 * Iki hedef: first-response + resolution. Topic override yoksa `default` fallback kullanilir.
 *
 * NOT: `SupportTopic` union burada LOKAL tanimlidir — `packages/config`'in `@prisma/client`
 * bagimliligi yoktur (yalniz zod). Prisma `enum SupportTopic` ile BIREBIR ayni olmalidir;
 * `SUPPORT_TOPICS` listesi + testi drift'i yakalar.
 */

export type SupportTopic =
  | "PRODUCT_NOT_WORKING"
  | "DAMAGED_OR_MISSING"
  | "SETUP_USAGE"
  | "WARRANTY_SERVICE"
  | "PRODUCT_INFO"
  | "INVOICE_DOCUMENT"
  | "OTHER";

/** İterasyon/validasyon icin kanonik topic listesi (Prisma enum ile birebir). */
export const SUPPORT_TOPICS: readonly SupportTopic[] = [
  "PRODUCT_NOT_WORKING",
  "DAMAGED_OR_MISSING",
  "SETUP_USAGE",
  "WARRANTY_SERVICE",
  "PRODUCT_INFO",
  "INVOICE_DOCUMENT",
  "OTHER",
] as const;

export interface TicketSlaTarget {
  /** İlk yanit hedefi (saat). */
  firstResponseHours: number;
  /** Cozum hedefi (saat). */
  resolutionHours: number;
}

export interface TicketSlaPolicy {
  /** Topic override'i olmayan konular icin fallback. */
  default: TicketSlaTarget;
  /** Konu-bazli override'lar (kismi; eksik topic `default`e duser). */
  byTopic: Partial<Record<SupportTopic, TicketSlaTarget>>;
}

/**
 * Platform DEFAULT topic-SLA politikasi. Konular is oncelikleriyle ayarlanmistir:
 * hasarli/eksik + calismayan urun daha hizli; bilgi/fatura daha rahat. Hicbir topic
 * dead-end degildir (hepsi `default` veya override ile bir hedef alir).
 */
export const DEFAULT_TICKET_SLA_POLICY: TicketSlaPolicy = {
  default: { firstResponseHours: 24, resolutionHours: 72 },
  byTopic: {
    DAMAGED_OR_MISSING: { firstResponseHours: 8, resolutionHours: 48 },
    PRODUCT_NOT_WORKING: { firstResponseHours: 12, resolutionHours: 48 },
    WARRANTY_SERVICE: { firstResponseHours: 24, resolutionHours: 120 },
    PRODUCT_INFO: { firstResponseHours: 48, resolutionHours: 120 },
    INVOICE_DOCUMENT: { firstResponseHours: 24, resolutionHours: 72 },
  },
};

/** Verilen topic icin SLA hedefini cozer (override → default fallback). Asla null donmez. */
export function resolveTicketSlaTarget(
  policy: TicketSlaPolicy,
  topic: SupportTopic,
): TicketSlaTarget {
  return policy.byTopic[topic] ?? policy.default;
}

const HOUR_MS = 3_600_000;

/**
 * `now` + hedef saatlerden deterministik son tarihleri uretir. Pure: `now` mutasyona ugramaz.
 * Ticket create/reopen sirasinda `SupportSlaSnapshot`'a yazilir.
 */
export function computeTicketDueAts(
  now: Date,
  target: TicketSlaTarget,
): { firstResponseDueAt: Date; resolutionDueAt: Date } {
  const base = now.getTime();
  return {
    firstResponseDueAt: new Date(base + target.firstResponseHours * HOUR_MS),
    resolutionDueAt: new Date(base + target.resolutionHours * HOUR_MS),
  };
}
