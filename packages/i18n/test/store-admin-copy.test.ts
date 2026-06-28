import { describe, expect, it } from "vitest";
import { allDictionaries } from "../src/index";

/**
 * Faz 2B store-admin canli baglamasiyla eklenen gorunur metin gruplarinin hem TR
 * (kaynak) hem EN (ayna) sozlukte bulundugunu dogrular. Tam yol paritesi ayrica
 * i18n.test.ts icinde test edilir.
 */
describe("storeAdmin Faz 2B copy", () => {
  const tr = allDictionaries.tr.storeAdmin;
  const en = allDictionaries.en.storeAdmin;

  it("ships the login/auth screen copy in both locales", () => {
    expect(tr.auth.title).toBe("Mağaza yönetimine giriş");
    expect(tr.auth.submit).toBe("Giriş yap");
    expect(typeof en.auth.title).toBe("string");
    expect(en.auth.title).not.toBe(tr.auth.title);
  });

  it("maps catalog/inventory API error codes to friendly Turkish messages", () => {
    expect(tr.errors.CATEGORY_SLUG_EXISTS).toBe("Bu kategori kısa adı (slug) zaten kullanılıyor.");
    expect(tr.errors.PRODUCT_SLUG_EXISTS).toBe("Bu ürün kısa adı (slug) zaten kullanılıyor.");
    expect(tr.errors.VARIANT_SKU_EXISTS).toBe("Bu SKU zaten kullanılıyor.");
    expect(tr.errors.INVALID_INVENTORY_ADJUSTMENT).toBe(
      "Bu düzeltme stoğu eksiye düşürür. Daha küçük bir değer girin.",
    );
    // EN ayna ayni kodlari icermeli.
    expect(Object.keys(en.errors).sort()).toEqual(Object.keys(tr.errors).sort());
  });

  it("ships category, product, variant and inventory screen copy", () => {
    expect(tr.categories.form.createTitle).toBe("Yeni kategori oluştur");
    expect(tr.products.table.title).toBe("Ürün");
    expect(tr.variants.addVariant).toBe("Varyant ekle");
    expect(tr.inventory.form.deltaLabel).toBe("Değişim miktarı");
    expect(typeof en.categories.form.createTitle).toBe("string");
    expect(typeof en.variants.addVariant).toBe("string");
  });

  it("ships live dashboard stat labels", () => {
    expect(tr.dashboard.stats.products).toBe("Toplam ürün");
    expect(tr.dashboard.stats.lowStock).toBe("Kritik stok");
    expect(typeof en.dashboard.stats.products).toBe("string");
  });

  it("ships product sales-model labels in both locales", () => {
    const trSm = tr.products.salesModel;
    const enSm = en.products.salesModel;

    expect(trSm.sectionTitle).toBe("Satış davranışı");
    expect(enSm.sectionTitle).toBe("Sales behavior");

    // Sales mode labels — iki dilde de tam.
    expect(Object.keys(enSm.modeLabels).sort()).toEqual(Object.keys(trSm.modeLabels).sort());
    expect(trSm.modeLabels.INQUIRY).toBe("Fiyat sor");
    expect(enSm.modeLabels.INQUIRY).toBe("Request price");

    // Price visibility labels.
    expect(Object.keys(enSm.priceVisibilityLabels).sort()).toEqual(
      Object.keys(trSm.priceVisibilityLabels).sort(),
    );
    expect(trSm.priceVisibilityLabels.ON_REQUEST).toBe("Talep üzerine");
    expect(enSm.priceVisibilityLabels.ON_REQUEST).toBe("On request");

    // Primary action labels.
    expect(Object.keys(enSm.actionLabels).sort()).toEqual(Object.keys(trSm.actionLabels).sort());
    expect(trSm.actionLabels.ADD_TO_CART).toBe("Sepete ekle");
    expect(enSm.actionLabels.ADD_TO_CART).toBe("Add to cart");

    // Purchasable durum metinleri.
    expect(trSm.notPurchasableBadge).toBe("Sepete eklenemez");
    expect(enSm.notPurchasableBadge).toBe("Not purchasable");
  });

  it("maps product sales-model guard error codes in both locales", () => {
    expect(tr.errors.PRODUCT_NOT_PURCHASABLE).toBe("Bu ürün doğrudan satın alınamaz.");
    expect(typeof en.errors.PRODUCT_REQUIRES_APPOINTMENT).toBe("string");
    expect(typeof en.errors.PRODUCT_CATALOG_ONLY).toBe("string");
  });

  it("ships F2G orders screen copy and status labels in both locales", () => {
    expect(tr.orders.newOrder).toBe("Yeni sipariş");
    expect(tr.orders.placeAction).toBe("Siparişi ver");
    expect(tr.orders.cancelAction).toBe("İptal et");
    expect(typeof en.orders.newOrder).toBe("string");
    expect(en.orders.placeAction).not.toBe(tr.orders.placeAction);

    // Order status labels — iki dilde de tam parite.
    expect(Object.keys(en.orders.statusLabels).sort()).toEqual(
      Object.keys(tr.orders.statusLabels).sort(),
    );
    expect(tr.orders.statusLabels.DRAFT).toBe("Taslak");
    expect(en.orders.statusLabels.DRAFT).toBe("Draft");
    expect(tr.orders.statusLabels.FULFILLED).toBe("Tamamlandı");

    // Payment + fulfillment label parity.
    expect(Object.keys(en.orders.paymentLabels).sort()).toEqual(
      Object.keys(tr.orders.paymentLabels).sort(),
    );
    expect(tr.orders.paymentLabels.PAID).toBe("Ödendi");
    expect(en.orders.paymentLabels.PAID).toBe("Paid");
    expect(Object.keys(en.orders.fulfillmentLabels).sort()).toEqual(
      Object.keys(tr.orders.fulfillmentLabels).sort(),
    );
    expect(tr.orders.fulfillmentLabels.UNFULFILLED).toBe("Gönderilmedi");
  });

  it("ships TODO-073 order filter copy in both locales", () => {
    expect(tr.orders.filters.apply).toBe("Filtrele");
    expect(tr.orders.filters.clear).toBe("Temizle");
    expect(tr.orders.filters.emptyDescription).toBe("Bu filtrelere uyan sipariş bulunamadı.");
    expect(en.orders.filters.apply).toBe("Filter");
    expect(en.orders.filters.clear).toBe("Clear");
    // Tam yol paritesi i18n.test.ts'te; burada anahtar kümesi paritesini doğrularız.
    expect(Object.keys(en.orders.filters).sort()).toEqual(Object.keys(tr.orders.filters).sort());
  });

  it("maps F2G order lifecycle error codes in both locales", () => {
    expect(tr.errors.ORDER_NOT_FOUND).toBe("Sipariş bulunamadı.");
    expect(tr.errors.ORDER_INSUFFICIENT_STOCK).toBe(
      "Yeterli stok yok. Sipariş için stok ayrılamadı.",
    );
    for (const code of [
      "ORDER_INVALID_STATUS",
      "ORDER_LINE_NOT_FOUND",
      "ORDER_NUMBER_CONFLICT",
      "ORDER_RESERVATION_FAILED",
      "ORDER_ALREADY_PLACED",
      "ORDER_ALREADY_CANCELLED",
      "ORDER_MUTATION_NOT_ALLOWED",
      "CUSTOMER_NOT_FOUND",
    ] as const) {
      expect(typeof tr.errors[code]).toBe("string");
      expect(typeof en.errors[code]).toBe("string");
    }
  });
});
