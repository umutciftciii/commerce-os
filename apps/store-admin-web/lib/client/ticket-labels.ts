/**
 * TODO-177 (ADR-289) Faz E — Store Admin Ürün Desteği için paylaşılan i18n etiket modülü.
 *
 * TEK KURAL: ham enum ASLA UI'a çıkmaz. İnbox + detay + filtre buradan beslenir (çift tanım yok).
 * Bilinmeyen (ileride eklenen) değer defansif olarak okunur biçime çevrilir. SLA rozeti renk-dışı
 * metinle de anlatılır (label + tone). `recovery-labels.ts` deseninin birebir eşleniği.
 */
export type Tone = "neutral" | "success" | "warning" | "info" | "danger";

/** SLA durum türü — gateway `supportSlaStateSchema` ile aynı değer kümesi (DTO string'leri). */
export type SlaStateKind = "INSIDE" | "DUE_TODAY" | "OVERDUE" | "DONE";

const pick = (v: [string, string] | undefined, tr: boolean, fallback: string): string =>
  v ? (tr ? v[0] : v[1]) : fallback;

/** SNAKE_CASE / kebab → "Okunur Biçim" (bilinmeyen kod defansif fallback'i). */
function humanize(code: string): string {
  return code
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const STATUS: Record<string, [string, string]> = {
  OPEN: ["Açık", "Open"],
  WAITING_STORE: ["Mağaza yanıtı bekleniyor", "Waiting for store reply"],
  WAITING_CUSTOMER: ["Müşteri yanıtı bekleniyor", "Waiting for customer reply"],
  RESOLVED: ["Çözüldü", "Resolved"],
  CLOSED: ["Kapatıldı", "Closed"],
};

const STATUS_TONE: Record<string, Tone> = {
  OPEN: "warning",
  WAITING_STORE: "warning",
  WAITING_CUSTOMER: "info",
  RESOLVED: "success",
  CLOSED: "neutral",
};

const TOPIC: Record<string, [string, string]> = {
  PRODUCT_NOT_WORKING: ["Ürün çalışmıyor", "Product not working"],
  DAMAGED_OR_MISSING: ["Hasarlı / eksik", "Damaged / missing"],
  SETUP_USAGE: ["Kurulum / kullanım", "Setup / usage"],
  WARRANTY_SERVICE: ["Garanti / servis", "Warranty / service"],
  PRODUCT_INFO: ["Ürün bilgisi", "Product information"],
  INVOICE_DOCUMENT: ["Fatura / doküman", "Invoice / document"],
  OTHER: ["Diğer", "Other"],
};

const ACTOR: Record<string, [string, string]> = {
  CUSTOMER: ["Müşteri", "Customer"],
  STORE_ADMIN: ["Mağaza", "Store"],
  SYSTEM: ["Sistem", "System"],
};

const SLA_STATE: Record<SlaStateKind, { label: [string, string]; tone: Tone }> = {
  INSIDE: { label: ["SLA içinde", "Within SLA"], tone: "neutral" },
  DUE_TODAY: { label: ["Bugün doluyor", "Due today"], tone: "warning" },
  OVERDUE: { label: ["Gecikti", "Overdue"], tone: "danger" },
  DONE: { label: ["Tamamlandı", "Completed"], tone: "success" },
};

export function supportStatusLabel(status: string, tr: boolean): string {
  return pick(STATUS[status], tr, humanize(status));
}
export function supportStatusTone(status: string): Tone {
  return STATUS_TONE[status] ?? "neutral";
}
export function supportTopicLabel(topic: string, tr: boolean): string {
  return pick(TOPIC[topic], tr, humanize(topic));
}
export function supportActorLabel(actor: string, tr: boolean): string {
  return pick(ACTOR[actor], tr, humanize(actor));
}

/** SLA state → renk-dışı metin + tone (inbox rozeti + detay paneli tek kaynak). */
export function slaStateBadge(state: SlaStateKind, tr: boolean): { label: string; tone: Tone } {
  const entry = SLA_STATE[state];
  return { label: tr ? entry.label[0] : entry.label[1], tone: entry.tone };
}

/** Filtre dropdown'ları için tek kaynak (map anahtarları). */
export const supportStatusKeys = Object.keys(STATUS);
export const supportTopicKeys = Object.keys(TOPIC);
