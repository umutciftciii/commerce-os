"use server";

import { revalidatePath } from "next/cache";
import type { OrderConfirmationView } from "./cart";
import { submitCheckout } from "./cart";
import { addItem, removeItem, upsertItem } from "../cart-token";
import { readCartItems, readCoupon, writeCartItems, writeCoupon } from "./cart-cookie";
import { isProvince, isValidProvinceDistrict } from "../tr-location-data";
import { normalizeTrPhone } from "../phone";

/**
 * Vitrin sepet/checkout Server Action'lari (F3B.1). Cookie mutasyonu yalnizca bu
 * action'lar (ve route handler'lar) icinde yapilabilir. Hicbiri istemciden gelen
 * fiyat/baslik/salesMode'a guvenmez; yalnizca {variantId, quantity} referansini
 * tutar. Nihai dogrulama gateway'de (sepet cozumleme + order create/place) yapilir.
 */

function revalidateCart(): void {
  // Nav rozeti (layout) + sepet/checkout sayfalari tazelenir.
  revalidatePath("/", "layout");
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

/** Kupon kodunu uygular (cookie'ye yazar; gateway gercek dogrulamayi yapar). */
export async function applyCouponAction(code: string): Promise<void> {
  await writeCoupon(code);
  revalidateCart();
}

/** Uygulanan kuponu kaldirir. */
export async function removeCouponAction(): Promise<void> {
  await writeCoupon(null);
  revalidateCart();
}

/** Bir varyanti sepete ekler (mevcut adede ekleyerek). */
export async function addToCartAction(variantId: string, quantity: number): Promise<void> {
  const items = await readCartItems();
  await writeCartItems(addItem(items, variantId, Math.max(1, Math.floor(quantity || 1))));
  revalidateCart();
}

/** Bir sepet satirinin adedini ayarlar (<=0 ise satiri kaldirir). */
export async function updateCartItemAction(variantId: string, quantity: number): Promise<void> {
  const items = await readCartItems();
  await writeCartItems(upsertItem(items, variantId, Math.floor(quantity)));
  revalidateCart();
}

/** Bir varyanti sepetten cikarir. */
export async function removeCartItemAction(variantId: string): Promise<void> {
  const items = await readCartItems();
  await writeCartItems(removeItem(items, variantId));
  revalidateCart();
}

/** Cookie'yi gateway'in cozdugu kanonik kalemlerle eslestirir (stale reconcile). */
export async function reconcileCartAction(
  canonicalItems: Array<{ variantId: string; quantity: number }>,
): Promise<void> {
  await writeCartItems(canonicalItems);
  revalidateCart();
}

export interface CheckoutFormState {
  status: "idle" | "success" | "error";
  confirmation?: OrderConfirmationView;
  fieldErrors?: Record<string, boolean>;
  /** "validation" | "cart-not-ready" | "rejected" | "no-store" | "error" */
  errorReason?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: string): string | null {
  return value.length > 0 ? value : null;
}

/** Checkout form submit (useActionState). Eksik alanda order OLUSTURMAZ. */
export async function submitCheckoutAction(
  _prevState: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  const fullName = field(formData, "fullName");
  const email = field(formData, "email");
  const phone = field(formData, "phone");
  const country = field(formData, "country") || "TR";
  const city = field(formData, "city");
  const district = field(formData, "district");
  const addressLine1 = field(formData, "addressLine1");
  const addressLine2 = field(formData, "addressLine2");
  const postalCode = field(formData, "postalCode");

  // Sunucu-tarafi form dogrulama (gateway de bagimsiz dogrular). Telefon TR cep
  // formatina, il/ilce ise TR il/ilce verisine gore dogrulanir.
  const normalizedPhone = normalizeTrPhone(phone);
  const fieldErrors: Record<string, boolean> = {};
  if (!fullName) fieldErrors.fullName = true;
  if (!email || !EMAIL_RE.test(email)) fieldErrors.email = true;
  if (!normalizedPhone) fieldErrors.phone = true;
  if (!/^[A-Z]{2}$/.test(country)) fieldErrors.country = true;
  if (!city || !isProvince(city)) fieldErrors.city = true;
  if (!district || !isValidProvinceDistrict(city, district)) fieldErrors.district = true;
  if (!addressLine1) fieldErrors.addressLine1 = true;
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", errorReason: "validation", fieldErrors };
  }

  const items = await readCartItems();
  if (items.length === 0) {
    return { status: "error", errorReason: "cart-not-ready" };
  }
  const coupon = await readCoupon();

  const result = await submitCheckout(
    items,
    { fullName, email, phone: normalizedPhone! },
    {
      country,
      city,
      district,
      addressLine1,
      addressLine2: optional(addressLine2),
      postalCode: optional(postalCode),
    },
    coupon,
  );

  if (!result.ok) {
    // Sepet artik gecersizse (stok/uygunluk) cookie'yi tazele.
    if (result.reason === "cart-not-ready") {
      revalidateCart();
    }
    return { status: "error", errorReason: result.reason };
  }

  // Basarili: sepeti temizle, nav/sepet'i tazele, onayi geri don.
  await writeCartItems([]);
  revalidateCart();
  return { status: "success", confirmation: result.confirmation };
}
