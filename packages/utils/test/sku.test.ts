import { describe, expect, it } from "vitest";
import {
  SKU_FALLBACK,
  SKU_MAX_LENGTH,
  buildBaseSku,
  generateSku,
  normalizeSku,
  normalizeSkuSegment,
  resolveUniqueSku,
  validateSku,
} from "../src/sku.js";

describe("normalizeSkuSegment — tek segment normalizasyonu", () => {
  it("uppercase + boşluk/simge → tek segment (ayraç yok)", () => {
    expect(normalizeSkuSegment("Basic Tee")).toBe("BASIC-TEE");
  });

  it("Türkçe karakterler doğru transliterasyon + uppercase", () => {
    expect(normalizeSkuSegment("çğıİöşü")).toBe("CGIIOSU");
    expect(normalizeSkuSegment("Şık")).toBe("SIK");
  });

  it("İ (büyük noktalı I) → I (combining dot düşer)", () => {
    expect(normalizeSkuSegment("İSTANBUL")).toBe("ISTANBUL");
  });

  it("aksanlı Latin harfleri NFKD ile ASCII'ye iner", () => {
    expect(normalizeSkuSegment("Café")).toBe("CAFE");
  });

  it("yalnız simge/emoji girdi → boş string", () => {
    expect(normalizeSkuSegment("★☆✓")).toBe("");
    expect(normalizeSkuSegment("😀")).toBe("");
  });

  it("segment maks uzunluğa kesilir (son tire kırpılır)", () => {
    expect(normalizeSkuSegment("A".repeat(40), { maxLength: 10 })).toBe("AAAAAAAAAA");
  });
});

describe("normalizeSku — tam SKU normalizasyonu (ayraç korunur)", () => {
  it("tireleri korur, tekrarlıyı sıkıştırır, baş/son kırpar", () => {
    expect(normalizeSku("-tsh--basic-blk-")).toBe("TSH-BASIC-BLK");
  });

  it("geçersiz karakter (./_ /) → tire", () => {
    expect(normalizeSku("tsh.basic/blk_m")).toBe("TSH-BASIC-BLK-M");
  });

  it("maks uzunluğa keser", () => {
    const out = normalizeSku("X".repeat(100));
    expect(out.length).toBe(SKU_MAX_LENGTH);
  });
});

describe("buildBaseSku — {PRODUCT_CODE}-{OPTION_CODES}-{SEQ}", () => {
  it("ürün + option kodları deterministik birleşir", () => {
    expect(buildBaseSku({ productCode: "Basic Tee", optionCodes: ["Black", "M"] }).base).toBe(
      "BASIC-TEE-BLACK-M",
    );
  });

  it("örnek: TSH-BASIC-BLK-M (prefix + product + options)", () => {
    expect(
      buildBaseSku({ prefix: "TSH", productCode: "Basic", optionCodes: ["BLK", "M"] }).base,
    ).toBe("TSH-BASIC-BLK-M");
  });

  it("örnek: MUG-CERAMIC-WHT-001 (sequence zero-padded)", () => {
    expect(
      buildBaseSku({ prefix: "MUG", productCode: "Ceramic", optionCodes: ["WHT"], sequence: 1 }).base,
    ).toBe("MUG-CERAMIC-WHT-001");
  });

  it("boş option kodları atılır", () => {
    expect(buildBaseSku({ productCode: "Laptop", optionCodes: ["", "★", "16GB"] }).base).toBe(
      "LAPTOP-16GB",
    );
  });

  it("tamamen boş girdi → fallback (boş SKU üretilemez)", () => {
    const r = buildBaseSku({ productCode: "★", optionCodes: ["☆"] });
    expect(r.base).toBe(SKU_FALLBACK);
  });

  it("deterministik: aynı girdi → aynı çıktı", () => {
    const a = buildBaseSku({ productCode: "Xiaomi", optionCodes: ["16GB", "512GB"] });
    const b = buildBaseSku({ productCode: "Xiaomi", optionCodes: ["16GB", "512GB"] });
    expect(a.base).toBe(b.base);
    expect(a.base).toBe("XIAOMI-16GB-512GB");
  });

  it("option sırası SKU'ya yansır (çağıran sıralar; deterministik)", () => {
    expect(buildBaseSku({ productCode: "P", optionCodes: ["M", "BLK"] }).base).toBe("P-M-BLK");
    expect(buildBaseSku({ productCode: "P", optionCodes: ["BLK", "M"] }).base).toBe("P-BLK-M");
  });

  it("çok uzun ürün adı kontrollü kısaltılır + maks uzunluğu aşmaz", () => {
    const r = buildBaseSku({
      productCode: "Very Long Product Name That Exceeds Everything".repeat(3),
      optionCodes: ["BLACK", "XLARGE"],
      maxLength: 32,
    });
    expect(r.base.length).toBeLessThanOrEqual(32);
    expect(r.truncated).toBe(true);
    expect(r.base).toMatch(/^[A-Z0-9-]+$/);
  });
});

describe("validateSku — kanonik format doğrulama", () => {
  it("geçerli kanonik SKU", () => {
    expect(validateSku("TSH-BASIC-BLK-M")).toEqual({
      ok: true,
      normalized: "TSH-BASIC-BLK-M",
      errors: [],
    });
  });

  it("boş → empty", () => {
    expect(validateSku("").errors).toContain("empty");
  });

  it("küçük harf/geçersiz karakter → invalid-characters", () => {
    expect(validateSku("tsh-basic").errors).toContain("invalid-characters");
    expect(validateSku("TSH_BASIC").errors).toContain("invalid-characters");
  });

  it("baş/son tire", () => {
    expect(validateSku("-TSH").errors).toContain("leading-trailing-dash");
    expect(validateSku("TSH-").errors).toContain("leading-trailing-dash");
  });

  it("ardışık tire", () => {
    expect(validateSku("TSH--BASIC").errors).toContain("consecutive-dash");
  });

  it("çok uzun → too-long ve normalized öneri döner", () => {
    const r = validateSku("A".repeat(100));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("too-long");
    expect(r.normalized.length).toBeLessThanOrEqual(SKU_MAX_LENGTH);
  });
});

describe("resolveUniqueSku — kolizyon çözümü (zero-pad sekans soneki)", () => {
  it("çakışma yok → temel değer", () => {
    const r = resolveUniqueSku("TSH-BLK", () => false);
    expect(r).toEqual({ sku: "TSH-BLK", attempts: 1, exhausted: false });
  });

  it("temel alınmış → -002", () => {
    const taken = new Set(["TSH-BLK"]);
    expect(resolveUniqueSku("TSH-BLK", (c) => taken.has(c)).sku).toBe("TSH-BLK-002");
  });

  it("ardışık çakışma → -002, -003", () => {
    const taken = new Set(["TSH-BLK", "TSH-BLK-002"]);
    expect(resolveUniqueSku("TSH-BLK", (c) => taken.has(c)).sku).toBe("TSH-BLK-003");
  });

  it("kök+sonek maks uzunluğu aşarsa kök kısaltılır", () => {
    const base = "A".repeat(64);
    const taken = new Set([normalizeSku(base)]);
    const r = resolveUniqueSku(base, (c) => taken.has(c), { maxLength: 64 });
    expect(r.sku.length).toBeLessThanOrEqual(64);
    expect(r.sku.endsWith("-002")).toBe(true);
  });

  it("deterministik: aynı taken kümesi → aynı sonuç", () => {
    const taken = new Set(["P", "P-002"]);
    expect(resolveUniqueSku("P", (c) => taken.has(c)).sku).toBe(
      resolveUniqueSku("P", (c) => taken.has(c)).sku,
    );
  });

  it("boş desired → fallback köküyle çözülür", () => {
    expect(resolveUniqueSku("★", () => false).sku).toBe(SKU_FALLBACK);
  });
});

describe("generateSku — üst düzey (auto + manuel taban)", () => {
  it("auto: product+options'tan base + collision çözer", () => {
    const r = generateSku({
      productCode: "Basic Tee",
      optionCodes: ["BLK", "M"],
      isTaken: () => false,
    });
    expect(r.sku).toBe("BASIC-TEE-BLK-M");
    expect(r.usedManualBase).toBe(false);
  });

  it("manuel taban geçerliyse normalize edilip base olur", () => {
    const r = generateSku({
      productCode: "ignored",
      manualBase: "my-custom sku",
      isTaken: () => false,
    });
    expect(r.sku).toBe("MY-CUSTOM-SKU");
    expect(r.usedManualBase).toBe(true);
  });

  it("manuel taban tamamen geçersizse (yalnız simge) auto'ya düşer", () => {
    const r = generateSku({
      productCode: "Mug",
      optionCodes: ["WHT"],
      manualBase: "★★★",
      isTaken: () => false,
    });
    expect(r.usedManualBase).toBe(false);
    expect(r.sku).toBe("MUG-WHT");
  });

  it("collision: auto base alınmışsa sonek ekler", () => {
    const taken = new Set(["MUG-WHT"]);
    const r = generateSku({
      productCode: "Mug",
      optionCodes: ["WHT"],
      isTaken: (c) => taken.has(c),
    });
    expect(r.sku).toBe("MUG-WHT-002");
    expect(r.attempts).toBe(2);
  });

  it("transliteration collision iki farklı Türkçe kelimede sonekle ayrılır", () => {
    // "Şık" ve "Sik" ikisi de SIK'e normalize olur → ikinci varyant sonek alır.
    const taken = new Set<string>();
    const first = generateSku({ productCode: "Sik", isTaken: (c) => taken.has(c) });
    taken.add(first.sku);
    const second = generateSku({ productCode: "Şık", isTaken: (c) => taken.has(c) });
    expect(first.sku).toBe("SIK");
    expect(second.sku).toBe("SIK-002");
  });
});
