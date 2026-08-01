import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/index.js";

// TODO-165A (ADR-?) — Task 1: Brand + ProductTaxonomyValue governance temeli + AttributeOption
// store-scoped constraint swap. Bu test iki parcadan olusur: (1) Prisma DMMF'in yeni
// model/alanlari ifsa ettigini statik dogrulama, (2) canli DB'ye karsi partial unique index
// davranisinin gercekten calistigini dogrulama (Step 4b).

describe("TODO-165A Task 1 — Prisma DMMF", () => {
  it("exposes Brand + ProductTaxonomyValue + Product.brandId in the DMMF", () => {
    const models = Object.fromEntries(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
    expect(models.Brand).toBeTruthy();
    expect(models.ProductTaxonomyValue).toBeTruthy();
    const product = models.Product!.fields.map((f) => f.name);
    expect(product).toContain("brandId");
    const option = models.AttributeOption!.fields.map((f) => f.name);
    expect(option).toContain("storeId");
    expect(option).toContain("metadata");
  });
});

// Canlı Postgres gerektirir; DATABASE_URL yoksa (ör. CI unit-test job'i, DB yok) atlanir.
// (Yukaridaki DMMF testi DB'siz calisir ve her ortamda kosar.)
describe.skipIf(!process.env.DATABASE_URL)("TODO-165A Task 1 — AttributeOption partial unique index swap (live DB)", () => {
  const createdStoreIds: string[] = [];
  let attributeDefinitionId: string | null = null;

  afterAll(async () => {
    // Temizlik: olusturulan AttributeOption satirlari Store cascade ile otomatik silinir;
    // yine de acikca temizleyelim (attributeDefinition da).
    if (attributeDefinitionId) {
      await prisma.attributeOption.deleteMany({ where: { attributeDefinitionId } });
      await prisma.attributeDefinition.deleteMany({ where: { id: attributeDefinitionId } });
    }
    for (const storeId of createdStoreIds) {
      await prisma.store.deleteMany({ where: { id: storeId } });
    }
  });

  it("both partial unique indexes exist in pg_indexes", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'AttributeOption'
        AND indexname IN ('AttributeOption_def_value_global_key', 'AttributeOption_store_def_value_key')
    `;
    const names = rows.map((r) => r.indexname).sort();
    expect(names).toEqual(
      ["AttributeOption_def_value_global_key", "AttributeOption_store_def_value_key"].sort(),
    );
  });

  it("enforces global uniqueness for storeId=NULL and per-store uniqueness for storeId set", async () => {
    const suffix = randomUUID().slice(0, 8);

    const storeA = await prisma.store.create({
      data: { name: `Task1 Test Store A ${suffix}`, slug: `task1-test-store-a-${suffix}` },
    });
    const storeB = await prisma.store.create({
      data: { name: `Task1 Test Store B ${suffix}`, slug: `task1-test-store-b-${suffix}` },
    });
    createdStoreIds.push(storeA.id, storeB.id);

    const definition = await prisma.attributeDefinition.create({
      data: {
        code: `task1_test_attr_${suffix}`,
        name: "Task1 Test Attribute",
        scope: "PLATFORM",
        dataType: "SELECT",
      },
    });
    attributeDefinitionId = definition.id;

    // storeId=NULL — ilk kayit basarili.
    await prisma.attributeOption.create({
      data: {
        attributeDefinitionId: definition.id,
        storeId: null,
        value: "pamuk",
        label: "Pamuk",
      },
    });

    // storeId=NULL — ikinci kayit (ayni deger) global partial index'e carpip HATA vermeli.
    await expect(
      prisma.attributeOption.create({
        data: {
          attributeDefinitionId: definition.id,
          storeId: null,
          value: "pamuk",
          label: "Pamuk (dup)",
        },
      }),
    ).rejects.toThrow();

    // storeId=A — basarili (farkli store, ayni deger; store-partial index'e carpar sadece kendi
    // storeId'siyle cakisirsa).
    await prisma.attributeOption.create({
      data: {
        attributeDefinitionId: definition.id,
        storeId: storeA.id,
        value: "pamuk",
        label: "Pamuk (Store A)",
      },
    });

    // storeId=B — basarili (A'dan bagimsiz).
    await prisma.attributeOption.create({
      data: {
        attributeDefinitionId: definition.id,
        storeId: storeB.id,
        value: "pamuk",
        label: "Pamuk (Store B)",
      },
    });

    // storeId=A tekrar — HATA vermeli (store-partial unique index).
    await expect(
      prisma.attributeOption.create({
        data: {
          attributeDefinitionId: definition.id,
          storeId: storeA.id,
          value: "pamuk",
          label: "Pamuk (Store A dup)",
        },
      }),
    ).rejects.toThrow();
  });
});
