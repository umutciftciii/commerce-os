/**
 * TODO-176 — Deterministik `e2e-store` seed (Playwright E2E regresyon paketi PR1, Task 2).
 *
 * Amac: E2E testlerinin uzerine kosacagi SABIT, IDEMPOTENT bir mağaza + katalog + test
 * musterisi + kupon + onceden-var siparis kurar. Her yazma STABIL bir unique anahtar
 * uzerinden upsert'tir (slug/sku/email/orderNumber/id) → seed IKI KEZ kosunca duplicate
 * URETMEZ ve hata VERMEZ.
 *
 * Kapsam (YALNIZ e2e- prefix'li satirlar; `demo-store` / `enterprise-demo` / uretim verisine
 * ASLA dokunmaz — bkz. cleanup-smoke.ts SMOKE_PREFIXES `e2e-`):
 *   - plan (e2e-plan) + store (slug e2e-store, status ACTIVE) + StoreDomain (e2e-store.localhost)
 *   - test musterisi (e2e-customer@example.test, status ACTIVE) + CustomerCredential (loginable)
 *   - cok-varyantli urun e2e-tshirt (priceMinor 20000) + 3 varyant (S/M/L) + stok
 *   - basit urun e2e-mug (priceMinor 5000) + tek varyant + stok
 *   - kupon E2E10 (Campaign COUPON_CODE / PERCENT %10 / ACTIVE)
 *   - onceden-var siparis e2e-order-1001 (musteriye bagli, 1 satir e2e-mug x1, PLACED/PAID)
 *   - musteri teslimat/fatura adresi (Task 9 — checkout sayfasi adres olmadan render OLMAZ)
 *
 * Guvenlik: APP_ENV yalniz development/test/undefined iken kosar (uretim koruma).
 *
 * Login sozlesmesi (Task 3 icin KRITIK): gateway `/public/stores/e2e-store/customer/login`
 * ister ki (1) Customer.status === "ACTIVE", (2) CustomerCredential.passwordHash mevcut,
 * (3) verifyPassword(password, hash, config.PASSWORD_HASH_PEPPER) dogru. hashPassword burada
 * `process.env.PASSWORD_HASH_PEPPER ?? ""` ile hash'ler; seed gateway CONTAINER'i icinde
 * kostugu icin ayni pepper env'ini paylasir → hash/verify tutarli.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@commerce-os/auth";

const prisma = new PrismaClient();

/* Sabitler — Task 3+ testleri bu literal'lere birebir bagimlidir. */
const STORE_SLUG = "e2e-store";
const STORE_ID = "e2e-store";
const STORE_DOMAIN = "e2e-store.localhost";
const PLAN_CODE = "e2e-plan";
const CUSTOMER_EMAIL = "e2e-customer@example.test";
const CUSTOMER_PASSWORD = "E2eCustomer!pass1";
const CUSTOMER_ID = "e2e-customer-1";
// Store-admin login (Shopping Balance Admin E2E) — SUPER_ADMIN platform user; store-admin app
// mağazayı STORE_ADMIN_DEMO_STORE_SLUG=e2e-store ile seçer (bkz. store-context.ts).
const ADMIN_EMAIL = "e2e-admin@example.test";
const ADMIN_PASSWORD = "E2eAdmin!pass1";
// Cross-store izolasyon: ikinci mağaza + kendi bakiyeli müşterisi. Bu müşteri e2e-store'un
// alışveriş bakiyesi listesinde ASLA görünmemeli (storeId-first scope).
const STORE2_SLUG = "e2e-store-2";
const STORE2_ID = "e2e-store-2";
const STORE2_CUSTOMER_EMAIL = "e2e-store2-customer@example.test";
const STORE2_CUSTOMER_ID = "e2e-store2-customer-1";
const TSHIRT_SLUG = "e2e-tshirt";
const TSHIRT_ID = "e2e-product-tshirt";
const TSHIRT_PRICE_MINOR = 20000;
const MUG_SLUG = "e2e-mug";
const MUG_ID = "e2e-product-mug";
const MUG_PRICE_MINOR = 5000;
const MUG_VARIANT_ID = "e2e-variant-mug-std";
const MUG_SKU = "e2e-mug-std";
const COUPON_CODE = "E2E10";
const CAMPAIGN_ID = "e2e-campaign-e2e10";
const ORDER_NUMBER = "e2e-order-1001";
const ORDER_ID = "e2e-order-1001";
const ORDER_LINE_ID = "e2e-order-1001-line-1";
const PAYMENT_ATTEMPT_ID = "e2e-order-1001-payment-1";
const ADDRESS_ID = "e2e-customer-address-1";

const TSHIRT_VARIANTS = [
  { id: "e2e-variant-tshirt-s", sku: "e2e-tshirt-s", title: "S", optionValues: { size: "S" } },
  { id: "e2e-variant-tshirt-m", sku: "e2e-tshirt-m", title: "M", optionValues: { size: "M" } },
  { id: "e2e-variant-tshirt-l", sku: "e2e-tshirt-l", title: "L", optionValues: { size: "L" } },
];

async function upsertActiveProduct(id, slug, title, description) {
  return prisma.product.upsert({
    where: { storeId_slug: { storeId: STORE_ID, slug } },
    update: { title, description, status: "ACTIVE", type: "PHYSICAL", salesMode: "ONLINE", purchasable: true },
    create: {
      id,
      storeId: STORE_ID,
      title,
      slug,
      description,
      status: "ACTIVE",
      type: "PHYSICAL",
      salesMode: "ONLINE",
      purchasable: true,
    },
  });
}

async function upsertVariant({ id, productId, sku, title, priceMinor, optionValues }) {
  return prisma.productVariant.upsert({
    where: { storeId_sku: { storeId: STORE_ID, sku } },
    update: { productId, title, priceMinor, currency: "TRY", status: "ACTIVE", optionValues },
    create: {
      id,
      storeId: STORE_ID,
      productId,
      title,
      sku,
      priceMinor,
      currency: "TRY",
      status: "ACTIVE",
      optionValues,
    },
  });
}

async function upsertStock(variantId, quantityOnHand) {
  await prisma.inventoryItem.upsert({
    where: { variantId },
    update: { storeId: STORE_ID, quantityOnHand, quantityReserved: 0 },
    create: { storeId: STORE_ID, variantId, quantityOnHand, quantityReserved: 0 },
  });
}

async function main() {
  if (!["development", "test", undefined].includes(process.env.APP_ENV)) {
    throw new Error(`Refusing e2e seed when APP_ENV=${process.env.APP_ENV}`);
  }

  // 1) Plan + Store (ACTIVE) — seed.mjs upsert deseni.
  const plan = await prisma.plan.upsert({
    where: { code: PLAN_CODE },
    update: { name: "E2E Plan" },
    create: { code: PLAN_CODE, name: "E2E Plan", description: "Deterministic E2E regression plan.", metadata: { seeded: "e2e" } },
  });

  const store = await prisma.store.upsert({
    where: { slug: STORE_SLUG },
    update: { name: "E2E Store", status: "ACTIVE" },
    create: { id: STORE_ID, name: "E2E Store", slug: STORE_SLUG, status: "ACTIVE", metadata: { seeded: "e2e" } },
  });

  // 2) StoreDomain (opsiyonel — gateway store cozumu slug ile de calisir).
  await prisma.storeDomain.upsert({
    where: { domain: STORE_DOMAIN },
    update: { storeId: store.id, type: "SYSTEM_SUBDOMAIN", status: "ACTIVE" },
    create: { storeId: store.id, domain: STORE_DOMAIN, type: "SYSTEM_SUBDOMAIN", status: "ACTIVE" },
  });

  await prisma.subscription.upsert({
    where: { id: `${store.id}-${plan.id}` },
    update: { status: "ACTIVE", planId: plan.id, storeId: store.id },
    create: { id: `${store.id}-${plan.id}`, storeId: store.id, planId: plan.id, status: "ACTIVE", metadata: { seeded: "e2e" } },
  });

  // 3) Test musterisi + credential (LOGINABLE: status ACTIVE + passwordHash).
  const passwordHash = await hashPassword(CUSTOMER_PASSWORD, process.env.PASSWORD_HASH_PEPPER ?? "");
  const customer = await prisma.customer.upsert({
    where: { storeId_email: { storeId: store.id, email: CUSTOMER_EMAIL } },
    update: { firstName: "E2E", lastName: "Customer", status: "ACTIVE", emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z") },
    create: {
      id: CUSTOMER_ID,
      storeId: store.id,
      email: CUSTOMER_EMAIL,
      firstName: "E2E",
      lastName: "Customer",
      status: "ACTIVE",
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  await prisma.customerCredential.upsert({
    where: { customerId: customer.id },
    update: { storeId: store.id, passwordHash },
    create: { storeId: store.id, customerId: customer.id, passwordHash },
  });

  // 3b) Store-admin platform kullanıcısı (SUPER_ADMIN) — Shopping Balance Admin E2E login'i.
  //     store-admin app STORE_ADMIN_DEMO_STORE_SLUG=e2e-store ile mağazayı seçer.
  const adminPasswordHash = await hashPassword(ADMIN_PASSWORD, process.env.PASSWORD_HASH_PEPPER ?? "");
  await prisma.platformUser.upsert({
    where: { email: ADMIN_EMAIL },
    update: { name: "E2E Admin", passwordHash: adminPasswordHash, role: "SUPER_ADMIN" },
    create: { email: ADMIN_EMAIL, name: "E2E Admin", passwordHash: adminPasswordHash, role: "SUPER_ADMIN" },
  });

  // 4) Cok-varyantli urun e2e-tshirt (priceMinor 20000) + 3 varyant + stok.
  const tshirt = await upsertActiveProduct(TSHIRT_ID, TSHIRT_SLUG, "E2E Tshirt", "Deterministic multi-variant product for E2E regression.");
  for (const variant of TSHIRT_VARIANTS) {
    const persisted = await upsertVariant({
      id: variant.id,
      productId: tshirt.id,
      sku: variant.sku,
      title: variant.title,
      priceMinor: TSHIRT_PRICE_MINOR,
      optionValues: variant.optionValues,
    });
    await upsertStock(persisted.id, 100);
  }

  // 5) Basit urun e2e-mug (priceMinor 5000) + tek varyant + stok.
  const mug = await upsertActiveProduct(MUG_ID, MUG_SLUG, "E2E Mug", "Deterministic single-variant product for E2E regression.");
  const mugVariant = await upsertVariant({
    id: MUG_VARIANT_ID,
    productId: mug.id,
    sku: MUG_SKU,
    title: "Standart",
    priceMinor: MUG_PRICE_MINOR,
    optionValues: {},
  });
  await upsertStock(mugVariant.id, 100);

  // 6) Kupon E2E10 (Campaign COUPON_CODE / PERCENT %10 / ACTIVE).
  await prisma.campaign.upsert({
    where: { id: CAMPAIGN_ID },
    update: { status: "ACTIVE", discountValue: 10 },
    create: {
      id: CAMPAIGN_ID,
      storeId: store.id,
      name: "E2E %10 Coupon",
      status: "ACTIVE",
      type: "COUPON_CODE",
      discountType: "PERCENT",
      discountValue: 10,
      isPublic: false,
      accessModel: "CODE_CLAIMED",
    },
  });
  await prisma.coupon.upsert({
    where: { storeId_normalizedCode: { storeId: store.id, normalizedCode: COUPON_CODE } },
    update: { status: "ACTIVE", code: COUPON_CODE, campaignId: CAMPAIGN_ID },
    create: {
      storeId: store.id,
      campaignId: CAMPAIGN_ID,
      code: COUPON_CODE,
      normalizedCode: COUPON_CODE,
      status: "ACTIVE",
    },
  });

  // 7) Onceden-var siparis e2e-order-1001 (musteriye bagli, 1 satir e2e-mug x1, PLACED/PAID).
  const placedAt = new Date("2026-02-01T10:00:00.000Z");
  await prisma.order.upsert({
    where: { storeId_orderNumber: { storeId: store.id, orderNumber: ORDER_NUMBER } },
    update: {
      customerId: customer.id,
      customerEmail: CUSTOMER_EMAIL,
      status: "PLACED",
      paymentStatus: "PAID",
      subtotalAmount: MUG_PRICE_MINOR,
      totalAmount: MUG_PRICE_MINOR,
    },
    create: {
      id: ORDER_ID,
      storeId: store.id,
      orderNumber: ORDER_NUMBER,
      customerId: customer.id,
      customerEmail: CUSTOMER_EMAIL,
      currency: "TRY",
      status: "PLACED",
      paymentStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      subtotalAmount: MUG_PRICE_MINOR,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 0,
      totalAmount: MUG_PRICE_MINOR,
      placedAt,
    },
  });
  await prisma.orderLine.upsert({
    where: { id: ORDER_LINE_ID },
    update: {
      quantity: 1,
      unitPriceAmount: MUG_PRICE_MINOR,
      totalAmount: MUG_PRICE_MINOR,
    },
    create: {
      id: ORDER_LINE_ID,
      storeId: store.id,
      orderId: ORDER_ID,
      productId: mug.id,
      variantId: mugVariant.id,
      sku: MUG_SKU,
      title: "E2E Mug",
      variantTitle: "Standart",
      quantity: 1,
      unitPriceAmount: MUG_PRICE_MINOR,
      totalAmount: MUG_PRICE_MINOR,
      currency: "TRY",
    },
  });
  await prisma.paymentAttempt.upsert({
    where: { id: PAYMENT_ATTEMPT_ID },
    update: { status: "PAID", amount: MUG_PRICE_MINOR },
    create: {
      id: PAYMENT_ATTEMPT_ID,
      storeId: store.id,
      orderId: ORDER_ID,
      method: "CARD",
      amount: MUG_PRICE_MINOR,
      currency: "TRY",
      status: "PAID",
      paidAt: placedAt,
    },
  });

  // 7b) TODO-176B (BUG-CART-006) — Reorder invariant siparisi e2e-order-2001 (musteriye bagli,
  //     1 satir e2e-tshirt varyant M x2, PLACED/PAID). "Tekrar Satin Al" sonrasi sepette DOGRU
  //     varyant + adet + fiyat korunuyor mu invariant'ini kanitlamak icin cok-varyantli + adet>1.
  const TSHIRT_M = TSHIRT_VARIANTS[1]; // { id: e2e-variant-tshirt-m, sku: e2e-tshirt-m, title: M }
  const REORDER_ORDER_NUMBER = "e2e-order-2001";
  const REORDER_ORDER_ID = "e2e-order-2001";
  const REORDER_LINE_ID = "e2e-order-2001-line-1";
  const REORDER_PAYMENT_ID = "e2e-order-2001-payment-1";
  const REORDER_QTY = 2;
  const REORDER_TOTAL = TSHIRT_PRICE_MINOR * REORDER_QTY; // 40000
  const reorderPlacedAt = new Date("2026-02-02T10:00:00.000Z");
  await prisma.order.upsert({
    where: { storeId_orderNumber: { storeId: store.id, orderNumber: REORDER_ORDER_NUMBER } },
    update: {
      customerId: customer.id,
      customerEmail: CUSTOMER_EMAIL,
      status: "PLACED",
      paymentStatus: "PAID",
      subtotalAmount: REORDER_TOTAL,
      totalAmount: REORDER_TOTAL,
    },
    create: {
      id: REORDER_ORDER_ID,
      storeId: store.id,
      orderNumber: REORDER_ORDER_NUMBER,
      customerId: customer.id,
      customerEmail: CUSTOMER_EMAIL,
      currency: "TRY",
      status: "PLACED",
      paymentStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      subtotalAmount: REORDER_TOTAL,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 0,
      totalAmount: REORDER_TOTAL,
      placedAt: reorderPlacedAt,
    },
  });
  await prisma.orderLine.upsert({
    where: { id: REORDER_LINE_ID },
    update: {
      quantity: REORDER_QTY,
      unitPriceAmount: TSHIRT_PRICE_MINOR,
      totalAmount: REORDER_TOTAL,
      variantId: TSHIRT_M.id,
    },
    create: {
      id: REORDER_LINE_ID,
      storeId: store.id,
      orderId: REORDER_ORDER_ID,
      productId: tshirt.id,
      variantId: TSHIRT_M.id,
      sku: TSHIRT_M.sku,
      title: "E2E Tshirt",
      variantTitle: TSHIRT_M.title,
      quantity: REORDER_QTY,
      unitPriceAmount: TSHIRT_PRICE_MINOR,
      totalAmount: REORDER_TOTAL,
      currency: "TRY",
    },
  });
  await prisma.paymentAttempt.upsert({
    where: { id: REORDER_PAYMENT_ID },
    update: { status: "PAID", amount: REORDER_TOTAL },
    create: {
      id: REORDER_PAYMENT_ID,
      storeId: store.id,
      orderId: REORDER_ORDER_ID,
      method: "CARD",
      amount: REORDER_TOTAL,
      currency: "TRY",
      status: "PAID",
      paidAt: reorderPlacedAt,
    },
  });

  // 8) Musteri teslimat adresi (Task 9 — checkout /checkout sayfasi kayitli adres
  // olmadan CheckoutForm'u HIC render etmez; "Adres ekle" bos-durumuna duser. Sabit
  // id ile idempotent upsert; varsayilan teslimat/fatura adresi olarak isaretlenir.
  await prisma.customerAddress.upsert({
    where: { id: ADDRESS_ID },
    update: {
      storeId: store.id,
      customerId: customer.id,
      fullName: "E2E Customer",
      countryCode: "TR",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine1: "Test Sokak No:1",
      postalCode: "34700",
      isDefaultShipping: true,
      isDefaultBilling: true,
    },
    create: {
      id: ADDRESS_ID,
      storeId: store.id,
      customerId: customer.id,
      type: "SHIPPING",
      addressName: "Ev",
      fullName: "E2E Customer",
      phone: "+905551234567",
      countryCode: "TR",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine1: "Test Sokak No:1",
      postalCode: "34700",
      isDefaultShipping: true,
      isDefaultBilling: true,
      billingType: "INDIVIDUAL",
    },
  });

  // 9) TODO-176B (PR2) — Alışveriş bakiyesi (goodwill kredi grant). getCustomerBalance ACTIVE +
  //    süresi-dolmamış lot'ların kalanından available hesaplar; ledger hareket listesi ayrı okunur.
  //    Sabit id'ler + idempotencyKey → idempotent (re-run remaining'i sıfırlar, ledger'da DUPLICATE
  //    hareket üretmez). description SEMANTIK KEY (`credit.goodwill`) → UI TR/EN lokalize eder.
  const CREDIT_ACCOUNT_ID = "e2e-credit-account-1";
  const CREDIT_LOT_ID = "e2e-credit-lot-goodwill-1";
  const CREDIT_ENTRY_ID = "e2e-credit-entry-goodwill-1";
  const CREDIT_AMOUNT_MINOR = 100000; // ₺1.000,00 goodwill
  const CREDIT_NEVER_EXPIRES = new Date("2099-01-01T00:00:00.000Z"); // deterministik: hep gelecekte
  await prisma.customerCreditAccount.upsert({
    where: { storeId_customerId_currency: { storeId: store.id, customerId: customer.id, currency: "TRY" } },
    update: { cachedAvailableMinor: CREDIT_AMOUNT_MINOR },
    create: {
      id: CREDIT_ACCOUNT_ID,
      storeId: store.id,
      customerId: customer.id,
      currency: "TRY",
      cachedAvailableMinor: CREDIT_AMOUNT_MINOR,
    },
  });
  await prisma.customerCreditLot.upsert({
    where: { id: CREDIT_LOT_ID },
    update: { remainingAmountMinor: CREDIT_AMOUNT_MINOR, status: "ACTIVE", expiresAt: CREDIT_NEVER_EXPIRES },
    create: {
      id: CREDIT_LOT_ID,
      storeId: store.id,
      customerId: customer.id,
      accountId: CREDIT_ACCOUNT_ID,
      currency: "TRY",
      originalAmountMinor: CREDIT_AMOUNT_MINOR,
      remainingAmountMinor: CREDIT_AMOUNT_MINOR,
      expiresAt: CREDIT_NEVER_EXPIRES,
      status: "ACTIVE",
      sourceType: "ADMIN_GOODWILL",
      issuedByType: "PLATFORM_USER",
    },
  });
  await prisma.customerCreditLedgerEntry.upsert({
    where: { id: CREDIT_ENTRY_ID },
    update: { amountMinor: CREDIT_AMOUNT_MINOR, balanceAfterMinor: CREDIT_AMOUNT_MINOR },
    create: {
      id: CREDIT_ENTRY_ID,
      storeId: store.id,
      customerId: customer.id,
      accountId: CREDIT_ACCOUNT_ID,
      lotId: CREDIT_LOT_ID,
      type: "ADMIN_GOODWILL_CREDIT",
      direction: "CREDIT",
      amountMinor: CREDIT_AMOUNT_MINOR,
      balanceAfterMinor: CREDIT_AMOUNT_MINOR,
      currency: "TRY",
      sourceType: "ADMIN_GOODWILL",
      description: "credit.goodwill",
      createdByType: "PLATFORM_USER",
      idempotencyKey: "e2e-goodwill-grant-1",
    },
  });

  // 9b) Cross-store izolasyon fixture'ı: ikinci mağaza + kendi bakiyeli müşterisi. Shopping Balance
  //     Admin listesi storeId-first scoped; bu müşteri e2e-store listesinde ASLA görünmemeli.
  const STORE2_CREDIT_MINOR = 50000; // ₺500,00
  const store2 = await prisma.store.upsert({
    where: { slug: STORE2_SLUG },
    update: { name: "E2E Store 2", status: "ACTIVE" },
    create: { id: STORE2_ID, name: "E2E Store 2", slug: STORE2_SLUG, status: "ACTIVE", metadata: { seeded: "e2e" } },
  });
  const store2Customer = await prisma.customer.upsert({
    where: { storeId_email: { storeId: store2.id, email: STORE2_CUSTOMER_EMAIL } },
    update: { firstName: "Other", lastName: "Store", status: "ACTIVE" },
    create: {
      id: STORE2_CUSTOMER_ID,
      storeId: store2.id,
      email: STORE2_CUSTOMER_EMAIL,
      firstName: "Other",
      lastName: "Store",
      status: "ACTIVE",
    },
  });
  await prisma.customerCreditAccount.upsert({
    where: { storeId_customerId_currency: { storeId: store2.id, customerId: store2Customer.id, currency: "TRY" } },
    update: { cachedAvailableMinor: STORE2_CREDIT_MINOR },
    create: { id: "e2e-store2-credit-account-1", storeId: store2.id, customerId: store2Customer.id, currency: "TRY", cachedAvailableMinor: STORE2_CREDIT_MINOR },
  });
  await prisma.customerCreditLot.upsert({
    where: { id: "e2e-store2-credit-lot-1" },
    update: { remainingAmountMinor: STORE2_CREDIT_MINOR, status: "ACTIVE", expiresAt: CREDIT_NEVER_EXPIRES },
    create: {
      id: "e2e-store2-credit-lot-1",
      storeId: store2.id,
      customerId: store2Customer.id,
      accountId: "e2e-store2-credit-account-1",
      currency: "TRY",
      originalAmountMinor: STORE2_CREDIT_MINOR,
      remainingAmountMinor: STORE2_CREDIT_MINOR,
      expiresAt: CREDIT_NEVER_EXPIRES,
      status: "ACTIVE",
      sourceType: "ADMIN_GOODWILL",
      issuedByType: "PLATFORM_USER",
    },
  });
  await prisma.customerCreditLedgerEntry.upsert({
    where: { id: "e2e-store2-credit-entry-1" },
    update: { amountMinor: STORE2_CREDIT_MINOR, balanceAfterMinor: STORE2_CREDIT_MINOR },
    create: {
      id: "e2e-store2-credit-entry-1",
      storeId: store2.id,
      customerId: store2Customer.id,
      accountId: "e2e-store2-credit-account-1",
      lotId: "e2e-store2-credit-lot-1",
      type: "ADMIN_GOODWILL_CREDIT",
      direction: "CREDIT",
      amountMinor: STORE2_CREDIT_MINOR,
      balanceAfterMinor: STORE2_CREDIT_MINOR,
      currency: "TRY",
      sourceType: "ADMIN_GOODWILL",
      description: "credit.goodwill",
      createdByType: "PLATFORM_USER",
      idempotencyKey: "e2e-store2-goodwill-grant-1",
    },
  });

  // 10) TODO-176B (PR2) — İade fixture'ları (İadelerim + refund destination invariant). İki iade:
  //     REFUND → SHOPPING_BALANCE (status REQUESTED) ve REFUND → ORIGINAL_PAYMENT (status APPROVED).
  //     Müşteri iade listesi sorgusu STATUS FİLTRESİZ (yalnız storeId+customerId) → ham upsert yüzeye
  //     çıkar. refundDestination IMMUTABLE snapshot → "Alışveriş bakiyesine" / "Orijinal ödeme yöntemine".
  const RETURN_WINDOW_ENDS = new Date("2099-01-01T00:00:00.000Z");
  const RETURNS = [
    {
      id: "e2e-return-1",
      number: "e2e-return-1001",
      orderId: ORDER_ID,
      lineId: ORDER_LINE_ID,
      itemId: "e2e-return-1-item-1",
      status: "REQUESTED",
      refundDestination: "SHOPPING_BALANCE",
    },
    {
      id: "e2e-return-2",
      number: "e2e-return-1002",
      orderId: REORDER_ORDER_ID,
      lineId: REORDER_LINE_ID,
      itemId: "e2e-return-2-item-1",
      status: "APPROVED",
      refundDestination: "ORIGINAL_PAYMENT",
    },
  ];
  for (const rr of RETURNS) {
    await prisma.returnRequest.upsert({
      where: { storeId_returnNumber: { storeId: store.id, returnNumber: rr.number } },
      update: { status: rr.status, refundDestination: rr.refundDestination, resolutionType: "REFUND" },
      create: {
        id: rr.id,
        storeId: store.id,
        orderId: rr.orderId,
        customerId: customer.id,
        returnNumber: rr.number,
        status: rr.status,
        resolutionType: "REFUND",
        refundDestination: rr.refundDestination,
        returnWindowEndsAt: RETURN_WINDOW_ENDS,
      },
    });
    await prisma.returnItem.upsert({
      where: { id: rr.itemId },
      update: { quantity: 1 },
      create: {
        id: rr.itemId,
        storeId: store.id,
        returnRequestId: rr.id,
        orderLineId: rr.lineId,
        quantity: 1,
        reason: "NO_LONGER_NEEDED",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // TODO-177 (ADR-289) Faz F — Product Support fixtures (additive; yalnız e2e- satırlar).
  // Idempotent upsert; demo/enterprise-demo/üretime dokunmaz. 7 topic default ZORUNLU
  // (resolution MISSING_TOPIC_DEFAULT guard); question-set version PUBLISHED olmalı.
  // ---------------------------------------------------------------------------
  // (a) Garanti anchor: mug ürününe warrantyMonths + order-1001'e DELIVERED shipment.
  await prisma.product.update({ where: { id: MUG_ID }, data: { warrantyMonths: 12 } });
  const supportShipProvider = await prisma.shippingProviderConfig.upsert({
    where: { id: "e2e-ship-provider-1" },
    update: {},
    create: { id: "e2e-ship-provider-1", storeId: STORE_ID, provider: "MOCK", displayName: "E2E Mock" },
  });
  await prisma.shipment.upsert({
    where: { id: "e2e-shipment-1001" },
    update: { status: "DELIVERED", deliveredAt: new Date("2026-08-01T00:00:00.000Z") },
    create: {
      id: "e2e-shipment-1001",
      storeId: STORE_ID,
      orderId: ORDER_ID,
      providerConfigId: supportShipProvider.id,
      provider: "MOCK",
      referenceId: "E2E-SHP-1001",
      status: "DELIVERED",
      deliveredAt: new Date("2026-08-01T00:00:00.000Z"),
    },
  });

  // (b) Published question-set'ler + 7 topic default (tek doğruluk kaynağı seed graph JSON).
  const supportSets = JSON.parse(
    readFileSync(new URL("../prisma/support-default-question-sets.json", import.meta.url), "utf8"),
  ).sets;
  const supportVersionByTopic = {};
  for (const set of supportSets) {
    const qsId = `e2e-qset-${set.key}`;
    const verId = `e2e-qver-${set.key}-v1`;
    await prisma.supportQuestionSet.upsert({
      where: { key: set.key },
      update: { title: set.title, description: set.description ?? null, isDefault: true, status: "ACTIVE" },
      create: { id: qsId, key: set.key, title: set.title, description: set.description ?? null, isDefault: true, status: "ACTIVE" },
    });
    await prisma.supportQuestionSetVersion.upsert({
      where: { questionSetId_version: { questionSetId: qsId, version: 1 } },
      update: { status: "PUBLISHED", publishedAt: new Date("2026-08-10T00:00:00.000Z") },
      create: { id: verId, questionSetId: qsId, version: 1, status: "PUBLISHED", publishedAt: new Date("2026-08-10T00:00:00.000Z") },
    });
    const qIdByKey = {};
    const optIdByKey = {};
    for (const q of set.questions) {
      const qId = `e2e-q-${set.key}-${q.key}`;
      qIdByKey[q.key] = qId;
      await prisma.supportQuestion.upsert({
        where: { questionSetVersionId_key: { questionSetVersionId: verId, key: q.key } },
        update: { type: q.type, prompt: q.prompt, helpText: q.helpText ?? null, sortOrder: q.sortOrder, required: q.required ?? true, isEntry: q.isEntry ?? false },
        create: { id: qId, questionSetVersionId: verId, key: q.key, type: q.type, prompt: q.prompt, helpText: q.helpText ?? null, sortOrder: q.sortOrder, required: q.required ?? true, isEntry: q.isEntry ?? false },
      });
      for (const opt of q.options ?? []) {
        const optId = `e2e-opt-${set.key}-${q.key}-${opt.key}`;
        optIdByKey[`${q.key}:${opt.key}`] = optId;
        await prisma.supportQuestionOption.upsert({
          where: { questionId_key: { questionId: qId, key: opt.key } },
          update: { label: opt.label, sortOrder: opt.sortOrder },
          create: { id: optId, questionId: qId, key: opt.key, label: opt.label, sortOrder: opt.sortOrder },
        });
      }
    }
    // Transitionlar id-key taşımaz → deterministik yeniden kur (idempotent).
    await prisma.supportQuestionTransition.deleteMany({ where: { questionSetVersionId: verId } });
    for (const tr of set.transitions) {
      await prisma.supportQuestionTransition.create({
        data: {
          questionSetVersionId: verId,
          fromQuestionId: qIdByKey[tr.fromKey],
          matchKind: tr.matchKind,
          matchOptionId: tr.matchOptionKey ? optIdByKey[`${tr.fromKey}:${tr.matchOptionKey}`] : null,
          action: tr.action,
          toQuestionId: tr.toKey ? qIdByKey[tr.toKey] : null,
          sortOrder: tr.sortOrder,
        },
      });
    }
    await prisma.supportTopicDefault.upsert({
      where: { topic: set.topic },
      update: { questionSetId: qsId },
      create: { topic: set.topic, questionSetId: qsId },
    });
    supportVersionByTopic[set.topic] = verId;
  }

  // (c) RESOLVED ticket — reopen testine hazır (müşteri resolve edemez; taze resolvedAt = pencere içinde).
  const supportResolvedAt = new Date();
  const supportVersionId = supportVersionByTopic.WARRANTY_SERVICE ?? Object.values(supportVersionByTopic)[0];
  await prisma.supportTicket.upsert({
    where: { storeId_ticketNumber: { storeId: STORE_ID, ticketNumber: "S900001" } },
    update: { status: "RESOLVED", resolvedAt: supportResolvedAt, lastActivityAt: supportResolvedAt },
    create: {
      id: "e2e-support-ticket-1",
      storeId: STORE_ID,
      ticketNumber: "S900001",
      customerId: CUSTOMER_ID,
      orderId: ORDER_ID,
      orderLineId: ORDER_LINE_ID,
      productId: MUG_ID,
      variantId: null,
      questionSetVersionId: supportVersionId,
      topic: "WARRANTY_SERVICE",
      warrantyEndsAt: new Date("2027-08-01T00:00:00.000Z"),
      warrantyAnchorSource: "SHIPMENT_DELIVERED",
      status: "RESOLVED",
      resolvedAt: supportResolvedAt,
      lastActivityAt: supportResolvedAt,
      version: 1,
    },
  });
  const supportTicketRow = await prisma.supportTicket.findUniqueOrThrow({
    where: { storeId_ticketNumber: { storeId: STORE_ID, ticketNumber: "S900001" } },
    select: { id: true },
  });
  await prisma.supportSlaSnapshot.upsert({
    where: { storeId_ticketId_cycle: { storeId: STORE_ID, ticketId: supportTicketRow.id, cycle: 1 } },
    update: { resolvedAt: supportResolvedAt, firstResponseMetAt: supportResolvedAt },
    create: {
      storeId: STORE_ID,
      ticketId: supportTicketRow.id,
      cycle: 1,
      topic: "WARRANTY_SERVICE",
      firstResponseDueAt: new Date("2026-08-11T00:00:00.000Z"),
      resolutionDueAt: new Date("2026-08-13T00:00:00.000Z"),
      firstResponseMetAt: supportResolvedAt,
      resolvedAt: supportResolvedAt,
    },
  });

  console.log(
    JSON.stringify({
      ok: true,
      store: STORE_SLUG,
      products: [TSHIRT_SLUG, MUG_SLUG],
      customer: CUSTOMER_EMAIL,
      storeAdmin: ADMIN_EMAIL,
      store2: STORE2_SLUG,
      store2Customer: STORE2_CUSTOMER_EMAIL,
      coupon: COUPON_CODE,
      orders: [ORDER_NUMBER, REORDER_ORDER_NUMBER],
      address: ADDRESS_ID,
      goodwillCreditMinor: CREDIT_AMOUNT_MINOR,
      returns: RETURNS.map((r) => r.number),
      support: { questionSets: supportSets.length, seededTicket: "S900001" },
    }),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
