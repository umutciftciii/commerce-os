import type {
  PublicAddressSummary,
  PublicBillingSummary,
  PublicCart,
  PublicCartLineStatus,
  PublicCartSummary,
  PublicCheckoutBilling,
  PublicCheckoutRequest,
  PublicCouponStatus,
  PublicOrderConfirmation,
  PublicPaymentAvailability,
  PublicPaymentCard,
  PublicPaymentResult,
  PublicPaymentScenario,
  PublicPaymentState,
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
  /** Eshik (kargo bedava) etiketi — "X uzeri ucretsiz" copy'si icin. */
  freeShippingThresholdLabel: string;
  /** Pozitif indirim varsa bicimli tutar; yoksa null. */
  discountLabel: string | null;
  taxIncludedLabel: string;
  taxRatePercent: number;
  grandTotalLabel: string;
  couponCode: string | null;
  couponStatus: PublicCouponStatus;
}

export interface CartView {
  lines: CartLineView[];
  subtotalLabel: string;
  itemCount: number;
  checkoutReady: boolean;
  isEmpty: boolean;
  currency: string;
  summary: CartSummaryView;
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
  | { ok: false; reason: "cart-not-ready" | "rejected" | "no-store" | "error" };

function cartPath(): string {
  return `/public/stores/${encodeURIComponent(demoStoreSlug())}/cart`;
}

function checkoutPath(): string {
  return `/public/stores/${encodeURIComponent(demoStoreSlug())}/checkout`;
}

function toSummaryView(summary: PublicCartSummary): CartSummaryView {
  return {
    subtotalLabel: formatMinor(summary.itemsSubtotalMinor, summary.currency),
    shippingLabel: formatMinor(summary.shippingMinor, summary.currency),
    shippingIsFree: summary.shippingMinor === 0,
    freeShippingThresholdLabel: formatMinor(summary.freeShippingThresholdMinor, summary.currency),
    discountLabel: summary.discountMinor > 0 ? formatMinor(summary.discountMinor, summary.currency) : null,
    taxIncludedLabel: formatMinor(summary.taxIncludedMinor, summary.currency),
    taxRatePercent: summary.taxRatePercent,
    grandTotalLabel: formatMinor(summary.grandTotalMinor, summary.currency),
    couponCode: summary.couponCode,
    couponStatus: summary.couponStatus,
  };
}

function toCartView(cart: PublicCart): CartView {
  return {
    currency: cart.currency,
    itemCount: cart.itemCount,
    checkoutReady: cart.checkoutReady,
    isEmpty: cart.lines.length === 0,
    subtotalLabel: formatMinor(cart.subtotalMinor, cart.currency),
    summary: toSummaryView(cart.summary),
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
): Promise<CartResult<CartView>> {
  try {
    const result = await postPublic<PublicCart>(cartPath(), { items, couponCode: couponCode ?? null });
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
): Promise<CartResult<{ view: CartView; canonicalItems: CartItem[] }>> {
  const result = await resolveCart(items, couponCode);
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
    };
    const result = customerToken
      ? await sendCustomer<PublicOrderConfirmation>("POST", checkoutPath(), customerToken, body)
      : await postPublic<PublicOrderConfirmation>(checkoutPath(), body);
    if (!result.ok) {
      if (result.status === 404) return { ok: false, reason: "no-store" };
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
  });
}
