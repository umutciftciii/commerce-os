import type {
  OrderShippingSelection,
  PublicAddressSummary,
  PublicBillingSummary,
  PublicCart,
  PublicCartLineStatus,
  PublicCartSummary,
  PublicCheckoutBilling,
  PublicCheckoutRequest,
  PublicCouponReason,
  PublicCouponStatus,
  PublicOrderConfirmation,
  PublicPaymentAvailability,
  PublicPaymentCard,
  PublicPaymentResult,
  PublicPaymentScenario,
  PublicPaymentState,
  PublicPaymentThreeDsAction,
  ShippingOption,
} from "@commerce-os/api-client";
import type { CartItem } from "../cart-token";
import { formatMinor } from "../money";
import { demoStoreSlug } from "./env";
import { getPublic, postPublic, sendCustomer, type FetchOutcome } from "./gateway";
import { readCustomerToken } from "./customer-cookie";

/**
 * Vitrin sepet/checkout cozumleyici (F3B.1). Cookie'deki referans kalemlerini
 * gateway'in AUTH GEREKTIRMEYEN public-write uclarina ({@link postPublic}) gonderir
 * ve donen SUNUCU-OTORITER DTO'yu (fiyat/stok/uygunluk gateway'de hesaplanir) saf
 * vitrin gorunum modellerine cevirir. Numerik fiyat yalnizca gateway'in dondurdugu
 * (gorunur fiyatli, ONLINE) satirlardan formatlanir.
 */

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
  | { ok: false; reason: "cart-not-ready" | "coupon-invalid" | "rejected" | "no-store" | "error" };

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

function toCartView(cart: PublicCart): CartView {
  return {
    currency: cart.currency,
    itemCount: cart.itemCount,
    checkoutReady: cart.checkoutReady,
    isEmpty: cart.lines.length === 0,
    subtotalLabel: formatMinor(cart.subtotalMinor, cart.currency),
    summary: toSummaryView(cart.summary, cart.shipping),
    shippingOptions: cart.shipping.options.map(toShippingOptionView),
    selectedShippingOptionId: cart.shipping.selectedOptionId,
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

/** Cookie kalemlerini gateway'de coz; gorunum modeli + (gerekirse) reconcile veri. */
export async function resolveCart(
  items: CartItem[],
  couponCode?: string | null,
  shippingOptionId?: string | null,
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
    const body = { items, couponCode: couponCode ?? null, shippingOptionId: shippingOptionId ?? null };
    const result = customerToken
      ? await sendCustomer<PublicCart>("POST", cartPath(), customerToken, body)
      : await postPublic<PublicCart>(cartPath(), body);
    if (!result.ok) {
      return { ok: false, reason: result.status === 404 ? "no-store" : "error" };
    }
    return { ok: true, data: toCartView(result.data) };
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
): Promise<CartResult<{ view: CartView; canonicalItems: CartItem[] }>> {
  const result = await resolveCart(items, couponCode, shippingOptionId);
  if (!result.ok) return result;
  const canonicalItems = result.data.lines
    .filter((line) => line.status !== "UNAVAILABLE" && line.availableQuantity > 0)
    .map((line) => ({ variantId: line.variantId, quantity: line.availableQuantity }));
  return { ok: true, data: { view: result.data, canonicalItems } };
}

export async function submitCheckout(
  items: CartItem[],
  contact: PublicCheckoutRequest["contact"],
  shippingAddress: PublicCheckoutRequest["shippingAddress"],
  billing?: PublicCheckoutBilling,
  billingAddress?: PublicCheckoutRequest["shippingAddress"] | null,
  couponCode?: string | null,
  shippingOptionId?: string | null,
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
    const body = {
      items,
      contact,
      shippingAddress,
      ...(billing ? { billing } : {}),
      ...(billingAddress ? { billingAddress } : {}),
      couponCode: couponCode ?? null,
      shippingOptionId: shippingOptionId ?? null,
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
