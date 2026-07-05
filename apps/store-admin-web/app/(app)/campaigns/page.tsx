"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SectionCard,
  SkeletonRows,
  Textarea,
  useLocale,
  type DataTableColumn,
} from "../../../components/ui";
import type {
  CampaignResponse,
  CampaignDetailResponse,
  CampaignCreateRequest,
  CampaignUpdateRequest,
  CampaignAccessModel,
  CampaignBadgeVariant,
  CampaignCardStyle,
  CustomerCouponAssignment,
  Product,
  ProductCategory,
} from "@commerce-os/api-client";
import { CampaignIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatMinor, minorToInput, inputToMinor } from "../../../lib/client/format";
import { generateCouponCode } from "../../../lib/client/coupon-code";

type Locale = "tr" | "en";

const CREATABLE_TYPES = ["COUPON_CODE", "AUTOMATIC_CART", "PRODUCT_DISCOUNT", "CATEGORY_DISCOUNT"] as const;
type CreatableType = (typeof CREATABLE_TYPES)[number];

/**
 * F4A — Kampanyalar & Kuponlar (ADR-058). İndirim hesabının KAYNAK DOĞRUSU
 * sunucu tarafı motorudur; bu ekran yalnız kampanya TANIMINI yönetir. Kupon
 * kodu mağaza kapsamında benzersizdir (normalize: BÜYÜK harf). ARCHIVED
 * kampanya düzenlenemez, yalnız görüntülenir.
 */
const L = {
  tr: {
    eyebrow: "Satış",
    title: "Kampanyalar",
    description:
      "Kupon kodu ve otomatik sepet/ürün/kategori kampanyaları. İndirim, sepette ve siparişte sunucu tarafında hesaplanır; kullanım limitleri sipariş anında uygulanır.",
    add: "Yeni kampanya",
    empty: "Henüz kampanya yok",
    emptyDesc: "Kupon kodu veya otomatik indirim kampanyası oluşturun.",
    colName: "Kampanya",
    colType: "Tip",
    colDiscount: "İndirim",
    colWindow: "Tarih aralığı",
    colUsage: "Kullanım",
    colStatus: "Durum",
    typeLabels: {
      COUPON_CODE: "Kupon kodu",
      AUTOMATIC_CART: "Sepette otomatik",
      PRODUCT_DISCOUNT: "Ürün indirimi",
      CATEGORY_DISCOUNT: "Kategori indirimi",
      BUY_X_GET_Y: "X al Y öde",
      FREE_SHIPPING: "Ücretsiz kargo",
      MEMBERSHIP_ONLY: "Üyelere özel",
    } as Record<string, string>,
    statusLabels: {
      DRAFT: "Taslak",
      ACTIVE: "Aktif",
      PAUSED: "Duraklatıldı",
      ARCHIVED: "Arşivlendi",
    } as Record<string, string>,
    edit: "Düzenle",
    detail: "Detay",
    activate: "Etkinleştir",
    pause: "Duraklat",
    archive: "Arşivle",
    archiveConfirm: "Kampanya arşivlenecek ve bir daha düzenlenemeyecek. Devam edilsin mi?",
    formTitleNew: "Yeni kampanya",
    formTitleEdit: "Kampanyayı düzenle",
    formName: "Kampanya adı",
    formDescription: "Açıklama (opsiyonel)",
    formType: "Kampanya tipi",
    formDiscountType: "İndirim tipi",
    percent: "Yüzde (%)",
    fixed: "Sabit tutar (₺)",
    formDiscountValuePercent: "İndirim yüzdesi (1-100)",
    formDiscountValueFixed: "İndirim tutarı (₺)",
    formMaxDiscount: "Maksimum indirim (₺, opsiyonel)",
    formMinOrder: "Minimum sepet tutarı (₺, opsiyonel)",
    formStartsAt: "Başlangıç (opsiyonel)",
    formEndsAt: "Bitiş (opsiyonel)",
    formTotalLimit: "Toplam kullanım limiti (opsiyonel)",
    formPerCustomerLimit: "Müşteri başına limit (opsiyonel)",
    formStackable: "Diğer kampanyalarla birleşebilir (stackable)",
    formPriority: "Öncelik",
    formCouponCode: "Kupon kodu",
    formCouponCodeHint: "2-40 karakter; harf/rakam/tire/alt çizgi. Büyük harfe normalize edilir.",
    generateCouponCode: "Otomatik Oluştur",
    formProducts: "Ürün kapsamı (opsiyonel)",
    formCategories: "Kategori kapsamı (opsiyonel)",
    scopeHint: "Kapsam boşsa kampanya tüm sepete uygulanır.",
    save: "Kaydet",
    create: "Oluştur",
    cancel: "Vazgeç",
    saved: "Kampanya kaydedildi.",
    detailCoupons: "Kupon kodları",
    detailStats: "Kullanım istatistikleri",
    detailRedemptions: "Son kullanımlar",
    statTotalRedemptions: "Toplam kullanım",
    statTotalDiscount: "Toplam indirim",
    // F4A.2 — Snapshot-tabanli kampanya analitigi (ADR-059).
    statUniqueCustomers: "Tekil müşteri",
    statOrdersSubtotal: "İndirim öncesi ciro",
    statOrdersTotal: "İndirim sonrası ciro (tahsil)",
    statAvgDiscount: "Ortalama indirim / sipariş",
    statAvgOrderTotal: "Ortalama sipariş tutarı",
    statLastRedemption: "Son kullanım tarihi",
    analyticsNote:
      "Analitik, sipariş anındaki indirim kayıtlarından (snapshot) hesaplanır; iptal edilen siparişlerin kullanımları tarihsel olarak dahildir.",
    redemptionOrderTotal: "sipariş",
    noRedemptions: "Henüz kullanım yok.",
    couponUsage: "kullanım",
    close: "Kapat",
    // F4A.3 — Kupon atama (ADR-060). Public kuponlar ürün/sepet ekranlarında
    // görünür; private kuponlar yalnızca kodu bilen veya atanan müşteri kullanır.
    assignTitle: "Müşteriye kupon ata",
    assignHint:
      "Public kuponlar ürün/sepet ekranlarında gösterilir. Private kuponlar yalnızca kodu bilen ya da atanan müşteri tarafından kullanılabilir.",
    assignCouponLabel: "Kupon",
    assignEmailLabel: "Müşteri e-postası",
    assignEmailPlaceholder: "musteri@ornek.com",
    assignSubmit: "Ata",
    assignEmpty: "Henüz atama yok.",
    assignError: "Kupon atanamadı. Bilgileri kontrol edin.",
    assignSuccess: "Kupon atandı.",
    assignColCustomer: "Müşteri",
    assignColStatus: "Durum",
    assignColSource: "Kaynak",
    assignColDate: "Tarih",
    statusAVAILABLE: "Kullanılabilir",
    statusAPPLIED: "Uygulandı",
    statusUSED: "Kullanıldı",
    statusREVOKED: "İptal",
    sourceADMIN_ASSIGNED: "Atandı",
    sourcePUBLIC_CLAIMED: "Public claim",
    sourceCODE_CLAIMED: "Kod claim",
    validationName: "Kampanya adı zorunludur.",
    validationPercent: "Yüzde 1-100 arasında olmalıdır.",
    validationFixed: "İndirim tutarı pozitif olmalıdır.",
    validationCoupon: "Kupon kodu zorunludur (2-40 karakter, harf/rakam/-/_).",
    validationWindow: "Bitiş tarihi başlangıçtan sonra olmalıdır.",
    validationDisplayTitle: "Kupon başlığı en fazla 120 karakter olabilir.",
    validationShortDescription: "Kısa açıklama en fazla 240 karakter olabilir.",
    validationBadgeLabel: "Kart etiketi en fazla 40 karakter olabilir.",
    validationTerms: "Detaylar en fazla 2000 karakter olabilir.",
    // F4A.4 — Sunum/kart alanları (ADR-061). Bu alanlar yalnızca görünümdür;
    // indirim hesabını etkilemez. "Takip et kazan" gibi hiçbir seçenek yoktur.
    sectionDisplay: "Görünüm / Kupon Kartı",
    sectionDiscount: "İndirim Kuralı",
    sectionValidity: "Geçerlilik",
    sectionAccess: "Erişim / Kitle",
    sectionScope: "Kapsam",
    sectionPreview: "Önizleme",
    formDisplayTitle: "Kupon başlığı (opsiyonel)",
    formDisplayTitleHint:
      "Müşteriye görünen başlık. Örn: “Hafta sonu 500 TL’ye 100 TL kupon”. Boşsa otomatik etiket üretilir.",
    formShortDescription: "Kısa açıklama (opsiyonel)",
    formTerms: "Detaylar / kullanım şartları (opsiyonel)",
    formBadgeLabel: "Kart etiketi (opsiyonel)",
    formBadgeVariant: "Etiket tipi",
    formCardStyle: "Kart görünümü",
    formAccessModel: "Erişim modeli",
    formDisplayPriority: "Görünüm sırası",
    formDisplayPriorityHint:
      "Yalnızca kupon kartı sıralaması içindir; indirim önceliğini değiştirmez.",
    badgeVariantLabels: {
      DEFAULT: "Standart",
      SUPER: "Süper Kupon",
      LIMITED_TIME: "Sınırlı Süre",
      PERSONAL: "Sana Özel",
      WEEKEND: "Hafta Sonu",
      NEW_CUSTOMER: "Yeni Müşteri",
    } as Record<string, string>,
    cardStyleLabels: {
      STANDARD: "Standart",
      FEATURED: "Öne çıkan",
      PERSONAL: "Sana özel",
    } as Record<string, string>,
    accessModelLabels: {
      AUTO_VISIBLE: "Otomatik sepette indirim",
      PUBLIC_CLAIMABLE: "Herkese açık kupon",
      CODE_CLAIMED: "Kod ile kazanılan özel kupon",
      ADMIN_ASSIGNED: "Müşteriye atanan kupon",
    } as Record<string, string>,
    accessModelHint:
      "Erişim modeli kuponun kimlere görüneceğini belirler. Kod/atama kuponları hiçbir public ekranda listelenmez.",
    accessPublicNote: "Herkese açık: ürün/sepet/kupon merkezinde listelenir.",
    accessPrivateNote: "Özel: yalnızca kodu bilen ya da atanan müşteri görür; public listelenmez.",
    previewHint: "Bu yalnızca görünüm önizlemesidir; indirim hesabı yapılmaz.",
    previewUse: "Kullan",
    previewDetails: "Detaylar",
    previewPublic: "Herkese açık",
    previewPrivate: "Özel",
    previewNoTitle: "(otomatik başlık)",
    previewMinOrder: "Alt limit",
    previewNoMinOrder: "Alt limit yok",
    previewValidity: "Geçerlilik",
    detailDisplay: "Kupon kartı görünümü",
    detailAccess: "Erişim",
    detailNoDisplay: "Görünüm alanı ayarlanmadı (otomatik etiket kullanılır).",
  },
  en: {
    eyebrow: "Sales",
    title: "Campaigns",
    description:
      "Coupon code and automatic cart/product/category campaigns. Discounts are computed server-side; usage limits are enforced at order time.",
    add: "New campaign",
    empty: "No campaigns yet",
    emptyDesc: "Create a coupon code or automatic discount campaign.",
    colName: "Campaign",
    colType: "Type",
    colDiscount: "Discount",
    colWindow: "Date range",
    colUsage: "Usage",
    colStatus: "Status",
    typeLabels: {
      COUPON_CODE: "Coupon code",
      AUTOMATIC_CART: "Automatic cart",
      PRODUCT_DISCOUNT: "Product discount",
      CATEGORY_DISCOUNT: "Category discount",
      BUY_X_GET_Y: "Buy X get Y",
      FREE_SHIPPING: "Free shipping",
      MEMBERSHIP_ONLY: "Members only",
    } as Record<string, string>,
    statusLabels: {
      DRAFT: "Draft",
      ACTIVE: "Active",
      PAUSED: "Paused",
      ARCHIVED: "Archived",
    } as Record<string, string>,
    edit: "Edit",
    detail: "Details",
    activate: "Activate",
    pause: "Pause",
    archive: "Archive",
    archiveConfirm: "The campaign will be archived and can no longer be edited. Continue?",
    formTitleNew: "New campaign",
    formTitleEdit: "Edit campaign",
    formName: "Campaign name",
    formDescription: "Description (optional)",
    formType: "Campaign type",
    formDiscountType: "Discount type",
    percent: "Percent (%)",
    fixed: "Fixed amount (₺)",
    formDiscountValuePercent: "Discount percent (1-100)",
    formDiscountValueFixed: "Discount amount (₺)",
    formMaxDiscount: "Max discount (₺, optional)",
    formMinOrder: "Minimum order amount (₺, optional)",
    formStartsAt: "Starts at (optional)",
    formEndsAt: "Ends at (optional)",
    formTotalLimit: "Total usage limit (optional)",
    formPerCustomerLimit: "Per-customer limit (optional)",
    formStackable: "Can combine with other campaigns (stackable)",
    formPriority: "Priority",
    formCouponCode: "Coupon code",
    formCouponCodeHint: "2-40 chars; letters/digits/dash/underscore. Normalized to uppercase.",
    generateCouponCode: "Generate automatically",
    formProducts: "Product scope (optional)",
    formCategories: "Category scope (optional)",
    scopeHint: "If the scope is empty, the campaign applies to the whole cart.",
    save: "Save",
    create: "Create",
    cancel: "Cancel",
    saved: "Campaign saved.",
    detailCoupons: "Coupon codes",
    detailStats: "Usage statistics",
    detailRedemptions: "Recent redemptions",
    statTotalRedemptions: "Total redemptions",
    statTotalDiscount: "Total discount",
    // F4A.2 — Snapshot-based campaign analytics (ADR-059).
    statUniqueCustomers: "Unique customers",
    statOrdersSubtotal: "Revenue before discount",
    statOrdersTotal: "Revenue after discount (charged)",
    statAvgDiscount: "Avg discount / order",
    statAvgOrderTotal: "Avg order total",
    statLastRedemption: "Last redemption",
    analyticsNote:
      "Analytics are computed from order-time discount snapshots; redemptions of cancelled orders remain included historically.",
    redemptionOrderTotal: "order",
    noRedemptions: "No redemptions yet.",
    couponUsage: "uses",
    close: "Close",
    // F4A.3 — Coupon assignment (ADR-060).
    assignTitle: "Assign coupon to customer",
    assignHint:
      "Public coupons appear on product/cart screens. Private coupons are usable only by the customer who knows the code or is assigned it.",
    assignCouponLabel: "Coupon",
    assignEmailLabel: "Customer email",
    assignEmailPlaceholder: "customer@example.com",
    assignSubmit: "Assign",
    assignEmpty: "No assignments yet.",
    assignError: "Could not assign the coupon. Check the details.",
    assignSuccess: "Coupon assigned.",
    assignColCustomer: "Customer",
    assignColStatus: "Status",
    assignColSource: "Source",
    assignColDate: "Date",
    statusAVAILABLE: "Available",
    statusAPPLIED: "Applied",
    statusUSED: "Used",
    statusREVOKED: "Revoked",
    sourceADMIN_ASSIGNED: "Assigned",
    sourcePUBLIC_CLAIMED: "Public claim",
    sourceCODE_CLAIMED: "Code claim",
    validationName: "Campaign name is required.",
    validationPercent: "Percent must be between 1 and 100.",
    validationFixed: "Discount amount must be positive.",
    validationCoupon: "Coupon code is required (2-40 chars, letters/digits/-/_).",
    validationWindow: "End date must be after the start date.",
    validationDisplayTitle: "Coupon title can be at most 120 characters.",
    validationShortDescription: "Short description can be at most 240 characters.",
    validationBadgeLabel: "Card label can be at most 40 characters.",
    validationTerms: "Details can be at most 2000 characters.",
    // F4A.4 — Presentation / card fields (ADR-061). Display-only; do not affect
    // discount calculation. No follow-to-earn option exists anywhere.
    sectionDisplay: "Display / Coupon Card",
    sectionDiscount: "Discount Rule",
    sectionValidity: "Validity",
    sectionAccess: "Access / Audience",
    sectionScope: "Scope",
    sectionPreview: "Preview",
    formDisplayTitle: "Coupon title (optional)",
    formDisplayTitleHint:
      "Customer-facing title, e.g. “₺100 off over ₺500 this weekend”. Falls back to a generated label if empty.",
    formShortDescription: "Short description (optional)",
    formTerms: "Details / terms (optional)",
    formBadgeLabel: "Card label (optional)",
    formBadgeVariant: "Badge variant",
    formCardStyle: "Card style",
    formAccessModel: "Access model",
    formDisplayPriority: "Display order",
    formDisplayPriorityHint:
      "Only orders coupon cards; does not change discount priority.",
    badgeVariantLabels: {
      DEFAULT: "Standard",
      SUPER: "Super coupon",
      LIMITED_TIME: "Limited time",
      PERSONAL: "For you",
      WEEKEND: "Weekend",
      NEW_CUSTOMER: "New customer",
    } as Record<string, string>,
    cardStyleLabels: {
      STANDARD: "Standard",
      FEATURED: "Featured",
      PERSONAL: "For you",
    } as Record<string, string>,
    accessModelLabels: {
      AUTO_VISIBLE: "Automatic cart discount",
      PUBLIC_CLAIMABLE: "Public claimable coupon",
      CODE_CLAIMED: "Private code-claimed coupon",
      ADMIN_ASSIGNED: "Admin-assigned coupon",
    } as Record<string, string>,
    accessModelHint:
      "The access model controls who sees the coupon. Code/assigned coupons never appear on any public screen.",
    accessPublicNote: "Public: listed on product/cart/coupon center.",
    accessPrivateNote: "Private: only the customer who knows the code or is assigned sees it; not listed publicly.",
    previewHint: "This is a display preview only; no discount is calculated.",
    previewUse: "Use",
    previewDetails: "Details",
    previewPublic: "Public",
    previewPrivate: "Private",
    previewNoTitle: "(auto title)",
    previewMinOrder: "Min order",
    previewNoMinOrder: "No minimum",
    previewValidity: "Validity",
    detailDisplay: "Coupon card display",
    detailAccess: "Access",
    detailNoDisplay: "No display fields set (a generated label is used).",
  },
} satisfies Record<Locale, unknown>;

const BADGE_VARIANTS = [
  "DEFAULT",
  "SUPER",
  "LIMITED_TIME",
  "PERSONAL",
  "WEEKEND",
  "NEW_CUSTOMER",
] as const satisfies readonly CampaignBadgeVariant[];
const CARD_STYLES = ["STANDARD", "FEATURED", "PERSONAL"] as const satisfies readonly CampaignCardStyle[];
const ACCESS_MODELS = [
  "AUTO_VISIBLE",
  "PUBLIC_CLAIMABLE",
  "CODE_CLAIMED",
  "ADMIN_ASSIGNED",
] as const satisfies readonly CampaignAccessModel[];

/** F4A.4 — accessModel'den isPublic türetimi (contracts ile aynı kural). */
function isPublicAccess(accessModel: CampaignAccessModel): boolean {
  return accessModel === "AUTO_VISIBLE" || accessModel === "PUBLIC_CLAIMABLE";
}

interface FormState {
  name: string;
  description: string;
  type: CreatableType;
  discountType: "PERCENT" | "FIXED_AMOUNT";
  discountValue: string;
  maxDiscount: string;
  minOrder: string;
  startsAt: string;
  endsAt: string;
  totalLimit: string;
  perCustomerLimit: string;
  stackable: boolean;
  priority: string;
  couponCode: string;
  productIds: string[];
  categoryIds: string[];
  // F4A.4 — Sunum alanları (ADR-061); yalnızca görünüm.
  displayTitle: string;
  shortDescription: string;
  terms: string;
  badgeLabel: string;
  badgeVariant: CampaignBadgeVariant;
  cardStyle: CampaignCardStyle;
  accessModel: CampaignAccessModel;
  displayPriority: string;
}

const emptyForm: FormState = {
  name: "",
  description: "",
  type: "COUPON_CODE",
  discountType: "PERCENT",
  discountValue: "",
  maxDiscount: "",
  minOrder: "",
  startsAt: "",
  endsAt: "",
  totalLimit: "",
  perCustomerLimit: "",
  stackable: false,
  priority: "0",
  couponCode: "",
  productIds: [],
  categoryIds: [],
  displayTitle: "",
  shortDescription: "",
  terms: "",
  badgeLabel: "",
  badgeVariant: "DEFAULT",
  cardStyle: "STANDARD",
  accessModel: "PUBLIC_CLAIMABLE",
  displayPriority: "0",
};

/** ISO tarihini datetime-local input değerine çevirir (yerel saat). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function positiveIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * F4A.4 — Bitiş tarihinden türetilmiş kısa geçerlilik etiketi (ADR-061). Yalnızca
 * ÖNIZLEME içindir; motorla ilgisi yoktur. "Bugün bitiyor" / "Son 9 Saat" / "Son 3 Gün".
 */
function deriveExpiryLabel(endsIso: string | null, locale: Locale): string | null {
  if (!endsIso) return null;
  const end = new Date(endsIso);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return locale === "tr" ? "Süresi doldu" : "Expired";
  const sameDay =
    end.getFullYear() === now.getFullYear() &&
    end.getMonth() === now.getMonth() &&
    end.getDate() === now.getDate();
  if (sameDay) return locale === "tr" ? "Bugün bitiyor" : "Ends today";
  const hours = Math.ceil(ms / 3_600_000);
  if (hours <= 48) return locale === "tr" ? `Son ${hours} Saat` : `${hours}h left`;
  const days = Math.ceil(hours / 24);
  return locale === "tr" ? `Son ${days} Gün` : `${days}d left`;
}

/** Önizleme için tam geçerlilik aralığı ("04.07.2026 00:00 - 05.07.2026 23:59"). */
function formatValidityRange(startIso: string | null, endIso: string | null, locale: Locale): string | null {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(locale === "tr" ? "tr-TR" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const start = startIso ? fmt(startIso) : null;
  const end = endIso ? fmt(endIso) : null;
  if (start && end) return `${start} - ${end}`;
  return end ?? start ?? null;
}

export default function CampaignsPage() {
  const locale = useLocale() as Locale;
  const t = L[locale] ?? L.tr;

  const [campaigns, setCampaigns] = useState<CampaignResponse[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignResponse | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<CampaignDetailResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const [campaignList, productList, categoryList] = await Promise.all([
        storeApi.listCampaigns(),
        storeApi.listProducts(),
        storeApi.listCategories(),
      ]);
      setCampaigns(campaignList.data);
      setProducts(productList.data);
      setCategories(categoryList.data);
      setError(null);
    } catch (cause) {
      setError(messageForError(cause, locale));
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
    setDetail(null);
  };

  const openEdit = (campaign: CampaignResponse) => {
    setEditing(campaign);
    setForm({
      name: campaign.name,
      description: campaign.description ?? "",
      type: (CREATABLE_TYPES as readonly string[]).includes(campaign.type)
        ? (campaign.type as CreatableType)
        : "AUTOMATIC_CART",
      discountType: campaign.discountType,
      discountValue:
        campaign.discountType === "PERCENT"
          ? String(campaign.discountValue)
          : minorToInput(campaign.discountValue),
      maxDiscount: minorToInput(campaign.maxDiscountAmountMinor),
      minOrder: minorToInput(campaign.minOrderAmountMinor),
      startsAt: isoToLocalInput(campaign.startsAt),
      endsAt: isoToLocalInput(campaign.endsAt),
      totalLimit: campaign.totalUsageLimit != null ? String(campaign.totalUsageLimit) : "",
      perCustomerLimit: campaign.perCustomerUsageLimit != null ? String(campaign.perCustomerUsageLimit) : "",
      stackable: campaign.stackable,
      priority: String(campaign.priority),
      couponCode: campaign.coupons[0]?.code ?? "",
      productIds: campaign.productIds,
      categoryIds: campaign.categoryIds,
      displayTitle: campaign.displayTitle ?? "",
      shortDescription: campaign.shortDescription ?? "",
      terms: campaign.terms ?? "",
      badgeLabel: campaign.badgeLabel ?? "",
      badgeVariant: campaign.badgeVariant ?? "DEFAULT",
      cardStyle: campaign.cardStyle,
      accessModel: campaign.accessModel,
      displayPriority: String(campaign.displayPriority),
    });
    setFormError(null);
    setFormOpen(true);
    setDetail(null);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  };

  /** Form doğrulaması + istek gövdesi. Hata varsa mesaj döner (istek atılmaz). */
  const buildPayload = (): { payload: CampaignCreateRequest } | { message: string } => {
    if (!form.name.trim()) return { message: t.validationName };
    let discountValue: number;
    if (form.discountType === "PERCENT") {
      discountValue = Number.parseInt(form.discountValue, 10);
      if (!Number.isFinite(discountValue) || discountValue < 1 || discountValue > 100) {
        return { message: t.validationPercent };
      }
    } else {
      const minor = inputToMinor(form.discountValue);
      if (minor == null || minor <= 0) return { message: t.validationFixed };
      discountValue = minor;
    }
    const couponCode = form.couponCode.trim();
    if (form.type === "COUPON_CODE" && !/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(couponCode)) {
      return { message: t.validationCoupon };
    }
    const startsAt = localInputToIso(form.startsAt);
    const endsAt = localInputToIso(form.endsAt);
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
      return { message: t.validationWindow };
    }
    // F4A.4 — Sunum alanı uzunluk doğrulaması (server ile aynı sınırlar).
    const displayTitle = form.displayTitle.trim();
    const shortDescription = form.shortDescription.trim();
    const badgeLabel = form.badgeLabel.trim();
    const terms = form.terms.trim();
    if (displayTitle.length > 120) return { message: t.validationDisplayTitle };
    if (shortDescription.length > 240) return { message: t.validationShortDescription };
    if (badgeLabel.length > 40) return { message: t.validationBadgeLabel };
    if (terms.length > 2000) return { message: t.validationTerms };
    // Otomatik tipler yalnızca AUTO_VISIBLE olabilir; kupon tipi kod/atama modellerini destekler.
    const accessModel: CampaignAccessModel =
      form.type === "COUPON_CODE" ? form.accessModel : "AUTO_VISIBLE";
    return {
      payload: {
        name: form.name.trim(),
        description: form.description.trim() ? form.description.trim() : null,
        type: form.type,
        discountType: form.discountType,
        discountValue,
        maxDiscountAmountMinor: inputToMinor(form.maxDiscount),
        minOrderAmountMinor: inputToMinor(form.minOrder),
        startsAt,
        endsAt,
        totalUsageLimit: positiveIntOrNull(form.totalLimit),
        perCustomerUsageLimit: positiveIntOrNull(form.perCustomerLimit),
        stackable: form.stackable,
        priority: Number.parseInt(form.priority, 10) || 0,
        productIds: form.productIds,
        categoryIds: form.categoryIds,
        couponCode: form.type === "COUPON_CODE" ? couponCode : null,
        // F4A.4 — Sunum alanları (ADR-061). isPublic sunucuda accessModel'den türetilir.
        displayTitle: displayTitle || null,
        shortDescription: shortDescription || null,
        terms: terms || null,
        badgeLabel: badgeLabel || null,
        badgeVariant: form.badgeVariant,
        cardStyle: form.cardStyle,
        accessModel,
        displayPriority: Number.parseInt(form.displayPriority, 10) || 0,
      },
    };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const built = buildPayload();
    if ("message" in built) {
      setFormError(built.message);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        // Tip ve kupon kodu güncellemede değiştirilemez (sunucu sözleşmesi).
        const update: Record<string, unknown> = { ...built.payload };
        delete update.type;
        delete update.couponCode;
        await storeApi.updateCampaign(editing.id, update as CampaignUpdateRequest);
      } else {
        await storeApi.createCampaign(built.payload);
      }
      setNotice(t.saved);
      closeForm();
      await load();
    } catch (cause) {
      setFormError(messageForError(cause, locale));
    } finally {
      setSaving(false);
    }
  };

  const statusAction = async (campaign: CampaignResponse, action: "activate" | "pause" | "archive") => {
    if (action === "archive" && !window.confirm(t.archiveConfirm)) return;
    setBusyId(campaign.id);
    setError(null);
    try {
      await storeApi.campaignStatusAction(campaign.id, action);
      await load();
    } catch (cause) {
      setError(messageForError(cause, locale));
    } finally {
      setBusyId(null);
    }
  };

  const openDetail = async (campaign: CampaignResponse) => {
    setFormOpen(false);
    setError(null);
    try {
      setDetail(await storeApi.getCampaign(campaign.id));
    } catch (cause) {
      setError(messageForError(cause, locale));
    }
  };

  const discountLabel = (campaign: CampaignResponse) =>
    campaign.discountType === "PERCENT"
      ? `%${campaign.discountValue}`
      : formatMinor(campaign.discountValue, "TRY");

  const windowLabel = (campaign: CampaignResponse) => {
    const fmt = (iso: string | null) =>
      iso ? new Date(iso).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB") : "—";
    if (!campaign.startsAt && !campaign.endsAt) return "—";
    return `${fmt(campaign.startsAt)} → ${fmt(campaign.endsAt)}`;
  };

  const statusTone = (status: string) =>
    status === "ACTIVE" ? "success" : status === "PAUSED" ? "warning" : status === "ARCHIVED" ? "neutral" : "info";

  const columns = useMemo<DataTableColumn<CampaignResponse>[]>(
    () => [
      {
        header: t.colName,
        cell: (row) => (
          <div>
            <p className="font-medium text-white/90">{row.name}</p>
            {row.coupons.length > 0 ? (
              <p className="text-xs text-white/40">{row.coupons.map((coupon) => coupon.code).join(", ")}</p>
            ) : null}
          </div>
        ),
      },
      { header: t.colType, cell: (row) => t.typeLabels[row.type] ?? row.type },
      { header: t.colDiscount, cell: (row) => discountLabel(row) },
      { header: t.colWindow, cell: (row) => windowLabel(row) },
      {
        header: t.colUsage,
        cell: (row) => `${row.usageCount}${row.totalUsageLimit != null ? ` / ${row.totalUsageLimit}` : ""}`,
      },
      {
        header: t.colStatus,
        cell: (row) => <Badge tone={statusTone(row.status)}>{t.statusLabels[row.status] ?? row.status}</Badge>,
      },
      {
        header: "",
        cell: (row) => (
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => void openDetail(row)}>
              {t.detail}
            </Button>
            {row.status !== "ARCHIVED" ? (
              <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                {t.edit}
              </Button>
            ) : null}
            {row.status === "DRAFT" || row.status === "PAUSED" ? (
              <Button size="sm" variant="secondary" disabled={busyId === row.id} onClick={() => void statusAction(row, "activate")}>
                {t.activate}
              </Button>
            ) : null}
            {row.status === "ACTIVE" ? (
              <Button size="sm" variant="secondary" disabled={busyId === row.id} onClick={() => void statusAction(row, "pause")}>
                {t.pause}
              </Button>
            ) : null}
            {row.status !== "ARCHIVED" ? (
              <Button size="sm" variant="danger" disabled={busyId === row.id} onClick={() => void statusAction(row, "archive")}>
                {t.archive}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [t, busyId, campaigns],
  );

  const scopePicker = (
    label: string,
    items: Array<{ id: string; label: string }>,
    selected: string[],
    onChange: (ids: string[]) => void,
  ) => (
    <div>
      <p className="mb-1 text-xs font-medium text-white/60">{label}</p>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.03] p-2">
        {items.length === 0 ? (
          <p className="px-1 py-0.5 text-xs text-white/35">—</p>
        ) : (
          items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-white/75 hover:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, item.id]
                      : selected.filter((id) => id !== item.id),
                  )
                }
              />
              {item.label}
            </label>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <Button onClick={openCreate}>
            {t.add}
          </Button>
        }
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {formOpen ? (
        <SectionCard title={editing ? t.formTitleEdit : t.formTitleNew}>
          <form onSubmit={submit} className="space-y-5">
            {formError ? <Alert tone="error">{formError}</Alert> : null}

            {/* Section 1 — Görünüm / Kupon Kartı (sunum; indirim hesabını etkilemez). */}
            <FormSection title={t.sectionDisplay}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label={t.formName}
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
                <Input
                  label={t.formDisplayTitle}
                  value={form.displayTitle}
                  maxLength={120}
                  onChange={(event) => setForm((prev) => ({ ...prev, displayTitle: event.target.value }))}
                />
              </div>
              <p className="text-xs text-white/40">{t.formDisplayTitleHint}</p>
              <Input
                label={t.formShortDescription}
                value={form.shortDescription}
                maxLength={240}
                onChange={(event) => setForm((prev) => ({ ...prev, shortDescription: event.target.value }))}
              />
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  label={t.formBadgeLabel}
                  value={form.badgeLabel}
                  maxLength={40}
                  onChange={(event) => setForm((prev) => ({ ...prev, badgeLabel: event.target.value }))}
                />
                <Select
                  label={t.formBadgeVariant}
                  value={form.badgeVariant}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, badgeVariant: event.target.value as CampaignBadgeVariant }))
                  }
                  options={BADGE_VARIANTS.map((v) => ({ value: v, label: t.badgeVariantLabels[v] ?? v }))}
                />
                <Select
                  label={t.formCardStyle}
                  value={form.cardStyle}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, cardStyle: event.target.value as CampaignCardStyle }))
                  }
                  options={CARD_STYLES.map((v) => ({ value: v, label: t.cardStyleLabels[v] ?? v }))}
                />
              </div>
              <Textarea
                label={t.formTerms}
                value={form.terms}
                rows={3}
                maxLength={2000}
                onChange={(event) => setForm((prev) => ({ ...prev, terms: event.target.value }))}
              />
            </FormSection>

            {/* Section 2 — İndirim Kuralı (motorun kullandığı alanlar). */}
            <FormSection title={t.sectionDiscount}>
              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label={t.formType}
                  value={form.type}
                  disabled={editing !== null}
                  onChange={(event) =>
                    setForm((prev) => {
                      const type = event.target.value as CreatableType;
                      // Otomatik tiplerde yalnızca AUTO_VISIBLE; kupon tipinde claim modelleri.
                      const accessModel: CampaignAccessModel =
                        type === "COUPON_CODE"
                          ? prev.accessModel === "AUTO_VISIBLE"
                            ? "PUBLIC_CLAIMABLE"
                            : prev.accessModel
                          : "AUTO_VISIBLE";
                      return { ...prev, type, accessModel };
                    })
                  }
                  options={CREATABLE_TYPES.map((type) => ({ value: type, label: t.typeLabels[type] ?? type }))}
                />
                <Select
                  label={t.formDiscountType}
                  value={form.discountType}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      discountType: event.target.value as FormState["discountType"],
                      discountValue: "",
                    }))
                  }
                  options={[
                    { value: "PERCENT", label: t.percent },
                    { value: "FIXED_AMOUNT", label: t.fixed },
                  ]}
                />
                <Input
                  label={form.discountType === "PERCENT" ? t.formDiscountValuePercent : t.formDiscountValueFixed}
                  value={form.discountValue}
                  onChange={(event) => setForm((prev) => ({ ...prev, discountValue: event.target.value }))}
                  inputMode="decimal"
                  required
                />
                <Input
                  label={t.formMaxDiscount}
                  value={form.maxDiscount}
                  onChange={(event) => setForm((prev) => ({ ...prev, maxDiscount: event.target.value }))}
                  inputMode="decimal"
                />
                <Input
                  label={t.formMinOrder}
                  value={form.minOrder}
                  onChange={(event) => setForm((prev) => ({ ...prev, minOrder: event.target.value }))}
                  inputMode="decimal"
                />
                <Input
                  label={t.formTotalLimit}
                  value={form.totalLimit}
                  onChange={(event) => setForm((prev) => ({ ...prev, totalLimit: event.target.value }))}
                  inputMode="numeric"
                />
                <Input
                  label={t.formPerCustomerLimit}
                  value={form.perCustomerLimit}
                  onChange={(event) => setForm((prev) => ({ ...prev, perCustomerLimit: event.target.value }))}
                  inputMode="numeric"
                />
                <Input
                  label={t.formPriority}
                  value={form.priority}
                  onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
                  inputMode="numeric"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-white/75">
                <input
                  type="checkbox"
                  checked={form.stackable}
                  onChange={(event) => setForm((prev) => ({ ...prev, stackable: event.target.checked }))}
                />
                {t.formStackable}
              </label>
              {form.type === "COUPON_CODE" ? (
                <div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        label={t.formCouponCode}
                        value={form.couponCode}
                        disabled={editing !== null}
                        onChange={(event) => setForm((prev) => ({ ...prev, couponCode: event.target.value }))}
                      />
                    </div>
                    {/* F4A.1 — Otomatik kod önerisi; üretim sonrası düzenlenebilir. */}
                    {editing === null ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            couponCode: generateCouponCode({
                              name: prev.name,
                              discountType: prev.discountType,
                              discountValue:
                                prev.discountType === "PERCENT"
                                  ? Number.parseInt(prev.discountValue, 10) || null
                                  : inputToMinor(prev.discountValue),
                            }),
                          }))
                        }
                      >
                        {t.generateCouponCode}
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-white/40">{t.formCouponCodeHint}</p>
                </div>
              ) : null}
              <Textarea
                label={t.formDescription}
                value={form.description}
                rows={2}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </FormSection>

            {/* Section 3 — Geçerlilik. */}
            <FormSection title={t.sectionValidity}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label={t.formStartsAt}
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
                />
                <Input
                  label={t.formEndsAt}
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))}
                />
              </div>
              {deriveExpiryLabel(localInputToIso(form.endsAt), locale) ? (
                <p className="text-xs text-white/50">
                  {t.previewValidity}: <span className="font-medium text-white/75">
                    {deriveExpiryLabel(localInputToIso(form.endsAt), locale)}
                  </span>
                </p>
              ) : null}
            </FormSection>

            {/* Section 4 — Erişim / Kitle. isPublic accessModel'den türetilir. */}
            <FormSection title={t.sectionAccess}>
              {form.type === "COUPON_CODE" ? (
                <Select
                  label={t.formAccessModel}
                  value={form.accessModel}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, accessModel: event.target.value as CampaignAccessModel }))
                  }
                  options={ACCESS_MODELS.filter((m) => m !== "AUTO_VISIBLE").map((m) => ({
                    value: m,
                    label: t.accessModelLabels[m] ?? m,
                  }))}
                />
              ) : (
                <p className="text-sm text-white/70">
                  {t.accessModelLabels.AUTO_VISIBLE}
                </p>
              )}
              <p className="text-xs text-white/40">{t.accessModelHint}</p>
              <p className="text-xs text-white/50">
                {isPublicAccess(form.type === "COUPON_CODE" ? form.accessModel : "AUTO_VISIBLE")
                  ? t.accessPublicNote
                  : t.accessPrivateNote}
              </p>
            </FormSection>

            {/* Section 5 — Kapsam. */}
            <FormSection title={t.sectionScope}>
              <div className="grid gap-3 md:grid-cols-2">
                {scopePicker(
                  t.formProducts,
                  products.map((product) => ({ id: product.id, label: product.title })),
                  form.productIds,
                  (ids) => setForm((prev) => ({ ...prev, productIds: ids })),
                )}
                {scopePicker(
                  t.formCategories,
                  categories.map((category) => ({ id: category.id, label: category.name })),
                  form.categoryIds,
                  (ids) => setForm((prev) => ({ ...prev, categoryIds: ids })),
                )}
              </div>
              <p className="text-xs text-white/40">{t.scopeHint}</p>
            </FormSection>

            {/* Section 6 — Önizleme (yalnızca görünüm; indirim hesaplanmaz). */}
            <FormSection title={t.sectionPreview}>
              <CampaignCardPreview form={form} t={t} locale={locale} />
              <p className="text-xs text-white/40">{t.previewHint}</p>
            </FormSection>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {editing ? t.save : t.create}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {detail ? (
        <SectionCard
          title={detail.name}
          actions={
            <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
              {t.close}
            </Button>
          }
        >
          {/* F4A.4 — Kupon kartı görünüm alanları özeti (ADR-061). */}
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">
              {t.detailDisplay}
            </p>
            {detail.displayTitle || detail.shortDescription || detail.badgeLabel || detail.terms ? (
              <div className="mt-1 space-y-0.5 text-sm text-white/80">
                {detail.badgeLabel ? (
                  <span className="mr-2 rounded-full bg-brand-500/20 px-2 py-0.5 text-[11px] font-semibold text-brand-200">
                    {detail.badgeLabel}
                  </span>
                ) : null}
                {detail.displayTitle ? <span className="font-semibold">{detail.displayTitle}</span> : null}
                {detail.shortDescription ? (
                  <p className="text-xs text-white/55">{detail.shortDescription}</p>
                ) : null}
                {detail.terms ? <p className="text-xs text-white/45">{detail.terms}</p> : null}
              </div>
            ) : (
              <p className="mt-1 text-sm text-white/50">{t.detailNoDisplay}</p>
            )}
            <p className="mt-2 text-xs text-white/50">
              {t.detailAccess}: {t.accessModelLabels[detail.accessModel] ?? detail.accessModel} ·{" "}
              {detail.isPublic ? t.previewPublic : t.previewPrivate}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {/* F4A.2 (ADR-059) — Snapshot-tabanlı analitik: kullanım, tekil müşteri,
                toplam indirim, ciro öncesi/sonrası, ortalamalar, son kullanım. */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-white/40">{t.detailStats}</p>
              <p className="mt-1 text-sm text-white/80">
                {t.statTotalRedemptions}: <span className="font-semibold">{detail.analytics.redemptionCount}</span>
              </p>
              <p className="text-sm text-white/80">
                {t.statUniqueCustomers}: <span className="font-semibold">{detail.analytics.uniqueCustomerCount}</span>
              </p>
              <p className="text-sm text-white/80">
                {t.statTotalDiscount}: <span className="font-semibold">{formatMinor(detail.analytics.totalDiscountMinor, "TRY")}</span>
              </p>
              <p className="text-sm text-white/80">
                {t.statOrdersSubtotal}: <span className="font-semibold">{formatMinor(detail.analytics.ordersSubtotalMinor, "TRY")}</span>
              </p>
              <p className="text-sm text-white/80">
                {t.statOrdersTotal}: <span className="font-semibold">{formatMinor(detail.analytics.ordersTotalMinor, "TRY")}</span>
              </p>
              <p className="text-sm text-white/80">
                {t.statAvgDiscount}: <span className="font-semibold">{formatMinor(detail.analytics.avgDiscountPerOrderMinor, "TRY")}</span>
              </p>
              <p className="text-sm text-white/80">
                {t.statAvgOrderTotal}: <span className="font-semibold">{formatMinor(detail.analytics.avgOrderTotalMinor, "TRY")}</span>
              </p>
              <p className="text-sm text-white/80">
                {t.statLastRedemption}:{" "}
                <span className="font-semibold">
                  {detail.analytics.lastRedemptionAt
                    ? new Date(detail.analytics.lastRedemptionAt).toLocaleDateString(
                        locale === "tr" ? "tr-TR" : "en-GB",
                      )
                    : "—"}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-white/40">{t.detailCoupons}</p>
              {detail.coupons.length === 0 ? (
                <p className="mt-1 text-sm text-white/50">—</p>
              ) : (
                detail.coupons.map((coupon) => (
                  <p key={coupon.id} className="mt-1 text-sm text-white/80">
                    <span className="font-mono font-semibold">{coupon.code}</span>{" "}
                    <span className="text-white/45">
                      ({coupon.usageCount} {t.couponUsage})
                    </span>
                  </p>
                ))
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-white/40">{t.detailRedemptions}</p>
              {detail.recentRedemptions.length === 0 ? (
                <p className="mt-1 text-sm text-white/50">{t.noRedemptions}</p>
              ) : (
                detail.recentRedemptions.map((redemption) => (
                  <p key={redemption.id} className="mt-1 text-sm text-white/70">
                    <Link
                      href={`/orders/${redemption.orderId}`}
                      className="font-medium text-white/85 underline-offset-2 hover:underline"
                    >
                      {redemption.orderNumber ?? redemption.orderId}
                    </Link>{" "}
                    · −{formatMinor(redemption.discountAmountMinor, "TRY")}
                    {redemption.orderTotalMinor != null
                      ? ` · ${formatMinor(redemption.orderTotalMinor, "TRY")} ${t.redemptionOrderTotal}`
                      : ""}
                    {redemption.maskedEmail ? ` · ${redemption.maskedEmail}` : ""}
                    {" · "}
                    {new Date(redemption.createdAt).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB")}
                  </p>
                ))
              )}
            </div>
          </div>
          {detail.type === "COUPON_CODE" && detail.coupons.length > 0 ? (
            <CampaignAssignments detail={detail} t={t} locale={locale} />
          ) : null}
          <p className="mt-4 text-xs text-white/35">{t.analyticsNote}</p>
        </SectionCard>
      ) : null}

      <SectionCard title={t.title}>
        {campaigns === null ? (
          <SkeletonRows rows={4} />
        ) : campaigns.length === 0 ? (
          <EmptyState icon={<CampaignIcon />} title={t.empty} description={t.emptyDesc} />
        ) : (
          <DataTable columns={columns} rows={campaigns} rowKey={(row) => row.id} />
        )}
      </SectionCard>
    </div>
  );
}

/**
 * F4A.3 (ADR-060) — Kampanya detayindan kupon atama: hangi musteri/email'e hangi
 * kupon dagitildi. Atama e-posta ile yapilir; ortak backend (assignCoupon).
 * Public/private ayrimi kampanya isPublic'e baglidir; atama kuponu public YAPMAZ.
 */
/** F4A.4 — Form bölüm sarmalayıcısı (görsel gruplama). */
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      {children}
    </section>
  );
}

/**
 * F4A.4 — Store-admin kupon kartı ÖNIZLEMESI (ADR-061). Yalnızca görünüm;
 * gerçek indirim hesabı YAPMAZ. Alanlar boşsa üretilmiş fallback'e döner.
 */
function CampaignCardPreview({
  form,
  t,
  locale,
}: {
  form: FormState;
  t: (typeof L)[Locale];
  locale: Locale;
}) {
  const accessModel: CampaignAccessModel =
    form.type === "COUPON_CODE" ? form.accessModel : "AUTO_VISIBLE";
  const isPublic = isPublicAccess(accessModel);

  const discountText =
    form.discountType === "PERCENT"
      ? `%${form.discountValue || "—"}`
      : form.discountValue
        ? formatMinor(inputToMinor(form.discountValue) ?? 0, "TRY")
        : "—";

  const title = form.displayTitle.trim() || form.name.trim() || t.previewNoTitle;
  const badge = form.badgeLabel.trim() || t.badgeVariantLabels[form.badgeVariant] || null;
  const minOrderMinor = inputToMinor(form.minOrder);
  const expiry = deriveExpiryLabel(localInputToIso(form.endsAt), locale);
  const range = formatValidityRange(localInputToIso(form.startsAt), localInputToIso(form.endsAt), locale);

  return (
    <div className="max-w-sm rounded-xl border border-white/12 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        {badge ? (
          <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[11px] font-semibold text-brand-200">
            {badge}
          </span>
        ) : (
          <span />
        )}
        <span
          className={`text-[11px] font-medium ${isPublic ? "text-emerald-300/80" : "text-amber-300/80"}`}
        >
          {isPublic ? t.previewPublic : t.previewPrivate}
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold text-white/90">{title}</p>
      {form.shortDescription.trim() ? (
        <p className="mt-0.5 text-xs text-white/55">{form.shortDescription.trim()}</p>
      ) : null}

      <p className="mt-3 text-2xl font-bold text-white">{discountText}</p>

      <p className="mt-1 text-xs text-white/60">
        {minOrderMinor != null
          ? `${t.previewMinOrder}: ${formatMinor(minOrderMinor, "TRY")}`
          : t.previewNoMinOrder}
      </p>

      {range ? (
        <p className="mt-1 text-[11px] text-white/45">
          {t.previewValidity}: {range}
          {expiry ? ` · ${expiry}` : ""}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <span className="rounded-md bg-white/15 px-3 py-1 text-xs font-semibold text-white/85">
          {t.previewUse}
        </span>
        {form.terms.trim() ? (
          <span className="text-xs text-brand-300 underline-offset-2">{t.previewDetails}</span>
        ) : null}
      </div>
    </div>
  );
}

function CampaignAssignments({
  detail,
  t,
  locale,
}: {
  detail: CampaignDetailResponse;
  t: (typeof L)[Locale];
  locale: Locale;
}) {
  const [rows, setRows] = useState<CustomerCouponAssignment[] | null>(null);
  const [couponId, setCouponId] = useState(detail.coupons[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await storeApi.listCampaignAssignments(detail.id);
      setRows(res.data);
    } catch {
      setRows([]);
    }
  }, [detail.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(event: FormEvent) {
    event.preventDefault();
    if (!couponId || !email.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await storeApi.assignCampaignCoupon(detail.id, { couponId, email: email.trim() });
      setEmail("");
      setNotice(t.assignSuccess);
      await load();
    } catch {
      setError(t.assignError);
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = (status: CustomerCouponAssignment["status"]) =>
    ({
      AVAILABLE: t.statusAVAILABLE,
      APPLIED: t.statusAPPLIED,
      USED: t.statusUSED,
      REVOKED: t.statusREVOKED,
    })[status];
  const sourceLabel = (source: CustomerCouponAssignment["source"]) =>
    ({
      ADMIN_ASSIGNED: t.sourceADMIN_ASSIGNED,
      PUBLIC_CLAIMED: t.sourcePUBLIC_CLAIMED,
      CODE_CLAIMED: t.sourceCODE_CLAIMED,
    })[source];

  return (
    <div className="mt-6 border-t border-white/10 pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-white/40">{t.assignTitle}</p>
      <p className="mt-1 text-xs text-white/40">{t.assignHint}</p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={assign}>
        <label className="flex flex-col gap-1 text-xs text-white/60">
          {t.assignCouponLabel}
          <Select
            value={couponId}
            onChange={(event) => setCouponId(event.target.value)}
            options={detail.coupons.map((coupon) => ({ value: coupon.id, label: coupon.code }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-white/60">
          {t.assignEmailLabel}
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t.assignEmailPlaceholder}
          />
        </label>
        <Button type="submit" size="sm" disabled={busy || !couponId || !email.trim()}>
          {t.assignSubmit}
        </Button>
      </form>
      {error ? (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="success" className="mt-2">
          {notice}
        </Alert>
      ) : null}
      <div className="mt-3 space-y-1">
        {rows === null ? (
          <SkeletonRows rows={2} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-white/50">{t.assignEmpty}</p>
        ) : (
          rows.map((row) => (
            <p key={row.id} className="text-sm text-white/75">
              <span className="font-mono text-white/85">{row.couponCode}</span>
              {" · "}
              {row.customerName ?? row.maskedEmail ?? "—"}
              {" · "}
              <Badge tone={row.status === "USED" ? "neutral" : "success"}>{statusLabel(row.status)}</Badge>
              {" · "}
              <span className="text-white/45">{sourceLabel(row.source)}</span>
              {row.orderNumber ? (
                <>
                  {" · "}
                  <Link
                    href={`/orders/${row.orderId}`}
                    className="text-white/85 underline-offset-2 hover:underline"
                  >
                    {row.orderNumber}
                  </Link>
                </>
              ) : null}
              {" · "}
              <span className="text-white/40">
                {new Date(row.usedAt ?? row.claimedAt).toLocaleDateString(
                  locale === "tr" ? "tr-TR" : "en-GB",
                )}
              </span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}
