import type {
  PublicCart,
  PublicCartLineStatus,
  PublicCheckoutRequest,
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

export interface CartView {
  lines: CartLineView[];
  subtotalLabel: string;
  itemCount: number;
  checkoutReady: boolean;
  isEmpty: boolean;
  currency: string;
}

export interface OrderConfirmationView {
  orderNumber: string;
  paymentPending: boolean;
  totalLabel: string;
  subtotalLabel: string;
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

function toCartView(cart: PublicCart): CartView {
  return {
    currency: cart.currency,
    itemCount: cart.itemCount,
    checkoutReady: cart.checkoutReady,
    isEmpty: cart.lines.length === 0,
    subtotalLabel: formatMinor(cart.subtotalMinor, cart.currency),
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
export async function resolveCart(items: CartItem[]): Promise<CartResult<CartView>> {
  try {
    const result = await postPublic<PublicCart>(cartPath(), { items });
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
): Promise<CartResult<{ view: CartView; canonicalItems: CartItem[] }>> {
  const result = await resolveCart(items);
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
): Promise<CheckoutResult> {
  try {
    const result = await postPublic<PublicOrderConfirmation>(checkoutPath(), {
      items,
      contact,
      shippingAddress,
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
        totalLabel: formatMinor(confirmation.totalMinor, confirmation.currency),
        subtotalLabel: formatMinor(confirmation.subtotalMinor, confirmation.currency),
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
