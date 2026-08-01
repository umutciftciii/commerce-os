// TODO-165A (ADR-165A) — Task 9: Taxonomy servisi testleri (fake dataAccess, mirror
// fashion-size-chart-service.test.ts / brand-service.test.ts stili).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  PRODUCT_TAXONOMY_TYPES,
  TAXONOMY_TYPE_REGISTRY,
  type ProductTaxonomyType,
} from "@commerce-os/contracts/product-taxonomy";
import { definitionCodeForTaxonomyType } from "../src/taxonomy/taxonomy-map.js";
import {
  TaxonomyOptionConflictError,
  TaxonomyOptionInUseError,
  createPrismaTaxonomyDataAccess,
  type TaxonomyDataAccess,
  type TaxonomyValueRecord,
  type TaxonomyCreateInput,
  type TaxonomyUpdatePatch,
} from "../src/taxonomy/taxonomy-data.js";
import { createTaxonomyService, type TaxonomyService } from "../src/taxonomy/taxonomy-service.js";

const NOW = new Date("2026-08-01T00:00:00Z");

/** Her governed `fashion.*` kodu icin sabit bir PLATFORM AttributeDefinition id uretir. */
function buildDefinitionIds(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const type of PRODUCT_TAXONOMY_TYPES) {
    const code = definitionCodeForTaxonomyType(type);
    map[code] = `def-${code}`;
  }
  return map;
}

class FakeTaxonomyData implements TaxonomyDataAccess {
  values = new Map<string, TaxonomyValueRecord>();
  /** Baska bir tuketicinin (attribute-values modulu) global (storeId=null) canonical option'lari. */
  globalOptions = new Map<string, { id: string; value: string }>();
  productAttributeValues: { optionId: string | null }[] = [];
  productAttributeValueOptions: { attributeOptionId: string }[] = [];
  variantAttributeValues: { optionId: string | null }[] = [];
  definitionIds: Record<string, string>;
  private seq = 0;

  constructor(definitionIds: Record<string, string>) {
    this.definitionIds = definitionIds;
  }

  async platformDefinitionIdForCode(code: string) {
    return this.definitionIds[code] ?? null;
  }

  private findBySlugSync(storeId: string, type: ProductTaxonomyType, slug: string): TaxonomyValueRecord | null {
    for (const v of this.values.values()) {
      if (v.storeId === storeId && v.type === type && v.slug === slug) return v;
    }
    return null;
  }

  async findBySlug(storeId: string, type: ProductTaxonomyType, slug: string) {
    return this.findBySlugSync(storeId, type, slug);
  }

  async findById(id: string) {
    return this.values.get(id) ?? null;
  }

  async list(storeId: string, type?: ProductTaxonomyType) {
    return [...this.values.values()].filter((v) => v.storeId === storeId && (!type || v.type === type));
  }

  async countUsage(optionId: string) {
    const a = this.productAttributeValues.filter((v) => v.optionId === optionId).length;
    const b = this.productAttributeValueOptions.filter((v) => v.attributeOptionId === optionId).length;
    const c = this.variantAttributeValues.filter((v) => v.optionId === optionId).length;
    return a + b + c;
  }

  async countUsageBatch(optionIds: string[]) {
    const result: Record<string, number> = {};
    for (const id of optionIds) result[id] = await this.countUsage(id);
    return result;
  }

  private nextSortOrder(storeId: string, attributeDefinitionId: string) {
    return [...this.values.values()].filter(
      (v) => v.option.storeId === storeId && v.attributeOptionId && this.definitionIdOf() === attributeDefinitionId,
    ).length;
  }

  // Fake basitligi icin option->definition eslesmesini ayrica tutmuyoruz; sortOrder testte
  // dogrudan kontrol edilmiyor (yalniz displayOrder/monotonluk kontrol edilir), bu yuzden
  // definitionId'yi izlemeye gerek yok — 0 dondururuz (yeterli).
  private definitionIdOf(): string {
    return "";
  }

  private nextDisplayOrder(storeId: string, type: ProductTaxonomyType) {
    return [...this.values.values()].filter((v) => v.storeId === storeId && v.type === type).length;
  }

  async createValueWithOption(input: TaxonomyCreateInput): Promise<TaxonomyValueRecord> {
    // DB partial-unique-index'in simulasyonu: check+insert AYNI senkron adimda (await YOK
    // arada) — gercek bir DB unique constraint gibi ATOMIK. Servisin DIS on-kontrolu
    // (`findBySlug`, ayrı await) ile bu ikisi arasindaki bosluk tam da yakalanmasi gereken
    // yaris penceresidir: iki concurrent `ensureStoreTaxonomyDefaults` cagrisi ikisi de
    // on-kontrolden "yok" sonucu alabilir, ama SADECE biri buradaki senkron check+insert'e
    // ilk ulasan kazanir; digeri TaxonomyOptionConflictError alir (bkz. servisin yutma mantigi).
    const dup = this.findBySlugSync(input.storeId, input.type, input.slug);
    if (dup) {
      throw new TaxonomyOptionConflictError();
    }
    this.seq += 1;
    const optionId = `opt-${this.seq}`;
    const id = `tax-${this.seq}`;
    const record: TaxonomyValueRecord = {
      id,
      storeId: input.storeId,
      type: input.type,
      name: input.name,
      slug: input.slug,
      status: "ACTIVE",
      displayOrder: this.nextDisplayOrder(input.storeId, input.type),
      metadata: input.metadata ?? {},
      parentId: input.parentId ?? null,
      attributeOptionId: optionId,
      createdAt: NOW,
      updatedAt: NOW,
      option: {
        id: optionId,
        storeId: input.storeId,
        value: input.slug,
        label: input.name,
        sortOrder: this.nextSortOrder(input.storeId, input.attributeDefinitionId),
        status: "ACTIVE",
      },
    };
    this.values.set(id, record);
    return record;
  }

  async renameValueAndOption(_storeId: string, id: string, patch: TaxonomyUpdatePatch) {
    const v = this.values.get(id);
    if (!v) throw new Error(`fake: taxonomy value ${id} not found`);
    const updated: TaxonomyValueRecord = {
      ...v,
      name: patch.name !== undefined ? patch.name : v.name,
      metadata: patch.metadata !== undefined ? patch.metadata : v.metadata,
      parentId: patch.parentId !== undefined ? patch.parentId : v.parentId,
      displayOrder: patch.displayOrder !== undefined ? patch.displayOrder : v.displayOrder,
      updatedAt: NOW,
      option: { ...v.option },
    };
    if (patch.name !== undefined) updated.option.label = patch.name;
    if (patch.displayOrder !== undefined) updated.option.sortOrder = patch.displayOrder;
    this.values.set(id, updated);
    return updated;
  }

  async setStatusBoth(_storeId: string, id: string, status: TaxonomyValueRecord["status"]) {
    const v = this.values.get(id);
    if (!v) throw new Error(`fake: taxonomy value ${id} not found`);
    const updated: TaxonomyValueRecord = {
      ...v,
      status,
      updatedAt: NOW,
      option: { ...v.option, status },
    };
    this.values.set(id, updated);
    return updated;
  }

  async reorderBoth(_storeId: string, _type: ProductTaxonomyType, orderedIds: string[]) {
    const results: TaxonomyValueRecord[] = [];
    orderedIds.forEach((id, i) => {
      const v = this.values.get(id);
      if (!v) throw new Error(`fake: taxonomy value ${id} not found`);
      const updated: TaxonomyValueRecord = {
        ...v,
        displayOrder: i,
        updatedAt: NOW,
        option: { ...v.option, sortOrder: i },
      };
      this.values.set(id, updated);
      results.push(updated);
    });
    return results;
  }

  async deleteBoth(_storeId: string, id: string) {
    this.values.delete(id);
  }
}

describe("TaxonomyService", () => {
  let data: FakeTaxonomyData;
  let svc: TaxonomyService;

  beforeEach(() => {
    data = new FakeTaxonomyData(buildDefinitionIds());
    svc = createTaxonomyService(data);
  });

  describe("create (single writer)", () => {
    it("create(type=SEASON, name='SS25') -> yeni ProductTaxonomyValue + YENI store-scoped AttributeOption; option.storeId === value.storeId", async () => {
      const created = await svc.create("s1", { type: "SEASON", name: "SS25" });
      expect(created.type).toBe("SEASON");
      expect(created.slug).toBe("ss25");
      expect(created.option.value).toBe("ss25");
      expect(created.option.storeId).toBe("s1");
      expect(created.option.storeId).toBe(created.storeId);
    });

    it("iki magaza ayni MATERIAL 'pamuk' -> ikisi de basarili, FARKLI attributeOptionId (paylasilan global option yok)", async () => {
      const a = await svc.create("s1", { type: "MATERIAL", name: "Pamuk" });
      const b = await svc.create("s2", { type: "MATERIAL", name: "Pamuk" });
      expect(a.slug).toBe(b.slug);
      expect(a.attributeOptionId).not.toBe(b.attributeOptionId);
      expect(a.option.storeId).toBe("s1");
      expect(b.option.storeId).toBe("s2");
    });

    it("ayni (store,type) icinde duplicate isim/slug -> TAXONOMY_DUPLICATE (409); ikinci magaza ayni ismi serbestce kullanabilir", async () => {
      await svc.create("s1", { type: "MATERIAL", name: "Pamuk" });
      await expect(svc.create("s1", { type: "MATERIAL", name: "Pamuk" })).rejects.toMatchObject({
        code: "TAXONOMY_DUPLICATE",
      });
      await expect(svc.create("s2", { type: "MATERIAL", name: "Pamuk" })).resolves.toBeTruthy();
    });

    it("GLOBAL canonical 'pamuk' (storeId NULL) zaten var olsa bile store-scoped yeni option yaratir (bagimsiz)", async () => {
      data.globalOptions.set("global-cotton", { id: "global-cotton", value: "pamuk" });
      const created = await svc.create("s1", { type: "MATERIAL", name: "Pamuk" });
      expect(created.attributeOptionId).not.toBe("global-cotton");
      expect(created.option.storeId).toBe("s1");
    });

    it("unknown type -> TAXONOMY_UNKNOWN_TYPE (400)", async () => {
      await expect(svc.create("s1", { type: "NOPE", name: "X" })).rejects.toMatchObject({
        code: "TAXONOMY_UNKNOWN_TYPE",
      });
    });
  });

  describe("update / rename", () => {
    it("rename: name+label tek tx'te guncellenir; slug + option.value IMMUTABLE", async () => {
      const created = await svc.create("s1", { type: "SEASON", name: "SS25" });
      const renamed = await svc.update("s1", created.id, { name: "İlkbahar/Yaz 2025" });
      expect(renamed.name).toBe("İlkbahar/Yaz 2025");
      expect(renamed.option.label).toBe("İlkbahar/Yaz 2025");
      expect(renamed.slug).toBe("ss25");
      expect(renamed.option.value).toBe("ss25");
    });

    it("mevcut ProductAttributeValue/VariantAttributeValue atamalari rename sonrasi hala cozer (optionId degismedi)", async () => {
      const created = await svc.create("s1", { type: "SEASON", name: "SS25" });
      data.productAttributeValues.push({ optionId: created.attributeOptionId });
      data.variantAttributeValues.push({ optionId: created.attributeOptionId });
      const renamed = await svc.update("s1", created.id, { name: "Yeni İsim" });
      expect(renamed.attributeOptionId).toBe(created.attributeOptionId);
      expect(await svc.usageCount("s1", created.id)).toBe(2);
    });
  });

  describe("archive / restore", () => {
    it("archive: value.status=ARCHIVED aynı tx'te option.status da ARCHIVED; mevcut atamalar dokunulmaz", async () => {
      const created = await svc.create("s1", { type: "SEASON", name: "SS25" });
      const archived = await svc.archive("s1", created.id);
      expect(archived.status).toBe("ARCHIVED");
      expect(archived.option.status).toBe("ARCHIVED");
    });

    it("restore: value.status=ACTIVE (her iki modelde) aynı tx'te", async () => {
      const created = await svc.create("s1", { type: "SEASON", name: "SS25" });
      await svc.archive("s1", created.id);
      const restored = await svc.restore("s1", created.id);
      expect(restored.status).toBe("ACTIVE");
      expect(restored.option.status).toBe("ACTIVE");
    });
  });

  describe("reorder", () => {
    it("reorder(orderedIds): displayOrder monoton set edilir VE option.sortOrder mirror'lanir, ayni tx", async () => {
      const a = await svc.create("s1", { type: "MATERIAL", name: "Pamuk" });
      const b = await svc.create("s1", { type: "MATERIAL", name: "Yün" });
      const c = await svc.create("s1", { type: "MATERIAL", name: "Keten" });
      const reordered = await svc.reorder("s1", "MATERIAL", [c.id, a.id, b.id]);
      expect(reordered.map((r) => r.id)).toEqual([c.id, a.id, b.id]);
      expect(reordered.map((r) => r.displayOrder)).toEqual([0, 1, 2]);
      expect(reordered.map((r) => r.option.sortOrder)).toEqual([0, 1, 2]);
    });
  });

  describe("delete", () => {
    it("delete: yalniz usageCount===0 iken izinli; aksi halde TAXONOMY_IN_USE (409)", async () => {
      const created = await svc.create("s1", { type: "SEASON", name: "SS25" });
      data.productAttributeValues.push({ optionId: created.attributeOptionId });
      await expect(svc.delete("s1", created.id)).rejects.toMatchObject({ code: "TAXONOMY_IN_USE" });
    });

    it("delete: usageCount===0 iken HER IKI satiri da (value+option) tek tx'te siler", async () => {
      const created = await svc.create("s1", { type: "SEASON", name: "SS25" });
      await svc.delete("s1", created.id);
      await expect(svc.get("s1", created.id)).rejects.toMatchObject({ code: "TAXONOMY_NOT_FOUND" });
    });

    it("data-access: deleteBoth GERCEK bir Prisma P2003'u (FK restrict) TaxonomyOptionInUseError'a cevirir (isForeignKeyRestrictError + catch fiilen tetiklenir)", async () => {
      // Bu test taxonomy-data.ts'teki GERCEK `createPrismaTaxonomyDataAccess().deleteBoth`
      // implementasyonunu cagirir (servisin fake DataAccess'i degil) — health.test.ts'teki
      // (~:667) `new Prisma.PrismaClientKnownRequestError(..., { code: "P2002", ... })` deseninin
      // P2003 varyanti. Amac: asagidaki servis-seviyesi testin (racyData.deleteBoth zaten TIPLI
      // bir hata firlatiyor) atladigi seyi kapatmak — burada P2003'u FIRLATAN gercek Prisma
      // hatasi, `isForeignKeyRestrictError` tarafindan GERCEKTEN taninip TaxonomyOptionInUseError'a
      // cevrildigini dogrular (translation regresyona ugrarsa bu test KIRILIR).
      const txStub = {
        productTaxonomyValue: {
          findUnique: async () => ({ attributeOptionId: "opt-1" }),
          delete: async () => ({ id: "tax-1" }),
        },
        attributeOption: {
          delete: async () => {
            throw new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed on the field: `optionId`", {
              code: "P2003",
              clientVersion: "test",
            });
          },
        },
      };
      const prismaStub = {
        $transaction: async (cb: (tx: typeof txStub) => Promise<unknown>) => cb(txStub),
      } as unknown as PrismaClient;

      const prismaData = createPrismaTaxonomyDataAccess(prismaStub);

      await expect(prismaData.deleteBoth("s1", "tax-1")).rejects.toBeInstanceOf(TaxonomyOptionInUseError);
    });

    it("TOCTOU race (servis yarisi): usageCount()===0 kontrol aninda, ama deleteBoth zaten tipli TaxonomyOptionInUseError firlatirsa servis TAXONOMY_IN_USE (409)'a cevirir — raw hata SIZMAZ", async () => {
      const created = await svc.create("s1", { type: "SEASON", name: "SS25" });
      // Ayni alttaki `data`yi kullanan ama iki metodu ezen bir wrapper: countUsage on-kontrolde
      // 0 doner (kontrol aninda gercekten bos), fakat deleteBoth (gercek Prisma implementasyonunun
      // bu aradaki yeni bir assignment icin P2003 alip TaxonomyOptionInUseError firlatmasini
      // simule eder) — servisin bu ikinci hatayi da TAXONOMY_IN_USE'a cevirdigini dogrular.
      const racyData: TaxonomyDataAccess = {
        platformDefinitionIdForCode: data.platformDefinitionIdForCode.bind(data),
        findBySlug: data.findBySlug.bind(data),
        findById: data.findById.bind(data),
        list: data.list.bind(data),
        countUsage: async () => 0,
        countUsageBatch: async () => ({}),
        createValueWithOption: data.createValueWithOption.bind(data),
        renameValueAndOption: data.renameValueAndOption.bind(data),
        setStatusBoth: data.setStatusBoth.bind(data),
        reorderBoth: data.reorderBoth.bind(data),
        deleteBoth: async () => {
          throw new TaxonomyOptionInUseError();
        },
      };
      const racySvc = createTaxonomyService(racyData);

      await expect(racySvc.delete("s1", created.id)).rejects.toMatchObject({ code: "TAXONOMY_IN_USE" });
      // Deger hala mevcut (delete gercekte hicbir seyi silmedi — racyData.deleteBoth attı, fake
      // Map'ten silinmedi), ve firlayan hata `TaxonomyError` (raw TaxonomyOptionInUseError DEGIL).
      await expect(svc.get("s1", created.id)).resolves.toBeTruthy();
      try {
        await racySvc.delete("s1", created.id);
        throw new Error("expected delete to reject");
      } catch (error) {
        expect(error).not.toBeInstanceOf(TaxonomyOptionInUseError);
        expect((error as { code?: string }).code).toBe("TAXONOMY_IN_USE");
      }
    });
  });

  describe("guard'lar", () => {
    it("bilinmeyen tip icin list/reorder -> TAXONOMY_UNKNOWN_TYPE (400)", async () => {
      await expect(svc.list("s1", "NOPE")).rejects.toMatchObject({ code: "TAXONOMY_UNKNOWN_TYPE" });
    });

    it("baska magazanin taksonomi id'si -> TAXONOMY_CROSS_STORE (403)", async () => {
      const created = await svc.create("s1", { type: "SEASON", name: "SS25" });
      await expect(svc.get("s2", created.id)).rejects.toMatchObject({ code: "TAXONOMY_CROSS_STORE" });
    });

    it("olmayan id -> TAXONOMY_NOT_FOUND (404)", async () => {
      await expect(svc.get("s1", "does-not-exist")).rejects.toMatchObject({ code: "TAXONOMY_NOT_FOUND" });
    });

    it("option.storeId !== value.storeId ise (bozuk kayit) reddedilir — invariant guard", async () => {
      const created = await svc.create("s1", { type: "SEASON", name: "SS25" });
      // Bozuk durumu simule et: option.storeId'yi manuel bozarak (fake veri katmanindan) invariant ihlali yarat.
      const corrupted: TaxonomyValueRecord = { ...created, option: { ...created.option, storeId: "s2" } };
      data.values.set(created.id, corrupted);
      await expect(svc.get("s1", created.id)).rejects.toThrow(/invariant/i);
    });

    it("usageCount = ProductAttributeValue.optionId + ProductAttributeValueOption.attributeOptionId + VariantAttributeValue.optionId", async () => {
      const created = await svc.create("s1", { type: "MATERIAL", name: "Pamuk" });
      data.productAttributeValues.push({ optionId: created.attributeOptionId });
      data.productAttributeValueOptions.push({ attributeOptionId: created.attributeOptionId });
      data.productAttributeValueOptions.push({ attributeOptionId: created.attributeOptionId });
      data.variantAttributeValues.push({ optionId: created.attributeOptionId });
      expect(await svc.usageCount("s1", created.id)).toBe(4);
    });
  });

  describe("ensureStoreTaxonomyDefaults", () => {
    it("bos magazada -> registry'deki her tip icin bir kanonik deger+option olusturur", async () => {
      await svc.ensureStoreTaxonomyDefaults("s1");
      const values = await svc.list("s1");
      const expectedCount = PRODUCT_TAXONOMY_TYPES.reduce(
        (sum, type) => sum + TAXONOMY_TYPE_REGISTRY[type].canonical.length,
        0,
      );
      expect(values.length).toBe(expectedCount);
      // her option store-scoped, kendi tipine ait
      for (const v of values) {
        expect(v.option.storeId).toBe("s1");
      }
      const season = values.find((v) => v.type === "SEASON" && v.slug === "ss");
      expect(season).toBeTruthy();
    });

    it("re-run -> no-op (dup yok); manuel rename edilmis bir deger name/status/displayOrder korur", async () => {
      await svc.ensureStoreTaxonomyDefaults("s1");
      const before = await svc.list("s1");
      const season = before.find((v) => v.type === "SEASON" && v.slug === "ss")!;
      const renamed = await svc.update("s1", season.id, { name: "Manuel İsim" });
      expect(renamed.displayOrder).toBe(season.displayOrder);

      await svc.ensureStoreTaxonomyDefaults("s1");
      const after = await svc.list("s1");
      expect(after.length).toBe(before.length);
      const seasonAfter = after.find((v) => v.id === season.id)!;
      expect(seasonAfter.name).toBe("Manuel İsim");
      expect(seasonAfter.displayOrder).toBe(season.displayOrder);
    });

    it("store'un arsivledigi bir kanonik degeri RESURRECT etmez", async () => {
      await svc.ensureStoreTaxonomyDefaults("s1");
      const values = await svc.list("s1");
      const season = values.find((v) => v.type === "SEASON" && v.slug === "ss")!;
      await svc.archive("s1", season.id);

      await svc.ensureStoreTaxonomyDefaults("s1");
      const after = await svc.list("s1");
      const seasonAfter = after.find((v) => v.id === season.id)!;
      expect(seasonAfter.status).toBe("ARCHIVED");
      // Toplam sayi degismedi (yeni bir 'ss' kaydi EKLENMEDI)
      expect(after.filter((v) => v.type === "SEASON" && v.slug === "ss").length).toBe(1);
    });

    it("iki concurrent ensureStoreTaxonomyDefaults cagrisi -> dup yok (unique-conflict yutuldu)", async () => {
      await Promise.all([svc.ensureStoreTaxonomyDefaults("s1"), svc.ensureStoreTaxonomyDefaults("s1")]);
      const values = await svc.list("s1");
      const expectedCount = PRODUCT_TAXONOMY_TYPES.reduce(
        (sum, type) => sum + TAXONOMY_TYPE_REGISTRY[type].canonical.length,
        0,
      );
      expect(values.length).toBe(expectedCount);
      // Her (type,slug) tekil olmali
      const seen = new Set<string>();
      for (const v of values) {
        const key = `${v.type}|${v.slug}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });

    it("baska magazanin satirlarina ASLA dokunmaz", async () => {
      await svc.ensureStoreTaxonomyDefaults("s1");
      await svc.ensureStoreTaxonomyDefaults("s2");
      const s1Values = await svc.list("s1");
      const s2Values = await svc.list("s2");
      const s1Ids = new Set(s1Values.map((v) => v.id));
      for (const v of s2Values) {
        expect(s1Ids.has(v.id)).toBe(false);
        expect(v.storeId).toBe("s2");
      }
    });

    describe("Task 27P — fail-closed when PLATFORM defs are totally unprovisioned", () => {
      it("HICBIR governed kod grounded degilse (tum PLATFORM AttributeDefinition'lar eksik) -> TAXONOMY_NOT_PROVISIONED firlatir, hicbir deger olusturulmaz", async () => {
        const unprovisionedData = new FakeTaxonomyData({});
        const unprovisionedSvc = createTaxonomyService(unprovisionedData);
        await expect(unprovisionedSvc.ensureStoreTaxonomyDefaults("s1")).rejects.toMatchObject({
          code: "TAXONOMY_NOT_PROVISIONED",
        });
        const values = await unprovisionedSvc.list("s1");
        expect(values.length).toBe(0);
      });

      it("kismi provisioning (en az bir kod grounded) -> THROW ETMEZ; grounded tip icin degerler olusur, eksik tipler sessizce atlanir", async () => {
        const seasonCode = definitionCodeForTaxonomyType("SEASON");
        const partialData = new FakeTaxonomyData({ [seasonCode]: "def-season-only" });
        const partialSvc = createTaxonomyService(partialData);
        await expect(partialSvc.ensureStoreTaxonomyDefaults("s1")).resolves.toBeUndefined();
        const values = await partialSvc.list("s1");
        expect(values.length).toBe(TAXONOMY_TYPE_REGISTRY.SEASON.canonical.length);
        expect(values.every((v) => v.type === "SEASON")).toBe(true);
      });

      it("tum PLATFORM tanimlari mevcutken (normal durum) throw ETMEZ, degerler olusturulur — regresyon guard", async () => {
        await expect(svc.ensureStoreTaxonomyDefaults("s1")).resolves.toBeUndefined();
        const values = await svc.list("s1");
        expect(values.length).toBeGreaterThan(0);
      });
    });

    describe("registry'ye yeni kanonik deger eklenmesi", () => {
      const EXTRA = { name: "Test-Only Yeni Deger", slug: "test-only-new-value" };

      afterEach(() => {
        const idx = TAXONOMY_TYPE_REGISTRY.MATERIAL.canonical.findIndex((c) => c.slug === EXTRA.slug);
        if (idx >= 0) TAXONOMY_TYPE_REGISTRY.MATERIAL.canonical.splice(idx, 1);
      });

      it("registry yeni bir kanonik deger kazanir, re-run -> yalniz eksik olan eklenir; mevcut degerler dokunulmaz", async () => {
        await svc.ensureStoreTaxonomyDefaults("s1");
        const before = await svc.list("s1");
        const materialBefore = before.filter((v) => v.type === "MATERIAL");

        TAXONOMY_TYPE_REGISTRY.MATERIAL.canonical.push(EXTRA);

        await svc.ensureStoreTaxonomyDefaults("s1");
        const after = await svc.list("s1");
        const materialAfter = after.filter((v) => v.type === "MATERIAL");

        expect(materialAfter.length).toBe(materialBefore.length + 1);
        const added = materialAfter.find((v) => v.slug === EXTRA.slug);
        expect(added).toBeTruthy();
        expect(added?.name).toBe(EXTRA.name);
        // Mevcut degerler (id/displayOrder) DEGISMEDI
        for (const before1 of materialBefore) {
          const stillThere = materialAfter.find((v) => v.id === before1.id);
          expect(stillThere?.displayOrder).toBe(before1.displayOrder);
          expect(stillThere?.name).toBe(before1.name);
        }
      });
    });
  });
});
