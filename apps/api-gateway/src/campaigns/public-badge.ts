/**
 * F4A.1 — Public urun kampanya rozeti projeksiyonu.
 *
 * TODO-155.2 — Saf değerlendirici + record tipleri PAYLAŞILAN pakete (@commerce-os/contracts) TAŞINDI ki
 * search-service (index-anı rozet snapshot'ı) ile api-gateway (PDP/PLP) AYNI "tek formül"ü kullansın. Bu modül
 * artık YALNIZ geriye-uyumlu bir yeniden-dışa-aktarımdır (mevcut `from "./public-badge.js"` içe aktarımları
 * kırılmaz). Yeni kod doğrudan `@commerce-os/contracts`'tan içe aktarabilir.
 */
export {
  selectPublicCampaignDisplay,
  selectPublicCampaignBadge,
  selectPublicCampaignSlides,
  selectIndexableCampaignSnapshot,
  isBadgeEligible,
  campaignAppliesToProduct,
  computeAutomaticEstimate,
  isCampaignSnapshotDisplayable,
} from "@commerce-os/contracts";
export type {
  PublicCampaignDisplay,
  PublicCampaignSnapshot,
  CampaignRecord,
  CampaignCouponRecord,
} from "@commerce-os/contracts";
