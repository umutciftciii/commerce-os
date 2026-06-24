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
});
