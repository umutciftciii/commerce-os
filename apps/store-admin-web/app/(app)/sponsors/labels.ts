/**
 * TODO-161A — Sponsorluk ekranları için yerel etiketler (paylaşılan i18n paketine
 * dokunmadan; store-admin dark-glass yereli). Varsayılan dil Türkçe.
 *
 * NOT (ADR-126): platform içi kayıt bir **tahakkuk**tur; resmî e-Fatura DEĞİLDİR.
 * "Fatura" sözcüğü bilinçli olarak KULLANILMAZ.
 */
import type { Locale } from "@commerce-os/i18n";
import type {
  SponsorshipAgreementStatus,
  SponsorshipChargeDisplayStatus,
  SponsorshipPaymentMethod,
  SponsorshipPricingModel,
  SponsorshipSettlementPeriod,
  SponsorshipSettlementStatus,
} from "@commerce-os/api-client";

export type { Locale };

export const AGREEMENT_STATUS_LABELS: Record<SponsorshipAgreementStatus, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay Bekliyor",
  ACTIVE: "Aktif",
  SUSPENDED: "Askıda",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

export const PRICING_MODEL_LABELS: Record<SponsorshipPricingModel, string> = {
  FIXED_FEE: "Sabit Bedel",
  CPM: "CPM (bin gösterim)",
  CPC: "CPC (tıklama)",
  CPA: "CPA (dönüşüm)",
  REVENUE_SHARE: "Gelir Paylaşımı",
};

export const SETTLEMENT_PERIOD_LABELS: Record<SponsorshipSettlementPeriod, string> = {
  CAMPAIGN_END: "Kampanya Sonu",
  WEEKLY: "Haftalık",
  MONTHLY: "Aylık",
  MANUAL: "Manuel Dönem",
};

export const SETTLEMENT_STATUS_LABELS: Record<SponsorshipSettlementStatus, string> = {
  DRAFT: "Taslak",
  FINALIZED: "Kesinleşti",
};

export const CHARGE_DISPLAY_STATUS_LABELS: Record<SponsorshipChargeDisplayStatus, string> = {
  DRAFT: "Taslak",
  ISSUED: "Düzenlendi",
  PARTIALLY_PAID: "Kısmi Ödendi",
  PAID: "Ödendi",
  CANCELLED: "İptal",
  OVERDUE: "Vadesi Geçti",
};

export const PAYMENT_METHOD_LABELS: Record<SponsorshipPaymentMethod, string> = {
  BANK_TRANSFER: "Banka Havalesi",
  CARD_POS: "Kart / POS",
  CASH: "Nakit",
  ONLINE_PROVIDER: "Online Sağlayıcı",
  OTHER: "Diğer",
};

/** Uygunluk red gerekçesi → kullanıcı mesajı (ADR-124). */
export const INELIGIBILITY_LABELS: Record<string, string> = {
  NO_AGREEMENT: "Anlaşma bağlı değil",
  AGREEMENT_NOT_ACTIVE: "Anlaşma aktif değil",
  AGREEMENT_WINDOW: "Anlaşma tarih penceresi dışında",
  BUDGET_EXHAUSTED: "Bütçe tükendi",
  OVERDUE_CHARGE: "Vadesi geçmiş tahakkuk var",
};

/** Sponsorluk-özel hata kodları → Türkçe (paylaşılan i18n'e eklemeden). */
export const SPONSORSHIP_ERROR_LABELS: Record<string, string> = {
  DUPLICATE_COMPANY: "Bu firma adıyla zaten bir sponsor kaydı var.",
  SPONSOR_NOT_FOUND: "Sponsor firma bulunamadı.",
  DUPLICATE_NUMBER: "Bu anlaşma numarası zaten kullanımda.",
  INVALID_WINDOW: "Bitiş tarihi başlangıçtan sonra olmalı.",
  INVALID_PRICING: "Fiyatlandırma parametreleri modelle tutarsız.",
  INVALID_STATUS_TRANSITION: "Geçersiz anlaşma durumu geçişi.",
  CURRENCY_LOCKED: "Tahakkuk oluştuktan sonra para birimi değiştirilemez.",
  AGREEMENT_NOT_FOUND: "Anlaşma bulunamadı.",
  CAMPAIGN_NOT_FOUND: "Kampanya bulunamadı.",
  CAMPAIGN_ALREADY_LINKED: "Kampanya zaten bir anlaşmaya bağlı.",
  CAMPAIGN_WINDOW_NOT_COVERED: "Anlaşma tarihleri kampanyayı tümüyle kapsamalı.",
  INVALID_PERIOD: "Dönem bitişi başlangıçtan sonra olmalı.",
  PERIOD_ALREADY_FINALIZED: "Bu dönem kesinleşti ve değiştirilemez.",
  SETTLEMENT_NOT_FOUND: "Mutabakat bulunamadı.",
  SETTLEMENT_NOT_FINALIZED: "Tahakkuk için mutabakat önce kesinleştirilmeli.",
  SETTLEMENT_FINALIZED: "Kesinleşmiş mutabakat silinemez.",
  CHARGE_ALREADY_EXISTS: "Bu mutabakat için zaten bir tahakkuk var.",
  CHARGE_NOT_FOUND: "Tahakkuk bulunamadı.",
  CHARGE_NOT_COLLECTIBLE: "Tahakkuk bu durumda tahsil edilemez.",
  CURRENCY_MISMATCH: "Ödeme para birimi tahakkukla eşleşmeli.",
  OVERPAYMENT: "Tutar kalan bakiyeyi aşamaz.",
  ALREADY_REVERSED: "Ödeme zaten ters çevrilmiş.",
  NOT_REVERSIBLE: "Ödeme ters çevrilemez.",
  INVALID_STATUS: "Tahakkuk bu işlem için uygun durumda değil.",
};

export function sponsorshipError(code: string): string | null {
  return SPONSORSHIP_ERROR_LABELS[code] ?? null;
}
