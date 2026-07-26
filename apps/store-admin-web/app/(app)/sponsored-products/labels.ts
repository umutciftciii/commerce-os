/**
 * TODO-161 — Sponsored Products modülü metinleri (modül-içi hafif i18n; nav etiketi
 * paket i18n'de). tr/en; para minor birim (100'e bölünür); oran 0..1 → yüzde.
 */
import type { SponsoredCampaignStatus, SponsoredPlacementType } from "@commerce-os/api-client";
import type { SponsoredFormLabels } from "./sponsored-form";

export type Locale = "tr" | "en";

const STATUS_TR: Record<SponsoredCampaignStatus, string> = { ACTIVE: "Aktif", PAUSED: "Duraklatıldı", ARCHIVED: "Arşiv" };
const STATUS_EN: Record<SponsoredCampaignStatus, string> = { ACTIVE: "Active", PAUSED: "Paused", ARCHIVED: "Archived" };
const PLACEMENT_TR: Record<SponsoredPlacementType, string> = { HOME_SHOWCASE: "Ana sayfa vitrini", SEARCH_RESULTS: "Arama sonuçları" };
const PLACEMENT_EN: Record<SponsoredPlacementType, string> = { HOME_SHOWCASE: "Home showcase", SEARCH_RESULTS: "Search results" };

export interface SponsoredLabels {
  eyebrow: string;
  title: string;
  description: string;
  add: string;
  back: string;
  cardTitle: string;
  cardDescription: string;
  dashTitle: string;
  dashDescription: string;
  dateFrom: string;
  dateTo: string;
  csv: string;
  csvBusy: string;
  loadError: string;
  notFound: string;
  emptyTitle: string;
  emptyDescription: string;
  colName: string;
  colPlacement: string;
  colStatus: string;
  colLive: string;
  colProducts: string;
  colPriority: string;
  searchPlaceholder: string;
  filterStatus: string;
  filterPlacement: string;
  sortNewest: string;
  sortOldest: string;
  sortName: string;
  sortPriority: string;
  live: string;
  notLive: string;
  newTitle: string;
  editTitle: string;
  statusLabels: Record<SponsoredCampaignStatus, string>;
  placementLabels: Record<SponsoredPlacementType, string>;
  metrics: {
    impressions: string;
    uniqueImpressions: string;
    clicks: string;
    ctr: string;
    carts: string;
    orders: string;
    conversionRate: string;
    grossRevenue: string;
    netRevenue: string;
  };
  form: SponsoredFormLabels;
}

const TR: SponsoredLabels = {
  eyebrow: "Büyüme",
  title: "Sponsorlu Kampanyalar",
  description:
    "Sponsorlu kampanyalar oluşturun; ürünleri ana sayfa vitrininde ve arama sonuçlarında kontrollü slotlarda öne çıkarın. Sponsorlu ürünler açıkça etiketlenir; organik sıralama değişmez.",
  add: "Yeni kampanya",
  back: "Kampanyalara dön",
  cardTitle: "Kampanya listesi",
  cardDescription: "Arama, durum ve yerleşim filtresiyle tüm sponsorlu kampanyalar.",
  dashTitle: "Performans panosu",
  dashDescription: "Seçili tarih aralığında gösterim, tıklama, dönüşüm ve ciro.",
  dateFrom: "Başlangıç",
  dateTo: "Bitiş",
  csv: "CSV indir",
  csvBusy: "Hazırlanıyor…",
  loadError: "Kampanyalar yüklenemedi.",
  notFound: "Kampanya bulunamadı.",
  emptyTitle: "Henüz sponsorlu kampanya yok",
  emptyDescription: "İlk kampanyayı ekleyerek ürünlerinizi öne çıkarmaya başlayın.",
  colName: "Ad",
  colPlacement: "Yerleşim",
  colStatus: "Durum",
  colLive: "Yayında",
  colProducts: "Ürün",
  colPriority: "Öncelik",
  searchPlaceholder: "Kampanya adı ara…",
  filterStatus: "Durum",
  filterPlacement: "Yerleşim",
  sortNewest: "En yeni",
  sortOldest: "En eski",
  sortName: "İsim (A-Z)",
  sortPriority: "Öncelik",
  live: "Yayında",
  notLive: "Pasif",
  newTitle: "Yeni sponsorlu kampanya",
  editTitle: "Kampanyayı düzenle",
  statusLabels: STATUS_TR,
  placementLabels: PLACEMENT_TR,
  metrics: {
    impressions: "Gösterim",
    uniqueImpressions: "Tekil gösterim",
    clicks: "Tıklama",
    ctr: "TO (CTR)",
    carts: "Sepete ekleme",
    orders: "Sipariş",
    conversionRate: "Dönüşüm oranı",
    grossRevenue: "Brüt ciro",
    netRevenue: "Net ciro",
  },
  form: {
    name: "Kampanya adı",
    placement: "Yerleşim",
    placementLabels: PLACEMENT_TR,
    status: "Durum",
    statusLabels: STATUS_TR,
    startsAt: "Başlangıç",
    endsAt: "Bitiş",
    priority: "Öncelik",
    priorityHint: "Yüksek öncelik çakışmada önce yerleşir (0-1000).",
    maxSlots: "Maks. slot",
    targetCategory: "Hedef kategori (opsiyonel)",
    targetCategoryHint: "Yalnız bu kategori ve alt kategorilerindeki aramalarda gösterilir.",
    keywords: "Hedef arama kelimeleri",
    keywordsHint: "Virgül veya satırla ayırın. Ürünler yalnız ilgili aramalarda gösterilir (alaka eşiği zorlanır).",
    products: "Sponsorlu ürünler",
    productsHint: "Pasif veya stokta olmayan ürünler otomatik elenir.",
    save: "Kaydet",
    saving: "Kaydediliyor…",
    cancel: "Vazgeç",
    nameRequired: "Kampanya adı gerekli.",
    commercial: {
      mode: "Kampanya tipi",
      modeHint:
        "Ticari sponsorluk üçüncü taraf adınadır ve geçerli bir anlaşma gerektirir. İç promosyon mağazanızın kendi ürünüdür; anlaşma gerekmez.",
      sponsored: "Ticari sponsorluk",
      internal: "İç promosyon",
      sponsor: "Sponsor firma",
      sponsorPlaceholder: "Sponsor seçin…",
      agreement: "Anlaşma",
      agreementPlaceholder: "Anlaşma seçin…",
      agreementLoading: "Yükleniyor…",
      noSponsors: "Aktif sponsor firma yok.",
      noEligibleAgreements: "Bu sponsora ait uygun anlaşma yok.",
      ineligibleSuffix: "şu an uygun değil",
      allocation: "Kampanyaya ayrılan tutar (opsiyonel)",
      allocationHint: "Boş bırakılırsa anlaşma bütçesi kampanyalar arasında paylaşılır.",
      detailWindow: "Dönem",
      detailPricing: "Model",
      detailCurrency: "Para birimi",
      detailAvailable: "Kullanılabilir tutar",
      detailStatus: "Durum",
      unlimited: "Sınırsız",
      editNote:
        "Anlaşma bağlama ve avans mahsubu ilgili anlaşma sayfasından yönetilir. Buradan yalnız kampanya tipi güncellenir.",
    },
  },
};

const EN: SponsoredLabels = {
  eyebrow: "Growth",
  title: "Sponsored Campaigns",
  description:
    "Create sponsored campaigns; promote products in the home showcase and in controlled search slots. Sponsored products are clearly labelled; organic ranking is unchanged.",
  add: "New campaign",
  back: "Back to campaigns",
  cardTitle: "Campaign list",
  cardDescription: "All sponsored campaigns with search, status and placement filters.",
  dashTitle: "Performance dashboard",
  dashDescription: "Impressions, clicks, conversion and revenue in the selected date range.",
  dateFrom: "From",
  dateTo: "To",
  csv: "Download CSV",
  csvBusy: "Preparing…",
  loadError: "Could not load campaigns.",
  notFound: "Campaign not found.",
  emptyTitle: "No sponsored campaigns yet",
  emptyDescription: "Add your first campaign to start promoting products.",
  colName: "Name",
  colPlacement: "Placement",
  colStatus: "Status",
  colLive: "Live",
  colProducts: "Products",
  colPriority: "Priority",
  searchPlaceholder: "Search campaign name…",
  filterStatus: "Status",
  filterPlacement: "Placement",
  sortNewest: "Newest",
  sortOldest: "Oldest",
  sortName: "Name (A-Z)",
  sortPriority: "Priority",
  live: "Live",
  notLive: "Inactive",
  newTitle: "New sponsored campaign",
  editTitle: "Edit campaign",
  statusLabels: STATUS_EN,
  placementLabels: PLACEMENT_EN,
  metrics: {
    impressions: "Impressions",
    uniqueImpressions: "Unique impressions",
    clicks: "Clicks",
    ctr: "CTR",
    carts: "Cart adds",
    orders: "Orders",
    conversionRate: "Conversion rate",
    grossRevenue: "Gross revenue",
    netRevenue: "Net revenue",
  },
  form: {
    name: "Campaign name",
    placement: "Placement",
    placementLabels: PLACEMENT_EN,
    status: "Status",
    statusLabels: STATUS_EN,
    startsAt: "Starts",
    endsAt: "Ends",
    priority: "Priority",
    priorityHint: "Higher priority wins slot conflicts (0-1000).",
    maxSlots: "Max slots",
    targetCategory: "Target category (optional)",
    targetCategoryHint: "Only shown for searches in this category and its subcategories.",
    keywords: "Target search terms",
    keywordsHint: "Separate by comma or line. Products only show for relevant searches (relevancy threshold enforced).",
    products: "Sponsored products",
    productsHint: "Passive or out-of-stock products are automatically excluded.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    nameRequired: "Campaign name is required.",
    commercial: {
      mode: "Campaign type",
      modeHint:
        "Commercial sponsorship is on behalf of a third party and requires a valid agreement. Internal promotion is your own product; no agreement needed.",
      sponsored: "Commercial sponsorship",
      internal: "Internal promotion",
      sponsor: "Sponsor company",
      sponsorPlaceholder: "Select sponsor…",
      agreement: "Agreement",
      agreementPlaceholder: "Select agreement…",
      agreementLoading: "Loading…",
      noSponsors: "No active sponsor companies.",
      noEligibleAgreements: "No eligible agreements for this sponsor.",
      ineligibleSuffix: "not currently eligible",
      allocation: "Amount allocated to campaign (optional)",
      allocationHint: "If left empty, the agreement budget is shared across campaigns.",
      detailWindow: "Period",
      detailPricing: "Model",
      detailCurrency: "Currency",
      detailAvailable: "Available amount",
      detailStatus: "Status",
      unlimited: "Unlimited",
      editNote:
        "Agreement linking and advance allocation are managed from the agreement page. Only the campaign type is updated here.",
    },
  },
};

export function sponsoredLabels(locale: Locale): SponsoredLabels {
  return locale === "en" ? EN : TR;
}
