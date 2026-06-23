import { describe, expect, it } from "vitest";
import { allDictionaries } from "../src/index";

/**
 * Faz 1B admin-web canli baglamasiyla eklenen gorunur metin gruplarinin hem TR
 * (kaynak) hem EN (ayna) sozlukte bulundugunu dogrular. Tam yol paritesi ayrica
 * i18n.test.ts icinde test edilir; burada yeni anahtar gruplarinin varligi ve TR
 * kaynak degerleri kontrol edilir.
 */
describe("admin Faz 1B copy", () => {
  const tr = allDictionaries.tr.admin;
  const en = allDictionaries.en.admin;

  it("ships the login (auth) screen copy in both locales", () => {
    expect(tr.auth.title).toBe("Platform yönetimine giriş");
    expect(typeof en.auth.title).toBe("string");
    expect(en.auth.title).not.toBe(tr.auth.title);
    expect(tr.auth.submit).toBe("Giriş yap");
    expect(tr.auth.checking).toBe("Oturum doğrulanıyor…");
  });

  it("maps API error codes to friendly Turkish messages", () => {
    expect(tr.errors.INVALID_CREDENTIALS).toBe("E-posta veya parola hatalı.");
    expect(tr.errors.STORE_SLUG_EXISTS).toBe("Bu kısa ad (slug) zaten kullanılıyor.");
    expect(tr.errors.PLAN_CODE_EXISTS).toBe("Bu paket kodu zaten kullanılıyor.");
    // EN ayna ayni kodlari icermeli.
    expect(Object.keys(en.errors).sort()).toEqual(Object.keys(tr.errors).sort());
  });

  it("ships store + plan form and table copy", () => {
    expect(tr.stores.form.createTitle).toBe("Yeni mağaza oluştur");
    expect(tr.stores.table.status).toBe("Durum");
    expect(tr.stores.statusLabels.ACTIVE).toBe("Etkin");
    expect(tr.plans.form.createTitle).toBe("Yeni paket oluştur");
    expect(tr.plans.table.code).toBe("Kod");
    expect(typeof en.stores.form.createTitle).toBe("string");
    expect(typeof en.plans.form.createTitle).toBe("string");
  });

  it("ships system health internal-token copy", () => {
    expect(tr.systemHealth.internalRequiredTitle).toBe("Dahili token gerektirir");
    expect(typeof en.systemHealth.internalRequiredTitle).toBe("string");
  });
});
