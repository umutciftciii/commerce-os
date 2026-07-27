/**
 * PB-2/PB-3 — Canlı DR smoke fixture'ı (deterministik, bağlı zincir).
 *
 * Store → Product → ProductVariant → InventoryItem + Customer → Order → OrderLine → PaymentAttempt.
 * Sabit ID'ler → restore sonrası ilişkiler birebir doğrulanabilir (yalnız satır sayısı DEĞİL, spec §10/§18).
 * İZOLE source DB'ye karşı çalıştırılır (gerçek dev/prod DB'ye DEĞİL).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const storeId = "pb-dr-store";
  const productId = "pb-dr-product";
  const variantId = "pb-dr-variant";
  const customerId = "pb-dr-customer";
  const orderId = "pb-dr-order";

  await prisma.store.create({
    data: { id: storeId, name: "PB DR Store", slug: "pb-dr-store", status: "ACTIVE" },
  });
  await prisma.product.create({
    data: { id: productId, storeId, title: "PB DR Product", slug: "pb-dr-product", status: "ACTIVE" },
  });
  await prisma.productVariant.create({
    data: {
      id: variantId,
      productId,
      storeId,
      title: "Default",
      sku: "PB-DR-SKU-1",
      priceMinor: 12345,
      currency: "TRY",
      status: "ACTIVE",
    },
  });
  await prisma.inventoryItem.create({
    data: { storeId, variantId, quantityOnHand: 42, quantityReserved: 0 },
  });
  await prisma.customer.create({
    data: { id: customerId, storeId, email: "dr@example.com", firstName: "DR", status: "ACTIVE" },
  });
  await prisma.order.create({
    data: {
      id: orderId,
      storeId,
      orderNumber: "PB-DR-1001",
      customerId,
      customerEmail: "dr@example.com",
      currency: "TRY",
      status: "PLACED",
      paymentStatus: "PAID",
      subtotalAmount: 12345,
      totalAmount: 12345,
    },
  });
  await prisma.orderLine.create({
    data: {
      storeId,
      orderId,
      productId,
      variantId,
      sku: "PB-DR-SKU-1",
      title: "PB DR Product",
      variantTitle: "Default",
      quantity: 1,
      unitPriceAmount: 12345,
      totalAmount: 12345,
      currency: "TRY",
    },
  });
  await prisma.paymentAttempt.create({
    data: { storeId, orderId, method: "CARD", amount: 12345, currency: "TRY", status: "PAID" },
  });

  console.log("[dr-fixture] created: store/product/variant/inventory/customer/order/orderLine/paymentAttempt");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("[dr-fixture] FAILED:", e.message);
    await prisma.$disconnect();
    process.exit(1);
  });
