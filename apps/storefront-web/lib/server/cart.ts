import type {
  CartChangeSeverity,
  CartChangeType,
  OrderShippingSelection,
  PublicAddressSummary,
  PublicBillingSummary,
  PublicCart,
  PublicCartChange,
  PublicCartLine,
  PublicCartLineChange,
  PublicCartLineStatus,
  PublicCartSummary,
  // TODO-167 (ADR-266) — Persistent (authenticated) cart tipleri.
  CustomerCartProjection,
  CustomerCartResponse,
  CustomerCartMergeResponse,
  PublicCheckoutBilling,
  PublicCheckoutRequest,
  PublicCouponClaimResponse,
  PublicCouponReason,
  PublicCouponStatus,
  PublicOrderConfirmation,
  PublicPaymentAvailability,
  PublicPaymentCard,
  PublicPaymentResult,
  PublicPaymentScenario,
  PublicPaymentState,
  PublicPaymentThreeDsAction,
  PublicWalletCoupon,
  ShippingOption,
} from "@commerce-os/api-client";
import { formatCampaignAmount, getCampaignDiscountText } from "@commerce-os/utils";
import type { CartItem } from "../cart-token";
import type { StorefrontWalletCouponView } from "../catalog-types";
import { formatMinor } from "../money";
import { demoStoreSlug } from "./env";
import { getCustomer, getPublic, postPublic, sendCustomer, type FetchOutcome } from "./gateway";
import { readCustomerToken } from "./customer-cookie";
import { readCartItems, readCartMeta, readClaimedCoupons, writeCartNotice } from "./cart-cookie";
import type { CartMeta, CartMetaSnapshot } from "../cart-meta-token";
import { readAttributionGrant } from "./attribution-cookie";
import { readSponsoredGrants } from "./sponsored-cookie";

/**
 * Vitrin sepet/checkout cozumleyici (F3B.1). Cookie'deki referans kalemlerini
 * gateway'in AUTH GEREKTIRMEYEN public-write uclarina ({@link postPublic}) gonderir
 * ve donen SUNUCU-OTORITER DTO'yu (fiyat/stok/uygunluk gateway'de hesaplanir) saf
 * vitrin gorunum modellerine cevirir. Numerik fiyat yalnizca gateway'in dondurdugu
 * (gorunur fiyatli, ONLINE) satirlardan formatlanir.
 */

/**
 * TODO-168 (ADR-267) — Bir satırdaki değişiklik işareti (vitrin görünümü). Para etiketleri
 * SUNUCU-tarafında biçimlenir (mevcut label deseni); ham fingerprint dışında teknik detay UI'ya sızmaz.
 */
export interface CartLineChangeView {
  changeType: CartChangeType;
  severity: CartChangeSeverity;
  requiresAction: boolean;
  blocking: boolean;
  acknowledged: boolean;
  fingerprint: string;
  /** Para değişimlerinde eski/yeni birim fiyat etiketi (PRICE/DISCOUNT tipleri); diğerlerinde null. */
  oldValueLabel: string | null;
  newValueLabel: string | null;
  oldValueMinor: number | null;
  newValueMinor: number | null;
  currency: string | null;
}

/** Cart-seviyesi değişiklik (panel öğesi): satır işareti + sunum (ürün/varyant/görsel). */
export interface CartChangeView extends CartLineChangeView {
  variantId: string;
  title: string;
  variantTitle: string;
  productSlug: string;
  imageUrl: string | null;
}

export interface CartLineView {
  variantId: string;
  productSlug: string;
  title: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  availableQuantity: number;
  unitPriceLabel: string;
  lineTotalLabel: string;
  minQuantity: number;
  maxQuantity: number | null;
  inStock: boolean;
  status: PublicCartLineStatus;
  /** TODO-168 (ADR-267) — Bu satırdaki değişiklik işareti (yoksa null). */
  change: CartLineChangeView | null;
  /** ADR-065 (Faz 3/Dilim 6a) — Kapak URL'i (gateway allowlist). Yoksa null → yer tutucu. */
  imageUrl: string | null;
  /** Dilim 6a-refine — Satir secim durumu (checkbox). false → toplam/checkout'a girmez. */
  selected: boolean;
  /** Dilim 6a-refine — Ustu-cizili liste (compareAt) fiyat etiketi; indirim yoksa null. */
  compareAtLabel: string | null;
  /** Dilim 6a-refine — KAMPANYA sonrasi birim fiyat etiketi (kampanya varsa; ONCELIKLI). */
  discountedUnitPriceLabel: string | null;
  /** Dilim 6a-refine — KAMPANYA sonrasi satir toplami etiketi (kampanya varsa). */
  discountedLineTotalLabel: string | null;
}

/** Sunucu-otoriter siparis ozeti (bicimli etiketler + makine-okunur durumlar). */
export interface CartSummaryView {
  subtotalLabel: string;
  shippingLabel: string;
  shippingIsFree: boolean;
  /**
   * F3C.2 — Kargo TARİFE quote durumu. OK dışı durumda fiyat gösterilmez; UI
   * duruma göre mesaj basar (ADDRESS_REQUIRED / NO_RATE_PLAN / RATE_NOT_FOUND ...).
   */
  shippingStatus: PublicCart["shipping"]["status"];
  /** Eshik (kargo bedava) etiketi — "X uzeri ucretsiz" copy'si icin. */
  freeShippingThresholdLabel: string;
  /** Pozitif indirim varsa bicimli tutar; yoksa null. */
  discountLabel: string | null;
  taxIncludedLabel: string;
  taxRatePercent: number;
  grandTotalLabel: string;
  couponCode: string | null;
  couponStatus: PublicCouponStatus;
  /** F4A — INVALID kuponun makine-okunur nedeni (UI kopyasi i18n'den secilir). */
  couponReason: PublicCouponReason | null;
  /** F4A — Uygulanan indirim satirlari (kampanya adi + varsa kupon kodu). */
  discountLines: Array<{ label: string; code: string | null; amountLabel: string }>;
  /** F4A.3 — Sepet "Kuponlar" alanindaki kullanilabilir kupon kartlari (cuzdan). */
  availableCoupons: StorefrontWalletCouponView[];
}

/** F4A.3 — Public cuzdan kupon DTO'sunu vitrin gorunumune cevirir (hazir metinler). */
function toWalletCouponView(coupon: PublicWalletCoupon): StorefrontWalletCouponView {
  return {
    code: coupon.code,
    discountText: getCampaignDiscountText({
      type: "COUPON_CODE",
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
    }),
    minOrderLabel:
      coupon.minOrderAmountMinor !== null ? formatCampaignAmount(coupon.minOrderAmountMinor) : null,
    endsAt: coupon.endsAt,
    state: coupon.state,
    source: coupon.source,
  };
}

/** TODO-125 — Checkout kargo secenegi (vitrin gorunum modeli; bicimli fiyat + ham). */
export interface ShippingOptionView {
  optionId: string;
  providerName: string;
  serviceName: string;
  /** Bicimli fiyat etiketi (fiyatlanamazsa null). */
  priceLabel: string | null;
  priceMinor: number | null;
  freeShipping: boolean;
  estimatedDelivery: string | null;
  logoUrl: string | null;
  logoAlt: string | null;
  available: boolean;
}

export interface CartView {
  lines: CartLineView[];
  subtotalLabel: string;
  itemCount: number;
  checkoutReady: boolean;
  isEmpty: boolean;
  currency: string;
  summary: CartSummaryView;
  /** TODO-125 — Secilebilir kargo secenekleri + secili secenek. */
  shippingOptions: ShippingOptionView[];
  selectedShippingOptionId: string | null;
  // TODO-168 (ADR-267) — Cart Change Awareness (severity-sirali panel + ozet bayraklar).
  changes: CartChangeView[];
  unacknowledgedChangeCount: number;
  hasBlockingChanges: boolean;
  hasWarnings: boolean;
  /** Ack bekleyen en az bir WARN → checkout WARN gate (INFO/BLOCKING tetiklemez). */
  requiresAcknowledgement: boolean;
  /** TODO-168 — Analytics cartIdHash grouping için opak cart id (anon: cookie cid; auth: Cart.id). */
  changeCartId: string | null;
}

export interface OrderConfirmationView {
  orderNumber: string;
  paymentPending: boolean;
  subtotalLabel: string;
  shippingLabel: string;
  shippingIsFree: boolean;
  discountLabel: string | null;
  taxIncludedLabel: string;
  taxRatePercent: number;
  totalLabel: string;
  couponCode: string | null;
  couponStatus: PublicCouponStatus;
  contactEmail: string;
  lines: Array<{
    title: string;
    variantTitle: string;
    quantity: number;
    unitPriceLabel: string;
    lineTotalLabel: string;
    /** ADR-065 (Faz 3/Dilim 6a) — Kapak URL'i (gateway allowlist). Yoksa null → yer tutucu. */
    imageUrl: string | null;
  }>;
  /** F3B.2 — Success ekrani teslimat/fatura ozeti (varsa). */
  shippingAddress: PublicAddressSummary | null;
  billing: PublicBillingSummary | null;
  /** TODO-125 — Secilen kargo saglayici/secenek ozeti (varsa). */
  shippingOption: OrderShippingSelection | null;
  /**
   * F3B.2: Uygun TEST/MOCK provider varsa ödeme test sayfasinin yolu (token dahil).
   * Provider yoksa undefined → mevcut onay akisi birebir korunur.
   */
  paymentRedirectPath?: string;
}

export type CartFailure = "no-store" | "error";
export type CartResult<T> = { ok: true; data: T } | { ok: false; reason: CartFailure };

export type CheckoutResult =
  | { ok: true; confirmation: OrderConfirmationView }
  // TODO-168 — "cart-changed": WARN degisiklik ack edilmemis → sepete don + panel goster.
  | { ok: false; reason: "cart-not-ready" | "cart-changed" | "coupon-invalid" | "rejected" | "no-store" | "error" };

function cartPath(): string {
  return `/public/stores/${encodeURIComponent(demoStoreSlug())}/cart`;
}

function checkoutPath(): string {
  return `/public/stores/${encodeURIComponent(demoStoreSlug())}/checkout`;
}

function toSummaryView(summary: PublicCartSummary, shipping: PublicCart["shipping"]): CartSummaryView {
  const shippingOk = shipping.status === "OK";
  return {
    subtotalLabel: formatMinor(summary.itemsSubtotalMinor, summary.currency),
    // Quote OK değilse fiyat etiketi boş kalır; UI duruma göre mesaj basar.
    shippingLabel: shippingOk ? formatMinor(summary.shippingMinor, summary.currency) : "",
    shippingIsFree: shippingOk && shipping.freeShipping,
    shippingStatus: shipping.status,
    freeShippingThresholdLabel: formatMinor(summary.freeShippingThresholdMinor, summary.currency),
    discountLabel: summary.discountMinor > 0 ? formatMinor(summary.discountMinor, summary.currency) : null,
    taxIncludedLabel: formatMinor(summary.taxIncludedMinor, summary.currency),
    taxRatePercent: summary.taxRatePercent,
    grandTotalLabel: formatMinor(summary.grandTotalMinor, summary.currency),
    couponCode: summary.couponCode,
    couponStatus: summary.couponStatus,
    couponReason: summary.couponReason,
    discountLines: summary.discountLines.map((line) => ({
      label: line.label,
      code: line.code,
      amountLabel: formatMinor(line.amountMinor, summary.currency),
    })),
    availableCoupons: (summary.availableCoupons ?? []).map(toWalletCouponView),
  };
}

function toShippingOptionView(option: ShippingOption): ShippingOptionView {
  return {
    optionId: option.optionId,
    providerName: option.providerName,
    serviceName: option.serviceName,
    priceLabel:
      option.priceMinor === null
        ? null
        : option.freeShipping
          ? null
          : formatMinor(option.priceMinor, option.currency),
    priceMinor: option.priceMinor,
    freeShipping: option.freeShipping,
    estimatedDelivery: option.estimatedDelivery,
    logoUrl: option.logoUrl,
    logoAlt: option.logoAlt,
    available: option.available,
  };
}

/** TODO-168 — Para değişimi mi (etiket biçimlenir); stok/varlık/adet değişiminde false (mesaj i18n'den). */
function isMoneyChangeType(t: CartChangeType): boolean {
  return t === "PRICE_DECREASED" || t === "PRICE_INCREASED" || t === "DISCOUNT_STARTED" || t === "DISCOUNT_ENDED";
}

/** PublicCartLineChange → vitrin işareti (para etiketleri sunucu-tarafında biçimlenir). */
function toLineChangeView(change: PublicCartLineChange): CartLineChangeView {
  const money = isMoneyChangeType(change.changeType) && change.currency != null;
  return {
    changeType: change.changeType,
    severity: change.severity,
    requiresAction: change.requiresAction,
    blocking: change.blocking,
    acknowledged: change.acknowledged,
    fingerprint: change.fingerprint,
    oldValueLabel:
      money && change.oldValueMinor != null ? formatMinor(change.oldValueMinor, change.currency as string) : null,
    newValueLabel:
      money && change.newValueMinor != null ? formatMinor(change.newValueMinor, change.currency as string) : null,
    oldValueMinor: change.oldValueMinor,
    newValueMinor: change.newValueMinor,
    currency: change.currency,
  };
}

function toCartView(cart: PublicCart, changeCartId: string | null = null): CartView {
  const lineByVariant = new Map(cart.lines.map((l) => [l.variantId, l]));
  const changes: CartChangeView[] = cart.changes.map((c: PublicCartChange) => {
    const line = lineByVariant.get(c.variantId);
    return {
      ...toLineChangeView(c),
      variantId: c.variantId,
      title: line?.title ?? c.variantId,
      variantTitle: line?.variantTitle ?? "",
      productSlug: line?.productSlug ?? "",
      imageUrl: line?.imageUrl ?? null,
    };
  });
  return {
    currency: cart.currency,
    itemCount: cart.itemCount,
    checkoutReady: cart.checkoutReady,
    isEmpty: cart.lines.length === 0,
    subtotalLabel: formatMinor(cart.subtotalMinor, cart.currency),
    summary: toSummaryView(cart.summary, cart.shipping),
    shippingOptions: cart.shipping.options.map(toShippingOptionView),
    selectedShippingOptionId: cart.shipping.selectedOptionId,
    changes,
    unacknowledgedChangeCount: cart.unacknowledgedChangeCount,
    hasBlockingChanges: cart.hasBlockingChanges,
    hasWarnings: cart.hasWarnings,
    requiresAcknowledgement: cart.requiresAcknowledgement,
    changeCartId,
    lines: cart.lines.map((line) => ({
      variantId: line.variantId,
      productSlug: line.productSlug,
      title: line.title,
      variantTitle: line.variantTitle,
      sku: line.sku,
      quantity: line.quantity,
      availableQuantity: line.availableQuantity,
      unitPriceLabel: formatMinor(line.unitPriceMinor, line.currency),
      lineTotalLabel: formatMinor(line.lineTotalMinor, line.currency),
      minQuantity: line.minOrderQuantity,
      maxQuantity: line.maxOrderQuantity,
      inStock: line.inStock,
      status: line.status,
      change: line.change ? toLineChangeView(line.change) : null,
      imageUrl: line.imageUrl,
      selected: line.selected,
      compareAtLabel:
        line.compareAtMinor != null ? formatMinor(line.compareAtMinor, line.currency) : null,
      discountedUnitPriceLabel:
        line.discountedUnitPriceMinor != null ? formatMinor(line.discountedUnitPriceMinor, line.currency) : null,
      discountedLineTotalLabel:
        line.discountedLineTotalMinor != null ? formatMinor(line.discountedLineTotalMinor, line.currency) : null,
    })),
  };
}

/**
 * F3B.2 — Checkout ONCESI ipucu: store'da checkout sonrasi test odeme adimini
 * surduren bir provider var mi? Hata/ulasilamama durumunda guvenli varsayilan
 * `false` (mevcut demo/UNPAID metni gosterilir). Secret/credential DONMEZ.
 */
export async function getPaymentAvailability(): Promise<boolean> {
  try {
    const result = await getPublic<PublicPaymentAvailability>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/payment-availability`,
    );
    return result.ok ? result.data.testPaymentEnabled : false;
  } catch {
    return false;
  }
}

/**
 * TODO-168 (ADR-267) — ANONIM meta cookie'yi gateway'in `changeContext` gövdesine çevirir. Snapshot
 * cookie OTORİTE DEĞİL; gateway güncel projeksiyonla karşılaştırıp değişiklikleri türetir.
 */
function metaToChangeContext(meta: CartMeta): {
  cartId: string;
  snapshots: Array<{
    variantId: string;
    unitPriceMinor: number;
    listPriceMinor: number | null;
    discountedUnitPriceMinor: number | null;
    currency: string;
    inStock: boolean;
    orderable: boolean;
  }>;
  acknowledgedFingerprints: string[];
} {
  return {
    cartId: meta.cid,
    snapshots: Object.entries(meta.s).map(([variantId, s]) => ({
      variantId,
      unitPriceMinor: s.u,
      listPriceMinor: s.l,
      discountedUnitPriceMinor: s.d,
      currency: s.c,
      inStock: s.k === 1,
      orderable: s.o === 1,
    })),
    acknowledgedFingerprints: meta.a,
  };
}

/** TODO-168 — Güncel bir satırın add-time REFERANS snapshot'ı (meta cookie'ye yazmak için). */
export function lineToMetaSnapshot(line: PublicCartLine, nowSeconds: number): CartMetaSnapshot {
  const orderable = line.status !== "UNAVAILABLE";
  return {
    u: line.unitPriceMinor,
    l: line.compareAtMinor,
    d: line.discountedUnitPriceMinor,
    c: line.currency,
    k: orderable && line.inStock ? 1 : 0,
    o: orderable ? 1 : 0,
    t: nowSeconds,
  };
}

/**
 * TODO-168 — ANONIM baseline yardımcı: sepeti gateway'de çözer ve her satır için güncel snapshot'ı
 * döndürür (add/reconcile aksiyonları eksik baseline'ları meta cookie'ye yazar). Hata → null.
 */
export async function resolveCartBaselines(
  items: CartItem[],
  couponCode?: string | null,
  shippingOptionId?: string | null,
  deselectedVariantIds?: string[],
): Promise<Record<string, CartMetaSnapshot> | null> {
  try {
    const result = await postPublic<PublicCart>(cartPath(), {
      items,
      couponCode: couponCode ?? null,
      shippingOptionId: shippingOptionId ?? null,
      deselectedVariantIds: deselectedVariantIds ?? [],
    });
    if (!result.ok) return null;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const out: Record<string, CartMetaSnapshot> = {};
    for (const line of result.data.lines) out[line.variantId] = lineToMetaSnapshot(line, nowSeconds);
    return out;
  } catch {
    return null;
  }
}

/** Cookie kalemlerini gateway'de coz; gorunum modeli + (gerekirse) reconcile veri. */
export async function resolveCart(
  items: CartItem[],
  couponCode?: string | null,
  shippingOptionId?: string | null,
  deselectedVariantIds?: string[],
): Promise<CartResult<CartView>> {
  try {
    // F3C.2 — Oturum acmis musteride sepet `x-customer-session` ile cozulur ki
    // gateway VARSAYILAN teslimat adresini bulup KARGO TARIFE quote'unu hesaplayabilsin.
    // Token yoksa (anonim) public POST'a duser → gateway ADDRESS_REQUIRED doner.
    // Cookie okuma istek-disi baglamlarda (or. unit test) hata verirse anonim sayilir.
    let customerToken: string | null = null;
    try {
      customerToken = await readCustomerToken();
    } catch {
      customerToken = null;
    }
    // F4A.3 — Misafir cuzdanindaki claim'li kodlar da gateway'e gonderilir (kart
    // adaylarina donusur); oturum acmis musteride cuzdan DB'den zaten gelir.
    let claimedCodes: string[] = [];
    try {
      claimedCodes = await readClaimedCoupons();
    } catch {
      claimedCodes = [];
    }
    // TODO-168 (ADR-267) — ANONIM cart-change: meta cookie'den snapshot/ack gateway'e taşınır.
    // Auth yolda GÖNDERİLMEZ (snapshot/ack DB'den; auth cart projeksiyonu değişiklikleri zaten taşır).
    let changeContext:
      | ReturnType<typeof metaToChangeContext>
      | undefined;
    if (!customerToken) {
      try {
        const meta = await readCartMeta();
        if (meta) changeContext = metaToChangeContext(meta);
      } catch {
        changeContext = undefined;
      }
    }
    const body = {
      items,
      couponCode: couponCode ?? null,
      claimedCodes,
      shippingOptionId: shippingOptionId ?? null,
      // Dilim 6a-refine — Secim-disi satirlar; gateway toplam/checkout'a katmaz.
      deselectedVariantIds: deselectedVariantIds ?? [],
      ...(changeContext ? { changeContext } : {}),
    };
    const result = customerToken
      ? await sendCustomer<PublicCart>("POST", cartPath(), customerToken, body)
      : await postPublic<PublicCart>(cartPath(), body);
    if (!result.ok) {
      return { ok: false, reason: result.status === 404 ? "no-store" : "error" };
    }
    // Anon: analytics cartId = meta cookie cid (varsa). Auth yol resolveAuthCartView'da set edilir.
    return { ok: true, data: toCartView(result.data, changeContext?.cartId ?? null) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * Sepetin gateway'ce cozulmus halini, cookie'ye geri yazilmasi gereken kanonik
 * kalemlerle birlikte dondurur (stale-cart reconciliation): cozulemeyen referans
 * dusurulur, adet stok/limit'e gore kirpilir.
 */
export async function resolveCartWithCanonicalItems(
  items: CartItem[],
  couponCode?: string | null,
  shippingOptionId?: string | null,
  deselectedVariantIds?: string[],
): Promise<CartResult<{ view: CartView; canonicalItems: CartItem[] }>> {
  const result = await resolveCart(items, couponCode, shippingOptionId, deselectedVariantIds);
  if (!result.ok) return result;
  const canonicalItems = result.data.lines
    .filter((line) => line.status !== "UNAVAILABLE" && line.availableQuantity > 0)
    .map((line) => ({ variantId: line.variantId, quantity: line.availableQuantity }));
  return { ok: true, data: { view: result.data, canonicalItems } };
}

// ── TODO-167 (ADR-266) — Authenticated persistent cart (DB; cross-device) ──────────────
// Oturum acmis musteride sepet DB'de yasar (cross-device). Cookie sepeti DEGISMEZ; bu
// yollar yalniz token varken kullanilir. Mutation'lar sunucudan guncel version okur
// (read-then-mutate) → CART_STALE'de BIR kez otoriter state ile yeniden dener (sessiz
// overwrite yok). Fiyat/stok projeksiyonu anonim ile AYNI (sunucu-otoriter).

function authCartPath(): string {
  return `/public/stores/${encodeURIComponent(demoStoreSlug())}/customer/cart`;
}

/**
 * BUG-CART-003 (BUG 2) — Auth DB cart görünüm/fiyatlama girdileri. `deselectedVariantIds`
 * checkbox seçim-dışı satırlar içindir; `couponCode`/`shippingOptionId` uygulanan kupon +
 * seçili kargo (kaynak dogrusu cookie'ler). Bu üçü gateway'e query ile taşınır; `claimedCodes`
 * misafir-claim kodları cookie'den İÇERİDE okunur (anonim `resolveCart` ile simetrik).
 */
export interface AuthCartViewOptions {
  deselectedVariantIds?: string[];
  couponCode?: string | null;
  shippingOptionId?: string | null;
}

/**
 * Oturum acmis musterinin DB sepeti projeksiyonu (version/status/lineIds/cart). Oturum yoksa null.
 * BUG-CART-002 — `deselectedVariantIds` → `?deselected=`; auth cart gorunumunde de checkbox secim-disi
 * satirlar toplam/checkout'a girmez. BUG-CART-003 (BUG 2) — uygulanan kupon/kargo `?coupon=`/`?shippingOption=`
 * ile tasinir ki gateway ANONIM yolla AYNI motorla YENIDEN fiyatlasin (explicit kupon totals'i etkiler).
 * Misafir-claim kodlari cookie'den okunur (`?claimed=`). Mutation/header sayaci bu argumanlari VERMEZ.
 */
export async function getAuthCartProjection(
  opts?: AuthCartViewOptions,
): Promise<CustomerCartProjection | null> {
  let token: string | null = null;
  try {
    token = await readCustomerToken();
  } catch {
    token = null;
  }
  if (!token) return null;
  try {
    // F4A.3 — Misafir cuzdanindaki claim'li kodlar (auth'ta DB cuzdani zaten gelir ama parite icin).
    let claimedCodes: string[] = [];
    try {
      claimedCodes = await readClaimedCoupons();
    } catch {
      claimedCodes = [];
    }
    const params = new URLSearchParams();
    if (opts?.deselectedVariantIds && opts.deselectedVariantIds.length > 0) {
      params.set("deselected", opts.deselectedVariantIds.join(","));
    }
    if (opts?.couponCode) params.set("coupon", opts.couponCode);
    if (opts?.shippingOptionId) params.set("shippingOption", opts.shippingOptionId);
    if (claimedCodes.length > 0) params.set("claimed", claimedCodes.join(","));
    const query = params.toString();
    const result = await getCustomer<CustomerCartResponse>(
      `${authCartPath()}${query ? `?${query}` : ""}`,
      token,
    );
    return result.ok ? result.data.data : null;
  } catch {
    return null;
  }
}

/** Auth cart gorunumu (CartView). Oturum yoksa null → cagiran anonim cookie yoluna duser. */
export async function resolveAuthCartView(
  opts?: AuthCartViewOptions,
): Promise<CartResult<CartView> | null> {
  const proj = await getAuthCartProjection(opts);
  if (!proj) return null;
  return { ok: true, data: toCartView(proj.cart, proj.cartId || null) };
}

/**
 * BUG-CART-003 (BUG 3) — Checkout sepet çözümü. Cart sayfası ile checkout AYNI kanonik sepeti
 * görmeli: oturum açmış müşteride DB cart OTORİTER (cross-device; login-merge sonrası cookie boş
 * olabilir). Önceki hata checkout page'in yalnız cookie (`readCartItems`) okuyup "Sepetiniz boş"
 * göstermesiydi. Bu helper cart sayfasıyla aynı auth-first çözümü uygular; misafirde cookie'ye düşer.
 */
export type CheckoutViewResult =
  | { kind: "ok"; view: CartView }
  | { kind: "empty" }
  | { kind: "error" };

export async function resolveCheckoutView(
  opts: AuthCartViewOptions,
): Promise<CheckoutViewResult> {
  // Oturum açmış müşteride DB cart OTORİTER (cart sayfasıyla AYNI kanonik sepet).
  const authView = await resolveAuthCartView(opts);
  if (authView) {
    if (!authView.ok) return { kind: "error" };
    // Checkout YALNIZCA seçili + sipariş verilebilir satırlardan oluşur; hiç yoksa boş-checkout
    // (deselection tüm satırları kaldırmış ya da hepsi UNAVAILABLE/stok-dışı olabilir).
    const orderableSelected = authView.data.lines.filter(
      (line) => line.selected && line.status !== "UNAVAILABLE" && line.availableQuantity > 0,
    );
    if (authView.data.isEmpty || orderableSelected.length === 0) return { kind: "empty" };
    return { kind: "ok", view: authView.data };
  }
  // Misafir yolu (checkout oturum-korumalı; bu dal nadiren — token yoksa cookie sepetine düşer).
  let items: CartItem[] = [];
  try {
    items = await readCartItems();
  } catch {
    items = [];
  }
  if (items.length === 0) return { kind: "empty" };
  const deselected = new Set(opts.deselectedVariantIds ?? []);
  const filtered = items.filter((item) => !deselected.has(item.variantId));
  if (filtered.length === 0) return { kind: "empty" };
  const result = await resolveCart(filtered, opts.couponCode ?? null, opts.shippingOptionId ?? null);
  if (!result.ok) return { kind: "error" };
  if (result.data.isEmpty) return { kind: "empty" };
  return { kind: "ok", view: result.data };
}

export type AuthCartMutationResult = { ok: true } | { ok: false; code: string };

async function mutateAuthCart(
  run: (token: string, proj: CustomerCartProjection) => Promise<FetchOutcome<unknown>>,
): Promise<AuthCartMutationResult> {
  let token: string | null = null;
  try {
    token = await readCustomerToken();
  } catch {
    token = null;
  }
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const proj = await getAuthCartProjection();
  if (!proj) return { ok: false, code: "CART_UNAVAILABLE" };
  const res = await run(token, proj);
  if (!res.ok && res.code === "CART_STALE") {
    // TODO-167 (ADR-266) — Cross-device: SESSIZ OVERWRITE YAPMA. Kullanici-dostu "başka cihazda
    // güncellendi" bildirimini yaz; revalidate sonrasi cart sayfasi GÜNCEL otoriter projeksiyonu +
    // uyariyi gösterir. Kullanici işlemini gözden geçirip tekrar dener (kör overwrite yok).
    await writeCartNotice({ kind: "crossDevice" });
    return { ok: false, code: "CART_STALE" };
  }
  return res.ok ? { ok: true } : { ok: false, code: res.code ?? "CART_MUTATION_FAILED" };
}

const okOutcome: FetchOutcome<unknown> = { ok: true, data: {} };

/** Bir varyanti auth sepete ekler/artirir. */
export async function authAddLine(variantId: string, quantity: number): Promise<AuthCartMutationResult> {
  return mutateAuthCart((token, proj) =>
    sendCustomer("POST", `${authCartPath()}/lines`, token, {
      variantId,
      quantity,
      cartVersion: proj.version,
    }),
  );
}

/** Bir satirin adedini ayarlar (0 → kaldirir; satir yoksa quantity>0 ise ekler). */
export async function authSetLine(variantId: string, quantity: number): Promise<AuthCartMutationResult> {
  return mutateAuthCart((token, proj) => {
    const lineId = proj.lineIds[variantId];
    if (!lineId) {
      if (quantity > 0) {
        return sendCustomer("POST", `${authCartPath()}/lines`, token, {
          variantId,
          quantity,
          cartVersion: proj.version,
        });
      }
      return Promise.resolve(okOutcome);
    }
    return sendCustomer("PATCH", `${authCartPath()}/lines/${encodeURIComponent(lineId)}`, token, {
      quantity,
      cartVersion: proj.version,
    });
  });
}

/** Bir varyanti auth sepetten cikarir. */
export async function authRemoveLine(variantId: string): Promise<AuthCartMutationResult> {
  return mutateAuthCart((token, proj) => {
    const lineId = proj.lineIds[variantId];
    if (!lineId) return Promise.resolve(okOutcome);
    return sendCustomer("DELETE", `${authCartPath()}/lines/${encodeURIComponent(lineId)}`, token, {
      cartVersion: proj.version,
    });
  });
}

export interface AuthMergeResult {
  merged: number;
  skipped: number;
  limitExceeded: boolean;
}

/** Login sonrasi anonim cookie sepetini auth DB sepetine merge eder (deterministik; overflow raporlu). */
export async function authMergeGuestCart(items: CartItem[]): Promise<AuthMergeResult | null> {
  let token: string | null = null;
  try {
    token = await readCustomerToken();
  } catch {
    token = null;
  }
  if (!token) return null;
  const result = await sendCustomer<CustomerCartMergeResponse>("POST", `${authCartPath()}/merge`, token, {
    items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
  });
  if (!result.ok) return null;
  const r = result.data.data.result;
  return { merged: r.merged, skipped: r.skipped, limitExceeded: r.limitExceeded };
}

// ── TODO-168 (ADR-267) — Authenticated cart-change acknowledgement (cross-device) ──────────────
// Ack CartChangeAck tablosuna yazılır (version bump YOK); guncel projeksiyon degisikligi acknowledged
// doner (WARN checkout gate acilir). BLOCKING'i COZMEZ. Best-effort: hata sessizce yutulur (revalidate
// sonrasi cart guncel state'i gosterir).

/** Tek bir fingerprint'i onaylar (auth). */
export async function authAcknowledgeChange(fingerprint: string): Promise<void> {
  try {
    const token = await readCustomerToken();
    if (!token) return;
    await sendCustomer(
      "POST",
      `${authCartPath()}/changes/${encodeURIComponent(fingerprint)}/acknowledge`,
      token,
      {},
    );
  } catch {
    // sessizce yut: ack kritik değil; revalidate güncel state'i gösterir.
  }
}

/** Görünen tüm (INFO+WARN) değişiklikleri onaylar (auth "tümünü gördüm"). */
export async function authAcknowledgeAllChanges(): Promise<void> {
  try {
    const token = await readCustomerToken();
    if (!token) return;
    await sendCustomer("POST", `${authCartPath()}/changes/acknowledge-all`, token, {});
  } catch {
    // sessizce yut.
  }
}

/** F4A.3 — Kupon/cuzdan uclari taban yolu. */
function couponActionPath(action: "claim" | "apply" | "remove"): string {
  return `/public/stores/${encodeURIComponent(demoStoreSlug())}/cart/coupons/${action}`;
}

/**
 * F4A.3 (ADR-060) — Kupon "claim": kodu sunucuda dogrular, uygunsa cuzdana ekler.
 * Oturum acmis musteride DB'ye, misafirde yanit + cookie (cagiran action) yazilir.
 * Sunucu-otoriter; gecersizse ok=false + neden doner.
 */
export async function claimCouponRemote(code: string): Promise<PublicCouponClaimResponse | null> {
  try {
    let customerToken: string | null = null;
    try {
      customerToken = await readCustomerToken();
    } catch {
      customerToken = null;
    }
    const path = couponActionPath("claim");
    const body = { code };
    const result = customerToken
      ? await sendCustomer<PublicCouponClaimResponse>("POST", path, customerToken, body)
      : await postPublic<PublicCouponClaimResponse>(path, body);
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * F4A.3 — Cuzdan "Kullan"/"Kaldir" senkronu (oturum acmis musteride DB durumu).
 * Best-effort: indirim KAYNAK DOGRUSU couponCode cookie'sidir; bu yalniz cuzdan
 * durumunu senkronlar (misafirde no-op).
 */
export async function syncWalletApplied(code: string, applied: boolean): Promise<void> {
  try {
    const customerToken = await readCustomerToken();
    if (!customerToken) return;
    await sendCustomer<{ ok: boolean }>(
      "POST",
      couponActionPath(applied ? "apply" : "remove"),
      customerToken,
      { code },
    );
  } catch {
    // sessizce yut: cuzdan durumu senkronu kritik degil.
  }
}

export async function submitCheckout(
  items: CartItem[],
  contact: PublicCheckoutRequest["contact"],
  shippingAddress: PublicCheckoutRequest["shippingAddress"],
  billing?: PublicCheckoutBilling,
  billingAddress?: PublicCheckoutRequest["shippingAddress"] | null,
  couponCode?: string | null,
  shippingOptionId?: string | null,
  // BUG-CART-002 — Secim-disi varyantlar; auth checkout'ta DB cart satirlarindan dislanir.
  deselectedVariantIds?: string[],
  // TODO-174B (ADR-282) — "Alışveriş bakiyemi kullan" toggle (yalnız oturum açmış müşteride etkili).
  useShoppingCredit?: boolean,
): Promise<CheckoutResult> {
  try {
    // F3B.3: Oturum acmis musteride checkout, `x-customer-session` ile gonderilir;
    // gateway order'i customerId'ye baglar. Oturum yoksa anonim public POST.
    // Cookie okuma istek-disi baglamlarda (or. unit test) hata verirse anonim sayilir.
    let customerToken: string | null = null;
    try {
      customerToken = await readCustomerToken();
    } catch {
      customerToken = null;
    }
    // TODO-160 (ADR-102) — Influencer attribution GRANT'i first-party cookie'den
    // SUNUCU-tarafında okunur ve checkout gövdesine eklenir. Gateway KENDİ imzasını
    // doğrular; istemci düz influencer/campaign alanı GÖNDEREMEZ. Grant yoksa null.
    let attributionGrant: string | null = null;
    try {
      attributionGrant = await readAttributionGrant();
    } catch {
      attributionGrant = null;
    }
    // TODO-161 (ADR-118) — Sponsorlu ürün grant'leri (tıklanan sponsorlu ürünler) first-party
    // cookie'den SUNUCU-tarafında okunur ve checkout gövdesine eklenir. Gateway KENDİ imzasını
    // doğrular + ürünün siparişte gerçekten var olduğunu kontrol eder. Yoksa boş.
    let sponsoredGrants: string[] = [];
    try {
      sponsoredGrants = await readSponsoredGrants();
    } catch {
      sponsoredGrants = [];
    }
    // TODO-168 (ADR-267) — ANONIM checkout WARN gate: meta cookie snapshot/ack gövdeye eklenir.
    // Auth yolda GÖNDERİLMEZ (gateway DB snapshot/ack kullanır).
    let checkoutChangeContext: ReturnType<typeof metaToChangeContext> | undefined;
    if (!customerToken) {
      try {
        const meta = await readCartMeta();
        if (meta) checkoutChangeContext = metaToChangeContext(meta);
      } catch {
        checkoutChangeContext = undefined;
      }
    }
    const body = {
      items,
      contact,
      shippingAddress,
      ...(billing ? { billing } : {}),
      ...(billingAddress ? { billingAddress } : {}),
      couponCode: couponCode ?? null,
      shippingOptionId: shippingOptionId ?? null,
      ...(deselectedVariantIds && deselectedVariantIds.length > 0
        ? { deselectedVariantIds }
        : {}),
      ...(attributionGrant ? { attributionGrant } : {}),
      ...(sponsoredGrants.length > 0 ? { sponsoredGrants } : {}),
      ...(checkoutChangeContext ? { changeContext: checkoutChangeContext } : {}),
      // TODO-174B — bakiye toggle yalnız oturum açmış müşteride anlamlı (gateway anon'da yoksayar).
      ...(useShoppingCredit && customerToken ? { useShoppingCredit: true } : {}),
    };
    const result = customerToken
      ? await sendCustomer<PublicOrderConfirmation>("POST", checkoutPath(), customerToken, body)
      : await postPublic<PublicOrderConfirmation>(checkoutPath(), body);
    if (!result.ok) {
      if (result.status === 404) return { ok: false, reason: "no-store" };
      // F4A — Kupon reddi (gecersiz/limit dolu) sepete-donus degil; kupon
      // kaldirilarak duzeltilebilir bir durumdur, ayri mesaj gosterilir.
      if (result.status === 409 && result.code === "COUPON_INVALID") {
        return { ok: false, reason: "coupon-invalid" };
      }
      // TODO-168 — WARN degisiklik ack edilmemis: sepete don, panel goster (ham kod gosterilmez).
      if (result.status === 409 && result.code === "CART_CHANGED") {
        return { ok: false, reason: "cart-changed" };
      }
      if (result.status === 409) return { ok: false, reason: "cart-not-ready" };
      if (result.status === 400) return { ok: false, reason: "rejected" };
      return { ok: false, reason: "error" };
    }
    const confirmation = result.data;
    return {
      ok: true,
      confirmation: {
        orderNumber: confirmation.orderNumber,
        paymentPending: confirmation.paymentStatus === "UNPAID",
        subtotalLabel: formatMinor(confirmation.subtotalMinor, confirmation.currency),
        shippingLabel: formatMinor(confirmation.shippingMinor, confirmation.currency),
        shippingIsFree: confirmation.shippingMinor === 0,
        discountLabel:
          confirmation.discountMinor > 0 ? formatMinor(confirmation.discountMinor, confirmation.currency) : null,
        taxIncludedLabel: formatMinor(confirmation.taxIncludedMinor, confirmation.currency),
        taxRatePercent: 20,
        totalLabel: formatMinor(confirmation.totalMinor, confirmation.currency),
        couponCode: confirmation.couponCode,
        couponStatus: confirmation.couponStatus,
        contactEmail: confirmation.contactEmail,
        lines: confirmation.lines.map((line) => ({
          title: line.title,
          variantTitle: line.variantTitle,
          quantity: line.quantity,
          unitPriceLabel: formatMinor(line.unitPriceMinor, line.currency),
          lineTotalLabel: formatMinor(line.lineTotalMinor, line.currency),
          // Dilim 6a — Gateway confirmation kapak URL'i (optional; yoksa null → yer tutucu).
          imageUrl: line.imageUrl ?? null,
        })),
        shippingAddress: confirmation.shippingAddress ?? null,
        billing: confirmation.billing ?? null,
        shippingOption: confirmation.shippingOption ?? null,
        // Provider yoksa confirmation.payment undefined → alan eklenmez.
        paymentRedirectPath: confirmation.payment?.paymentPath,
      },
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** F3B.2 — Public ödeme test sayfasi durumunu/sonucunu cozme yardimcilari. */
function orderPaymentPath(orderId: string): string {
  return `/public/stores/${encodeURIComponent(demoStoreSlug())}/orders/${encodeURIComponent(orderId)}/payment`;
}

export async function getOrderPaymentState(
  orderId: string,
  token: string,
): Promise<FetchOutcome<PublicPaymentState>> {
  return getPublic<PublicPaymentState>(
    `${orderPaymentPath(orderId)}?token=${encodeURIComponent(token)}`,
  );
}

export interface TestPaymentPayload {
  card?: PublicPaymentCard;
  scenario?: PublicPaymentScenario;
  installmentCount?: number;
  threeDsAction?: PublicPaymentThreeDsAction;
}

export async function submitTestPayment(
  orderId: string,
  token: string,
  payload: TestPaymentPayload,
): Promise<FetchOutcome<PublicPaymentResult>> {
  return postPublic<PublicPaymentResult>(orderPaymentPath(orderId), {
    token,
    ...(payload.card ? { card: payload.card } : {}),
    ...(payload.scenario ? { scenario: payload.scenario } : {}),
    installmentCount: payload.installmentCount ?? 1,
    ...(payload.threeDsAction ? { threeDsAction: payload.threeDsAction } : {}),
  });
}
