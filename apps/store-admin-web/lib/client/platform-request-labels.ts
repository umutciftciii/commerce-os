/**
 * TODO-178 (Faz D) — Platform Talepleri (mağaza → platform) için yerel bilingual etiketler
 * (paylaşılan i18n paketine dokunulmaz — store-admin dark-glass yereli; İadeler/Sipariş Deneyimi
 * deseni). HARD KURAL: ham enum / kategori key / UUID KULLANICIYA GÖSTERİLMEZ — her değer buradan
 * insan-okunur etikete çevrilir. Tipler store DTO'larından türetilir (platform DTO reuse YOK).
 */
import type {
  StorePlatformRequestDetail,
  StorePlatformRequestListResponse,
  StorePlatformRequestMessage,
  StorePlatformRequestCategoryListResponse,
} from "@commerce-os/api-client";

export type Locale = "tr" | "en";
export type BadgeTone = "neutral" | "success" | "warning" | "danger";

type Status = StorePlatformRequestDetail["status"];
type Priority = StorePlatformRequestDetail["priority"];
type StoreImpact = NonNullable<StorePlatformRequestDetail["storeImpact"]>;
type CloseReason = NonNullable<StorePlatformRequestDetail["closeReason"]>;
type ContextKind = StorePlatformRequestDetail["contextKind"];
type SlaState = NonNullable<
  StorePlatformRequestListResponse["items"][number]["sla"]
>["firstResponseState"];
type AuthorType = StorePlatformRequestMessage["authorType"];
type CategoryRef = StorePlatformRequestCategoryListResponse["items"][number];
type TimelineEventType = StorePlatformRequestDetail["timeline"][number]["event"];

type Bilingual = { tr: string; en: string };
const pick = (l: Locale, b: Bilingual) => (l === "tr" ? b.tr : b.en);

const STATUS: Record<Status, Bilingual> = {
  OPEN: { tr: "Açık", en: "Open" },
  TRIAGED: { tr: "Değerlendirildi", en: "Triaged" },
  IN_PROGRESS: { tr: "İşlemde", en: "In progress" },
  WAITING_STORE: { tr: "Yanıtınız bekleniyor", en: "Awaiting your reply" },
  RESOLVED: { tr: "Çözüldü", en: "Resolved" },
  CLOSED: { tr: "Kapatıldı", en: "Closed" },
};
const STATUS_TONE: Record<Status, BadgeTone> = {
  OPEN: "neutral",
  TRIAGED: "neutral",
  IN_PROGRESS: "neutral",
  WAITING_STORE: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
};

const PRIORITY: Record<Priority, Bilingual> = {
  LOW: { tr: "Düşük", en: "Low" },
  NORMAL: { tr: "Normal", en: "Normal" },
  HIGH: { tr: "Yüksek", en: "High" },
  URGENT: { tr: "Acil", en: "Urgent" },
};
const PRIORITY_TONE: Record<Priority, BadgeTone> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "danger",
};

const STORE_IMPACT: Record<StoreImpact, Bilingual> = {
  LOW: { tr: "Düşük etki", en: "Low impact" },
  MEDIUM: { tr: "Orta etki", en: "Medium impact" },
  HIGH: { tr: "Yüksek etki", en: "High impact" },
};

// Store'a yalnız sade operasyonel durum: normal / yaklaşan / gecikmiş / tamamlandı (policy/raw timestamp YOK).
const SLA_STATE: Record<SlaState, Bilingual> = {
  INSIDE: { tr: "Normal", en: "On track" },
  DUE_TODAY: { tr: "Yaklaşıyor", en: "Due today" },
  OVERDUE: { tr: "Gecikmiş", en: "Overdue" },
  DONE: { tr: "Tamamlandı", en: "Met" },
};
const SLA_STATE_TONE: Record<SlaState, BadgeTone> = {
  INSIDE: "neutral",
  DUE_TODAY: "warning",
  OVERDUE: "danger",
  DONE: "success",
};

const CLOSE_REASON: Record<CloseReason, Bilingual> = {
  COMPLETED: { tr: "Tamamlandı", en: "Completed" },
  WITHDRAWN_BY_STORE: { tr: "Mağaza geri çekti", en: "Withdrawn by store" },
  NOT_ACTIONABLE: { tr: "İşleme uygun değil", en: "Not actionable" },
  DUPLICATE: { tr: "Yinelenen talep", en: "Duplicate" },
  REJECTED: { tr: "Reddedildi", en: "Rejected" },
};

const CONTEXT_KIND: Record<ContextKind, Bilingual> = {
  NONE: { tr: "Bağlam yok", en: "No context" },
  PLATFORM_TAXONOMY: { tr: "Platform taksonomisi", en: "Platform taxonomy" },
  PLATFORM_CONTENT: { tr: "Platform içeriği", en: "Platform content" },
  PLATFORM_POLICY: { tr: "Platform politikası", en: "Platform policy" },
  STORE_DATA: { tr: "Mağaza verisi", en: "Store data" },
  OTHER: { tr: "Diğer", en: "Other" },
};

const AUTHOR: Record<AuthorType, Bilingual> = {
  STORE: { tr: "Mağaza", en: "Store" },
  PLATFORM: { tr: "Platform", en: "Platform" },
  SYSTEM: { tr: "Sistem", en: "System" },
};

// Store audit timeline event etiketleri (insan-okunur; ham event key/enum gösterilmez).
const TIMELINE_EVENT: Record<TimelineEventType, Bilingual> = {
  CREATED: { tr: "Talep oluşturuldu", en: "Request created" },
  STATUS_CHANGED: { tr: "Durum güncellendi", en: "Status updated" },
  ASSIGNED: { tr: "Temsilci atandı", en: "Assigned" },
  UNASSIGNED: { tr: "Atama kaldırıldı", en: "Unassigned" },
  PRIORITY_CHANGED: { tr: "Öncelik güncellendi", en: "Priority updated" },
  CATEGORY_CHANGED: { tr: "Kategori güncellendi", en: "Category updated" },
  WITHDRAWN: { tr: "Talep geri çekildi", en: "Request withdrawn" },
  RESOLVED: { tr: "Çözüldü", en: "Resolved" },
  CLOSED: { tr: "Kapatıldı", en: "Closed" },
  REOPENED: { tr: "Yeniden açıldı", en: "Reopened" },
};

export const statusLabel = (l: Locale, s: Status) => pick(l, STATUS[s]);
export const statusTone = (s: Status): BadgeTone => STATUS_TONE[s];
export const priorityLabel = (l: Locale, p: Priority) => pick(l, PRIORITY[p]);
export const priorityTone = (p: Priority): BadgeTone => PRIORITY_TONE[p];
export const storeImpactLabel = (l: Locale, i: StoreImpact) => pick(l, STORE_IMPACT[i]);
export const slaStateLabel = (l: Locale, s: SlaState) => pick(l, SLA_STATE[s]);
export const slaStateTone = (s: SlaState): BadgeTone => SLA_STATE_TONE[s];
export const closeReasonLabel = (l: Locale, r: CloseReason) => pick(l, CLOSE_REASON[r]);
export const contextKindLabel = (l: Locale, k: ContextKind) => pick(l, CONTEXT_KIND[k]);
export const authorLabel = (l: Locale, a: AuthorType) => pick(l, AUTHOR[a]);
export const timelineEventLabel = (l: Locale, e: TimelineEventType) => pick(l, TIMELINE_EVENT[e]);
export const categoryLabel = (l: Locale, c: Pick<CategoryRef, "labelTr" | "labelEn">) =>
  l === "tr" ? c.labelTr : c.labelEn;

/** Filtre/oluşturma açılır menüleri için status seçenekleri (sıralı, insan-okunur). */
export const STATUS_ORDER: Status[] = [
  "OPEN",
  "TRIAGED",
  "IN_PROGRESS",
  "WAITING_STORE",
  "RESOLVED",
  "CLOSED",
];
export const STORE_IMPACT_ORDER: StoreImpact[] = ["LOW", "MEDIUM", "HIGH"];
