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
import {
  authAcknowledgeAllChanges,
  authAcknowledgeChange,
  authAddLine,
  authMergeGuestCart,
  authRemoveLine,
  authSetLine,
  claimCouponRemote,
  getAuthCartProjection,
  resolveCart,
  resolveCartBaselines,
  submitCheckout,
  submitTestPayment,
  syncWalletApplied,
} from "./cart";
import { addItem, removeItem, upsertItem } from "../cart-token";
import { emptyCartMeta, mintCartId } from "../cart-meta-token";
import { readCustomerToken } from "./customer-cookie";
import {
  addClaimedCoupon,
  clearCartCookie,
  clearCartMeta,
  clearCartNotice,
  readCartItems,
  readCartMeta,
  readCoupon,
  readDeselectedItems,
  readShippingOption,
  toggleDeselectedItem,
  writeCartItems,
  writeCartMeta,
  writeCartNotice,
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

/**
 * TODO-167 (ADR-266) — Sepet kaynagi kimlige gore secilir: oturum acmis musteride
 * KALICI DB cart (cross-device), misafirde mevcut HMAC cookie. Anonim yol DEGISMEZ.
 */
async function hasCustomerSession(): Promise<boolean> {
  try {
    return Boolean(await readCustomerToken());
  } catch {
    return false;
  }
}

/**
 * TODO-168 (ADR-267) — ANONIM meta baseline senkronu (yalniz misafir; auth snapshot DB'de LAZY).
 * Sepeti gateway'de cozup EKSIK baseline'lari meta cookie'ye yazar (mevcut snapshot'a DOKUNMAZ →
 * add-time referans korunur, quantity degisikligi baseline'i kaydirmaz); sepette olmayan snapshot'lari
 * (orphan) budar. Ilk add'de cid basilir. Hata → sessiz no-op (birincil sepet ETKILENMEZ).
 */
async function baselineAnonCartMeta(): Promise<void> {
  try {
    const items = await readCartItems();
    if (items.length === 0) {
      await clearCartMeta();
      return;
    }
    const coupon = await readCoupon();
    const shipping = await readShippingOption();
    const deselected = await readDeselectedItems();
    const baselines = await resolveCartBaselines(items, coupon, shipping, deselected);
    if (!baselines) return;
    const meta = (await readCartMeta()) ?? emptyCartMeta(mintCartId());
    const itemVariantIds = new Set(items.map((i) => i.variantId));
    for (const [variantId, snap] of Object.entries(baselines)) {
      if (!meta.s[variantId]) meta.s[variantId] = snap; // yalniz eksik baseline (add-time referans korunur)
    }
    for (const variantId of Object.keys(meta.s)) {
      if (!itemVariantIds.has(variantId)) delete meta.s[variantId]; // orphan snapshot budama
    }
    await writeCartMeta(meta);
  } catch {
    // best-effort: cart-change farkindaligi bozuk cookie'de degrade olur; sepet CALISMAYA devam eder.
  }
}

/** TODO-168 — Sepette olmayan snapshot'lari budar (gateway cagrisi YOK; remove/update/reconcile icin). */
async function pruneAnonCartMeta(): Promise<void> {
  try {
    const items = await readCartItems();
    if (items.length === 0) {
      await clearCartMeta();
      return;
    }
    const meta = await readCartMeta();
    if (!meta) return;
    const itemVariantIds = new Set(items.map((i) => i.variantId));
    let changed = false;
    for (const variantId of Object.keys(meta.s)) {
      if (!itemVariantIds.has(variantId)) {
        delete meta.s[variantId];
        changed = true;
      }
    }
    if (changed) await writeCartMeta(meta);
  } catch {
    // best-effort.
  }
}

/**
 * BUG-CART-002 — Sepete ekleme SONUCU. Basari YALNIZ satir gercekten yazildiktan (auth: DB'ye
 * persist / anon: cookie) sonra dondurulur → vitrin "Sepete eklendi" toast'ini yalniz `ok` iken
 * gosterir. Fail-closed stok kapisi (auth: gateway 409, anon: ORTAK projeksiyon on-dogrulamasi)
 * tukenmis/limiti asan eklemeyi reddeder; istemci "Bu varyant tukendi" gosterir ve refresh eder.
 */
export type AddToCartResult =
  | { ok: true }
  | { ok: false; code: "VARIANT_OUT_OF_STOCK" | "VARIANT_STOCK_LIMIT" | "CART_STALE" | "ERROR" };

/** Bir varyanti sepete ekler (mevcut adede ekleyerek). */
export async function addToCartAction(variantId: string, quantity: number): Promise<AddToCartResult> {
  const qty = Math.max(1, Math.floor(quantity || 1));
  if (await hasCustomerSession()) {
    // Auth: gateway POST /lines FAIL-CLOSED stok kapisi uygular; 409 kodu buraya tasinir.
    const res = await authAddLine(variantId, qty);
    if (!res.ok) {
      const code =
        res.code === "VARIANT_OUT_OF_STOCK" || res.code === "VARIANT_STOCK_LIMIT" || res.code === "CART_STALE"
          ? res.code
          : "ERROR";
      return { ok: false, code };
    }
    revalidateCart();
    return { ok: true };
  }
  // Anon: cookie otoriter; gateway add-endpoint'i yoktur. Yazmadan ONCE ORTAK projeksiyonla
  // (auth kapisiyla ayni availability otoritesi) prospektif satiri dogrula → tukenmis/limiti asan
  // eklemeyi reddet. Projeksiyon (gecici ag hatasi) cozulemezse yazmaya izin ver (sepet sayfasi +
  // checkout yine sunucu-otoriter gate'ler; birincil savunma = dogru PDP projeksiyonu).
  const items = await readCartItems();
  const next = addItem(items, variantId, qty);
  const requestedTotal = next.find((item) => item.variantId === variantId)?.quantity ?? qty;
  const check = await resolveCart(next);
  if (check.ok) {
    const line = check.data.lines.find((l) => l.variantId === variantId);
    if (!line || line.status === "UNAVAILABLE" || line.availableQuantity <= 0) {
      return { ok: false, code: "VARIANT_OUT_OF_STOCK" };
    }
    if (line.availableQuantity < requestedTotal) {
      return { ok: false, code: "VARIANT_STOCK_LIMIT" };
    }
  }
  await writeCartItems(next);
  // TODO-168 — misafir: yeni satirin add-time snapshot'ini baseline'la (mevcutlara dokunmaz).
  await baselineAnonCartMeta();
  revalidateCart();
  return { ok: true };
}

/** Bir sepet satirinin adedini ayarlar (<=0 ise satiri kaldirir). */
export async function updateCartItemAction(variantId: string, quantity: number): Promise<void> {
  const qty = Math.floor(quantity);
  if (await hasCustomerSession()) {
    await authSetLine(variantId, qty);
    revalidateCart();
    return;
  }
  const items = await readCartItems();
  await writeCartItems(upsertItem(items, variantId, qty));
  // TODO-168 — quantity degisikligi snapshot'i KAYDIRMAZ; yalniz 0 (kaldirma) → orphan budama.
  if (qty <= 0) await pruneAnonCartMeta();
  revalidateCart();
}

/** Bir varyanti sepetten cikarir. */
export async function removeCartItemAction(variantId: string): Promise<void> {
  if (await hasCustomerSession()) {
    await authRemoveLine(variantId);
    revalidateCart();
    return;
  }
  const items = await readCartItems();
  await writeCartItems(removeItem(items, variantId));
  // TODO-168 — kaldirilan satirin snapshot'ini/orphan'ini buda.
  await pruneAnonCartMeta();
  revalidateCart();
}

/**
 * TODO-167 (ADR-266) — Login sonrasi anonim cookie sepetini authenticated DB sepetine
 * DETERMINISTIK merge eder; BASARILIYSA anonim cookie temizlenir (cift-defter yok; kismi/
 * basarisizda cookie KORUNUR → sonraki oturumda tekrar denenir). Login akisini BOZMAZ
 * (kendi hatasini yutar; wishlist/recently-viewed merge'inden BAGIMSIZ).
 */
export async function mergeGuestCartAction(): Promise<void> {
  try {
    if (!(await hasCustomerSession())) return;
    const items = await readCartItems();
    if (items.length === 0) return;
    const result = await authMergeGuestCart(items);
    if (result) {
      await clearCartCookie();
      // Kullanici-dostu merge bildirimi (cart sayfasi gosterir). Ham kod tasinmaz.
      await writeCartNotice({
        kind: "merge",
        merged: result.merged,
        limitExceeded: result.limitExceeded,
        // Gonderilenden az urun tasindiysa (gecersiz/stoksuz veya sinir) ve sinir degilse: kismi.
        partial: items.length > result.merged && !result.limitExceeded,
      });
    }
  } catch {
    // best-effort: merge hatasi login'i bozmaz (anonim cookie korunur).
  }
}

/** Bildirimi temizler (one-shot: gosterimden sonra client mount'ta veya kapat ile). */
export async function clearCartNoticeAction(): Promise<void> {
  await clearCartNotice();
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
  // TODO-168 — cozulemeyen (dusurulen) satirlarin orphan snapshot'larini buda.
  await pruneAnonCartMeta();
  revalidateCart();
}

/**
 * TODO-168 (ADR-267) — Tek bir degisikligi "gordum" (per-fingerprint ack). Auth → CartChangeAck DB
 * (cross-device); misafir → meta cookie `a` kumesi. INFO surface'i kapatir + WARN checkout gate'ini
 * acar. BLOCKING'i COZMEZ (satir yine gorunur). Ham teknik detay UI'ya sizmaz (yalniz fingerprint).
 */
export async function acknowledgeCartChangeAction(fingerprint: string): Promise<void> {
  const fp = typeof fingerprint === "string" ? fingerprint.trim() : "";
  if (!fp) return;
  if (await hasCustomerSession()) {
    await authAcknowledgeChange(fp);
    revalidateCart();
    return;
  }
  try {
    const meta = await readCartMeta();
    if (!meta) return; // meta yoksa gosterilecek degisiklik de yok
    if (!meta.a.includes(fp)) meta.a.push(fp);
    await writeCartMeta(meta);
  } catch {
    // best-effort.
  }
  revalidateCart();
}

/** TODO-168 — "Tumunu gordum": gorunur (INFO+WARN) degisiklikleri onaylar (BLOCKING haric). */
export async function acknowledgeAllCartChangesAction(): Promise<void> {
  if (await hasCustomerSession()) {
    await authAcknowledgeAllChanges();
    revalidateCart();
    return;
  }
  try {
    const meta = await readCartMeta();
    if (!meta) return;
    // Guncel degisiklikleri coz → BLOCKING disi fingerprint'leri ack kumesine ekle.
    const items = await readCartItems();
    const coupon = await readCoupon();
    const shipping = await readShippingOption();
    const deselected = await readDeselectedItems();
    const view = await resolveCart(items, coupon, shipping, deselected);
    if (view.ok) {
      for (const change of view.data.changes) {
        if (change.severity !== "BLOCKING" && !meta.a.includes(change.fingerprint)) {
          meta.a.push(change.fingerprint);
        }
      }
    }
    await writeCartMeta(meta);
  } catch {
    // best-effort.
  }
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
  // TODO-167 (ADR-266) — Oturum acmis musteride sepet KALICI DB cart'tan gelir (cookie
  // login-merge sonrasi bos olabilir). Burada bos-sepet guard'i + gorunum icin item listesi
  // turetilir. BUG-CART-002 — auth yolda da deselection UYGULANIR: secim-disi (checkbox
  // kaldirilmis) + OUT_OF_STOCK/UNAVAILABLE satirlar checkout item listesinden dislanir
  // (misafir yoluyla ayni semantik). Gateway yine fiyat/stok otoriter dogrular.
  const deselectedForCheckout = await readDeselectedItems();
  const authProj = await getAuthCartProjection({ deselectedVariantIds: deselectedForCheckout });
  let items: Array<{ variantId: string; quantity: number }>;
  if (authProj) {
    items = authProj.cart.lines
      .filter(
        (line) =>
          line.selected &&
          line.status !== "UNAVAILABLE" &&
          line.availableQuantity > 0,
      )
      .map((line) => ({ variantId: line.variantId, quantity: line.availableQuantity }));
  } else {
    const allItems = await readCartItems();
    items = allItems.filter((item) => !deselectedForCheckout.includes(item.variantId));
  }
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
    // BUG-CART-002 — Secim-disi varyantlar checkout'a katilmaz (auth: gateway DB cart'tan diser).
    deselectedForCheckout,
    // TODO-174B (ADR-282) — "Alışveriş bakiyemi kullan" toggle (checkbox → on/true).
    formData.get("useShoppingCredit") === "on" || formData.get("useShoppingCredit") === "true",
  );

  if (!result.ok) {
    // TODO-168 — WARN degisiklik ack edilmemis: kullaniciyi SEPETE dondur (panel otomatik gorunur;
    // ham CART_CHANGED kodu gosterilmez). Sepette resolveCart degisiklikleri yeniden hesaplar.
    if (result.reason === "cart-changed") {
      revalidateCart();
      redirect("/cart");
    }
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
    // TODO-167 (ADR-266) — Ödeme tamamlanmadı → cart CONVERTED OLMAZ (settlement yok); sepet ACTIVE
    // korunur. Kullanıcı sepete döndüğünde "ödeme tamamlanmadı, sepetiniz korundu" bildirimi görür.
    await writeCartNotice({ kind: "paymentPreserved" });
    if (outcome.code) return { status: "error", reason: outcome.code };
    if (outcome.status === 403) return { status: "error", reason: "PAYMENT_TOKEN_INVALID" };
    if (outcome.status === 409) return { status: "error", reason: "PAYMENT_NOT_PAYABLE" };
    return { status: "error", reason: "error" };
  }
  return { status: "ok", result: outcome.data };
}
