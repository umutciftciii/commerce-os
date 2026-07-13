"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  PublicCheckoutBilling,
  PublicCheckoutRequest,
  PublicPaymentCard,
  PublicPaymentResult,
  PublicPaymentScenario,
  PublicPaymentThreeDsAction,
} from "@commerce-os/api-client";
import { isValidTaxNumber, isValidTckn } from "@commerce-os/api-client";
import type { PublicCouponReason } from "@commerce-os/api-client";
import type { OrderConfirmationView } from "./cart";
import { claimCouponRemote, submitCheckout, submitTestPayment, syncWalletApplied } from "./cart";
import { addItem, removeItem, upsertItem } from "../cart-token";
import {
  addClaimedCoupon,
  clearCartCookie,
  readCartItems,
  readCoupon,
  readDeselectedItems,
  readShippingOption,
  toggleDeselectedItem,
  writeCartItems,
  writeCheckoutConfirmationCookie,
  writeCoupon,
  writeShippingOption,
} from "./cart-cookie";
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

/** F4A.3 — "Kupon Kodu Ekle" (claim) sonucu (UI kopyasi istemci i18n'inde). */
export type ClaimCouponResult =
  | { status: "ok"; code: string }
  | { status: "error"; reason: PublicCouponReason | "error" };

/**
 * F4A.3 (ADR-060) — Kupon kodunu "cuzdana ekle" (claim). Kriter saglaniyorsa
 * "Kuponlar" alanina eklenir (uygulanmaz); degilse guvenli negatif neden doner.
 * Uygulama AYRI adimdir (applyWalletCouponAction / "Kullan").
 */
export async function claimCouponAction(code: string): Promise<ClaimCouponResult> {
  const value = code.trim();
  if (!value) return { status: "error", reason: "NOT_FOUND" };
  const result = await claimCouponRemote(value);
  if (!result || !result.ok) {
    return { status: "error", reason: result?.reason ?? "error" };
  }
  // Misafir cuzdani cookie'ye yazilir (oturum acmis musteride DB'ye zaten yazildi).
  if (result.normalizedCode) {
    await addClaimedCoupon(result.normalizedCode);
  }
  revalidateCart();
  return { status: "ok", code: result.coupon?.code ?? value };
}

/**
 * F4A.3 — Cuzdan kuponunu "Kullan": sepete uygular. Indirim KAYNAK DOGRUSU
 * couponCode cookie'sidir (gateway her istekte yeniden dogrular); ek olarak
 * oturum acmis musteride cuzdan APPLIED'a senkronlanir.
 */
export async function applyWalletCouponAction(code: string): Promise<void> {
  await writeCoupon(code);
  await syncWalletApplied(code, true);
  revalidateCart();
}

/** Uygulanan kuponu sepetten kaldirir (cuzdan kartinda kalir; AVAILABLE'a doner). */
export async function removeCouponAction(): Promise<void> {
  const current = await readCoupon();
  await writeCoupon(null);
  if (current) await syncWalletApplied(current, false);
  revalidateCart();
}

/**
 * TODO-125 — Musterinin sectigi kargo secenegini (= ratePlanId) cookie'ye yazar.
 * Gateway her istekte gecerlilik/ait-olma dogrulamasi yapar ve ucreti secilen
 * plandan YENIDEN hesaplar; bu yalniz tercihin saklanmasidir.
 */
export async function selectShippingOptionAction(optionId: string | null): Promise<void> {
  await writeShippingOption(optionId);
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

/**
 * Dilim 6a-refine — Bir sepet satirinin secim durumunu tersine cevirir (checkbox).
 * Secimi kaldirilan satir sepette KALIR ama gateway toplam/checkout'a katmaz
 * (sunucu-otoriter). Fiyat/adet DEGISMEZ; yalnizca secim cookie'si guncellenir.
 */
export async function toggleCartItemSelectedAction(variantId: string): Promise<void> {
  await toggleDeselectedItem(variantId);
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

  // Fatura alanlari. "Fatura bilgilerim farkli" isaretli DEGILSE fatura bilgisi
  // teslimat/iletisimden turetilir; TCKN/VKN ISTENMEZ ve dogrulanmaz (varsayilan
  // checkout). Yalnizca isaretliyse asagidaki alanlar okunup dogrulanir.
  const billingDifferent = field(formData, "billingDifferent") === "true";
  const billingType = field(formData, "billingType") === "CORPORATE" ? "CORPORATE" : "INDIVIDUAL";
  const billingName = field(formData, "billingName") || fullName;
  const tckn = field(formData, "tckn");
  const companyName = field(formData, "companyName");
  const taxOffice = field(formData, "taxOffice");
  const taxNumber = field(formData, "taxNumber");
  const billingEmail = field(formData, "billingEmail");
  const billingSameAsShipping = field(formData, "billingSameAsShipping") !== "false";
  const billingCity = field(formData, "billingCity");
  const billingDistrict = field(formData, "billingDistrict");
  const billingAddressLine1 = field(formData, "billingAddressLine1");
  const billingAddressLine2 = field(formData, "billingAddressLine2");
  const billingPostalCode = field(formData, "billingPostalCode");

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

  // Fatura dogrulama YALNIZCA "fatura bilgilerim farkli" isaretliyse: Bireysel →
  // ad soyad + gecerli TCKN; Kurumsal → firma + vergi dairesi + gecerli vergi no.
  // (PII gateway'de de bagimsiz dogrulanir; loglanmaz.) Varsayilan checkout'ta
  // (billingDifferent=false) hicbir fatura alani zorunlu degildir.
  if (billingDifferent) {
    if (billingType === "INDIVIDUAL") {
      if (!billingName) fieldErrors.billingName = true;
      if (!tckn || !isValidTckn(tckn)) fieldErrors.tckn = true;
    } else {
      if (!companyName) fieldErrors.companyName = true;
      if (!taxOffice) fieldErrors.taxOffice = true;
      if (!taxNumber || !isValidTaxNumber(taxNumber)) fieldErrors.taxNumber = true;
    }
    if (!billingSameAsShipping) {
      if (!billingCity || !isProvince(billingCity)) fieldErrors.billingCity = true;
      if (!billingDistrict || !isValidProvinceDistrict(billingCity, billingDistrict))
        fieldErrors.billingDistrict = true;
      if (!billingAddressLine1) fieldErrors.billingAddressLine1 = true;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", errorReason: "validation", fieldErrors };
  }

  // Dilim 6a-refine — Checkout YALNIZCA secili satirlari siparise alir; secimi
  // kaldirilan satirlar sepette kalir ama siparise girmez (gateway yine fiyat/stok
  // otoriter dogrular). Hic secili satir yoksa checkout'a gecilmez.
  const allItems = await readCartItems();
  const deselected = await readDeselectedItems();
  const items = allItems.filter((item) => !deselected.includes(item.variantId));
  if (items.length === 0) {
    return { status: "error", errorReason: "cart-not-ready" };
  }
  const coupon = await readCoupon();
  // TODO-125 — Secilen kargo secenegi: formdan (client secimi) gelir; yoksa
  // cookie'deki tercihe duser. Gateway gecerlilik/ucret dogrulamasini yapar.
  const formShippingOption = field(formData, "shippingOptionId");
  const shippingOptionId = formShippingOption || (await readShippingOption());

  // Fatura bilgisi YALNIZCA "farkli" isaretliyse gateway'e gonderilir; aksi halde
  // undefined birakilir ve gateway iletisim/teslimattan TURETIR (TCKN/VKN istemez).
  const billing: PublicCheckoutBilling | undefined = billingDifferent
    ? {
        type: billingType,
        sameAsShipping: billingSameAsShipping,
        name: billingType === "INDIVIDUAL" ? billingName : null,
        tckn: billingType === "INDIVIDUAL" ? tckn : null,
        companyName: billingType === "CORPORATE" ? companyName : null,
        taxOffice: billingType === "CORPORATE" ? taxOffice : null,
        taxNumber: billingType === "CORPORATE" ? taxNumber : null,
        email: optional(billingEmail),
      }
    : undefined;
  const billingAddress: PublicCheckoutRequest["shippingAddress"] | null =
    billingDifferent && !billingSameAsShipping
      ? {
          country,
          city: billingCity,
          district: billingDistrict,
          addressLine1: billingAddressLine1,
          addressLine2: optional(billingAddressLine2),
          postalCode: optional(billingPostalCode),
        }
      : null;

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
    billing,
    billingAddress,
    coupon,
    shippingOptionId || null,
  );

  if (!result.ok) {
    // Sepet artik gecersizse (stok/uygunluk) cookie'yi tazele.
    if (result.reason === "cart-not-ready") {
      revalidateCart();
    }
    return { status: "error", errorReason: result.reason };
  }

  // Basarili: order olustu. Sepeti temizle ve nav rozetini tazele; ancak /checkout'u
  // REVALIDATE ETME — bos sepetle /checkout server bileseni EmptyCheckout render edip
  // CheckoutForm'u (ve client-side yonlendirmeyi) clobber ederdi (F3B.1 regression).
  // Bunun yerine kullanici, sepetten BAGIMSIZ onay/odeme rotasina SUNUCU-TARAFI
  // redirect ile gonderilir; boylece order context (URL token / imzali cookie) korunur.
  await clearCartCookie();
  revalidatePath("/", "layout"); // yalniz nav rozeti (cart count -> 0)
  revalidatePath("/cart");

  // Uygun TEST/MOCK provider varsa: token'li odeme test sayfasi (cart-bagimsiz).
  const paymentPath = result.confirmation.paymentRedirectPath;
  if (paymentPath) {
    redirect(paymentPath);
  }
  // Provider yoksa: onay gorunumunu kisa omurlu imzali cookie'ye yazip success'e git.
  await writeCheckoutConfirmationCookie(result.confirmation);
  redirect("/checkout/success");
}

export type TestPaymentActionState =
  | { status: "idle" }
  | { status: "ok"; result: PublicPaymentResult }
  | { status: "error"; reason: string };

/**
 * F3B.2 — Test ödeme gönderir. Gerçekçi test kartı (veya geri-uyum senaryosu) +
 * taksit gateway public submit ucuna gider; secret/credential client'a asla dönmez.
 * Hata KODU (CARD_NUMBER_INVALID, CARD_EXPIRED, PAYMENT_PROVIDER_NOT_CONFIGURED …)
 * UI'da net mesaja eslenir. FULL PAN/CVC bu action'dan geri DÖNMEZ.
 */
export async function submitTestPaymentAction(
  orderId: string,
  token: string,
  payload: {
    card?: PublicPaymentCard;
    scenario?: PublicPaymentScenario;
    installmentCount?: number;
    threeDsAction?: PublicPaymentThreeDsAction;
  },
): Promise<TestPaymentActionState> {
  const outcome = await submitTestPayment(orderId, token, payload);
  if (!outcome.ok) {
    if (outcome.code) return { status: "error", reason: outcome.code };
    if (outcome.status === 403) return { status: "error", reason: "PAYMENT_TOKEN_INVALID" };
    if (outcome.status === 409) return { status: "error", reason: "PAYMENT_NOT_PAYABLE" };
    return { status: "error", reason: "error" };
  }
  return { status: "ok", result: outcome.data };
}
