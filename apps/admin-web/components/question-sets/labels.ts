// TODO-177 (ADR-289) — Ürün Desteği question-set editörü etiketleri (ham enum ASLA UI'a çıkmaz).
// recovery-labels deseni: her enum → [tr, en] + humanize fallback (bilinmeyen kod bile Title Case).

type Locale = "tr" | "en";
type Pair = readonly [string, string];

function pick(map: Record<string, Pair>, key: string, locale: Locale): string {
  const entry = map[key];
  if (entry) return locale === "tr" ? entry[0] : entry[1];
  return humanize(key);
}

function humanize(code: string): string {
  return code
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const TOPIC: Record<string, Pair> = {
  PRODUCT_NOT_WORKING: ["Ürün çalışmıyor", "Product not working"],
  DAMAGED_OR_MISSING: ["Hasarlı / eksik", "Damaged / missing"],
  SETUP_USAGE: ["Kurulum / kullanım", "Setup / usage"],
  WARRANTY_SERVICE: ["Garanti / servis", "Warranty / service"],
  PRODUCT_INFO: ["Ürün bilgisi", "Product info"],
  INVOICE_DOCUMENT: ["Fatura / doküman", "Invoice / document"],
  OTHER: ["Diğer", "Other"],
};

const QUESTION_TYPE: Record<string, Pair> = {
  SINGLE_SELECT: ["Tek seçim", "Single choice"],
  MULTI_SELECT: ["Çoklu seçim", "Multiple choice"],
  BOOLEAN: ["Evet / Hayır", "Yes / No"],
  SHORT_TEXT: ["Kısa metin", "Short text"],
  LONG_TEXT: ["Uzun metin", "Long text"],
  INFO: ["Bilgi notu", "Info note"],
  SELF_SERVICE_RESULT: ["Çözüm sayfası", "Solution page"],
};

const VERSION_STATUS: Record<string, Pair> = {
  DRAFT: ["Taslak", "Draft"],
  PUBLISHED: ["Yayında", "Published"],
  ARCHIVED: ["Arşiv", "Archived"],
};

const SET_STATUS: Record<string, Pair> = {
  ACTIVE: ["Aktif", "Active"],
  INACTIVE: ["Pasif", "Inactive"],
};

// Publish-time graph validation kodları → insan-okur açıklama.
const VALIDATION_ERROR: Record<string, Pair> = {
  NO_ENTRY: ["Başlangıç sorusu belirlenmemiş.", "No entry question is set."],
  MULTIPLE_ENTRY: ["Birden fazla başlangıç sorusu var; yalnız biri olmalı.", "More than one entry question; only one is allowed."],
  DUPLICATE_KEY: ["Yinelenen soru anahtarı var.", "A duplicate question key exists."],
  CYCLE: ["Akışta döngü var (bir soru kendine geri dönüyor).", "The flow contains a cycle (a question loops back)."],
  DEAD_END: ["Çıkışsız bir soru var (ilerlenecek adım yok).", "A question has no next step (dead end)."],
  UNCOVERED_OPTION: ["Kapsanmayan bir cevap var; bir 'varsayılan' yol ekleyin.", "An answer is not covered; add a default path."],
  UNREACHABLE: ["Ulaşılamayan bir soru var.", "A question is unreachable."],
  NO_ESCALATION_PATH: ["Talep oluşturma (escalation) yolu yok; en az bir yol talebe ulaşmalı.", "No escalation path; at least one path must reach a ticket."],
  BAD_TARGET: ["Geçersiz bir hedef adım var.", "A transition points to an invalid target."],
  VERSION_NOT_FOUND: ["Sürüm bulunamadı.", "Version not found."],
};

export const topicLabel = (k: string, l: Locale) => pick(TOPIC, k, l);
export const questionTypeLabel = (k: string, l: Locale) => pick(QUESTION_TYPE, k, l);
export const versionStatusLabel = (k: string, l: Locale) => pick(VERSION_STATUS, k, l);
export const setStatusLabel = (k: string, l: Locale) => pick(SET_STATUS, k, l);
export const validationErrorLabel = (k: string, l: Locale) => pick(VALIDATION_ERROR, k, l);

export const TOPIC_KEYS = Object.keys(TOPIC);
export const QUESTION_TYPE_KEYS = Object.keys(QUESTION_TYPE);

export function versionStatusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "PUBLISHED") return "success";
  if (status === "DRAFT") return "warning";
  return "neutral";
}
