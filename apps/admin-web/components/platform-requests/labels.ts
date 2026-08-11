// TODO-178 (Faz C) — Mağaza Talepleri etiketleri (ham enum/id ASLA UI'a çıkmaz).
// recovery/question-sets deseni: her enum → [tr, en] + humanize fallback + tone haritası.

type Locale = "tr" | "en";
type Pair = readonly [string, string];

function humanize(code: string): string {
  return code
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function pick(map: Record<string, Pair>, key: string, locale: Locale): string {
  const entry = map[key];
  if (entry) return locale === "tr" ? entry[0] : entry[1];
  return humanize(key);
}

const STATUS: Record<string, Pair> = {
  OPEN: ["Açık", "Open"],
  TRIAGED: ["Değerlendirildi", "Triaged"],
  IN_PROGRESS: ["İşlemde", "In progress"],
  WAITING_STORE: ["Mağaza bekleniyor", "Waiting on store"],
  RESOLVED: ["Çözüldü", "Resolved"],
  CLOSED: ["Kapalı", "Closed"],
};

const PRIORITY: Record<string, Pair> = {
  LOW: ["Düşük", "Low"],
  NORMAL: ["Normal", "Normal"],
  HIGH: ["Yüksek", "High"],
  URGENT: ["Acil", "Urgent"],
};

const STORE_IMPACT: Record<string, Pair> = {
  LOW: ["Düşük etki", "Low impact"],
  MEDIUM: ["Orta etki", "Medium impact"],
  HIGH: ["Yüksek etki", "High impact"],
};

const CLOSE_REASON: Record<string, Pair> = {
  COMPLETED: ["Tamamlandı", "Completed"],
  WITHDRAWN_BY_STORE: ["Mağaza geri çekti", "Withdrawn by store"],
  NOT_ACTIONABLE: ["İşlem yapılamaz", "Not actionable"],
  DUPLICATE: ["Tekrar / kopya", "Duplicate"],
  REJECTED: ["Reddedildi", "Rejected"],
};

const CONTEXT_KIND: Record<string, Pair> = {
  NONE: ["Bağlam yok", "No context"],
  PLATFORM_TAXONOMY: ["Platform taksonomisi", "Platform taxonomy"],
  PLATFORM_CONTENT: ["Platform içeriği", "Platform content"],
  PLATFORM_POLICY: ["Platform politikası", "Platform policy"],
  STORE_DATA: ["Mağaza verisi", "Store data"],
  OTHER: ["Diğer", "Other"],
};

const SLA_STATE: Record<string, Pair> = {
  INSIDE: ["Süresinde", "On track"],
  DUE_TODAY: ["Bugün doluyor", "Due today"],
  OVERDUE: ["Gecikti", "Overdue"],
  DONE: ["Tamamlandı", "Met"],
};

const AUTHOR: Record<string, Pair> = {
  STORE: ["Mağaza", "Store"],
  PLATFORM: ["Platform", "Platform"],
  SYSTEM: ["Sistem", "System"],
};

export const statusLabel = (k: string, l: Locale) => pick(STATUS, k, l);
export const priorityLabel = (k: string, l: Locale) => pick(PRIORITY, k, l);
export const storeImpactLabel = (k: string, l: Locale) => pick(STORE_IMPACT, k, l);
export const closeReasonLabel = (k: string, l: Locale) => pick(CLOSE_REASON, k, l);
export const contextKindLabel = (k: string, l: Locale) => pick(CONTEXT_KIND, k, l);
export const slaStateLabel = (k: string, l: Locale) => pick(SLA_STATE, k, l);
export const authorLabel = (k: string, l: Locale) => pick(AUTHOR, k, l);

export const STATUS_KEYS = Object.keys(STATUS);
export const PRIORITY_KEYS = Object.keys(PRIORITY);
export const CLOSE_REASON_KEYS = Object.keys(CLOSE_REASON);

export type BadgeTone = "success" | "neutral" | "info" | "warning" | "danger";

export function statusTone(status: string): BadgeTone {
  if (status === "RESOLVED") return "success";
  if (status === "CLOSED") return "neutral";
  if (status === "WAITING_STORE") return "warning";
  return "info";
}

export function priorityTone(priority: string): BadgeTone {
  if (priority === "URGENT") return "danger";
  if (priority === "HIGH") return "warning";
  if (priority === "LOW") return "neutral";
  return "info";
}

export function slaTone(state: string): BadgeTone {
  if (state === "OVERDUE") return "danger";
  if (state === "DUE_TODAY") return "warning";
  if (state === "DONE") return "success";
  return "neutral";
}

// UI yalnız backend'in izin verdiği aksiyonları göstermeli (evaluateTransition PLATFORM paritesi).
// CLOSED buradan gelmez — kapatma ayrı closeReason'lı aksiyondur.
const PLATFORM_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["TRIAGED", "IN_PROGRESS", "WAITING_STORE", "RESOLVED"],
  TRIAGED: ["IN_PROGRESS", "WAITING_STORE", "RESOLVED"],
  IN_PROGRESS: ["WAITING_STORE", "RESOLVED"],
  WAITING_STORE: ["IN_PROGRESS"],
  RESOLVED: [],
  CLOSED: [],
};
export const nextStatuses = (status: string): string[] => PLATFORM_TRANSITIONS[status] ?? [];

// evaluateClose PLATFORM paritesi: COMPLETED yalnız RESOLVED'dan; operasyonel red aktif durumlardan.
export function platformCloseReasons(status: string): string[] {
  if (status === "CLOSED") return [];
  if (status === "RESOLVED") return ["COMPLETED"];
  return ["NOT_ACTIONABLE", "DUPLICATE", "REJECTED"];
}
