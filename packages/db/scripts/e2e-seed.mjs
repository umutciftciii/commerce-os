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

  console.log(
    JSON.stringify({
      ok: true,
      store: STORE_SLUG,
      products: [TSHIRT_SLUG, MUG_SLUG],
      customer: CUSTOMER_EMAIL,
      coupon: COUPON_CODE,
      order: ORDER_NUMBER,
      address: ADDRESS_ID,
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
