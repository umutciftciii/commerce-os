import type {
  PublicCart,
  PublicCartLineStatus,
  PublicCartSummary,
  PublicCheckoutRequest,
  PublicCouponStatus,
  PublicOrderConfirmation,
} from "@commerce-os/api-client";
import type { CartItem } from "../cart-token";
import { formatMinor } from "../money";
import { demoStoreSlug } from "./env";
import { postPublic } from "./gateway";

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
  lines: Array<{ title: string; variantTitle: string; quantity: number; lineTotalLabel: string }>;
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
  couponCode?: string | null,
): Promise<CheckoutResult> {
  try {
    const result = await postPublic<PublicOrderConfirmation>(checkoutPath(), {
      items,
      contact,
      shippingAddress,
      couponCode: couponCode ?? null,
    });
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
          lineTotalLabel: formatMinor(line.lineTotalMinor, line.currency),
        })),
      },
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}
