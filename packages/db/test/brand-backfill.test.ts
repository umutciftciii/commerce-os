import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/index.js";

// TODO-165A (ADR-165A) — Task 14: legacy Product.brand (serbest metin) -> store-scoped Brand
// kayitlari + Product.brandId backfill. Canli DB entegrasyon testi: throwaway store/product
// olusturup migration SQL govdesini ($executeRawUnsafe ile) calistirir; sonuclari, idempotent
// yeniden-calismayi ve manuel atanmis brandId'nin ASLA ezilmedigini dogrular.

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  "../prisma/migrations/20260801130000_backfill_product_brand/migration.sql",
);

function readBackfillStatements(): string[] {
  const sql = readFileSync(migrationPath, "utf8");
  // Yorum satirlarini (--) at, kalan gövdeyi ";" ile ayir (INSERT + UPDATE, 2 ifade).
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function runBackfill(): Promise<void> {
  const statements = readBackfillStatements();
  expect(statements.length).toBeGreaterThanOrEqual(2);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

// Canlı Postgres gerektirir; DATABASE_URL yoksa (ör. CI unit-test job'i, DB yok) atlanir.
describe.skipIf(!process.env.DATABASE_URL)("TODO-165A Task 14 — Product.brand -> Brand backfill migration (live DB)", () => {
  const createdStoreIds: string[] = [];

  afterAll(async () => {
    for (const storeId of createdStoreIds) {
      await prisma.store.deleteMany({ where: { id: storeId } });
    }
  });

  it("creates one Brand per (store, brand-name), links brandId, dedups colliding slugs, ignores blanks, is idempotent, and never overwrites a manual brandId", async () => {
    const suffix = randomUUID().slice(0, 8);

    const storeA = await prisma.store.create({
      data: { name: `Task14 Store A ${suffix}`, slug: `task14-store-a-${suffix}` },
    });
    const storeB = await prisma.store.create({
      data: { name: `Task14 Store B ${suffix}`, slug: `task14-store-b-${suffix}` },
    });
    createdStoreIds.push(storeA.id, storeB.id);

    // Store A: three exact-string "Nike" products (single distinct pair, dedup within store),
    // one "NIKE" (different case -> different distinct pair, same slug -> must NOT create a
    // second Brand row; collision handled by ON CONFLICT DO NOTHING), one padded "  Adidas  ",
    // one blank/whitespace-only brand (must be ignored entirely).
    const productA1 = await prisma.product.create({
      data: { storeId: storeA.id, title: "A1", slug: `a1-${suffix}`, brand: "Nike" },
    });
    const productA2 = await prisma.product.create({
      data: { storeId: storeA.id, title: "A2", slug: `a2-${suffix}`, brand: "Nike" },
    });
    const productA3 = await prisma.product.create({
      data: { storeId: storeA.id, title: "A3", slug: `a3-${suffix}`, brand: "  Adidas  " },
    });
    const productA4 = await prisma.product.create({
      data: { storeId: storeA.id, title: "A4", slug: `a4-${suffix}`, brand: "NIKE" },
    });
    const productBlank = await prisma.product.create({
      data: { storeId: storeA.id, title: "Blank", slug: `blank-${suffix}`, brand: "   " },
    });

    // Store B: shares the brand NAME "Nike" with Store A -> must get its OWN store-scoped Brand.
    const productB1 = await prisma.product.create({
      data: { storeId: storeB.id, title: "B1", slug: `b1-${suffix}`, brand: "Nike" },
    });

    // Manual assignment case: brandId already set (to an unrelated Brand) BEFORE the backfill
    // runs; brand text says "Puma" but brandId must stay untouched (no overwrite of manual link).
    const manualBrand = await prisma.brand.create({
      data: { storeId: storeA.id, name: "Manually Assigned", slug: `manual-brand-${suffix}` },
    });
    const productManual = await prisma.product.create({
      data: {
        storeId: storeA.id,
        title: "Manual",
        slug: `manual-${suffix}`,
        brand: "Puma",
        brandId: manualBrand.id,
      },
    });

    await runBackfill();

    const brandsA = await prisma.brand.findMany({ where: { storeId: storeA.id } });
    const brandsB = await prisma.brand.findMany({ where: { storeId: storeB.id } });

    const nikeBrandA = brandsA.find((b) => b.slug === "nike");
    const adidasBrandA = brandsA.find((b) => b.slug === "adidas");
    const nikeBrandB = brandsB.find((b) => b.slug === "nike");

    expect(nikeBrandA).toBeTruthy();
    expect(adidasBrandA).toBeTruthy();
    expect(nikeBrandB).toBeTruthy();
    // Store-scoped: Store A and Store B each get their OWN "nike" Brand row (not shared/global).
    expect(nikeBrandB!.id).not.toBe(nikeBrandA!.id);
    // "Nike" and "NIKE" collide on slug within Store A -> only ONE Brand row, not two.
    expect(brandsA.filter((b) => b.slug === "nike")).toHaveLength(1);

    const [refreshedA1, refreshedA2, refreshedA3, refreshedA4, refreshedBlank, refreshedB1, refreshedManual] =
      await Promise.all([
        prisma.product.findUniqueOrThrow({ where: { id: productA1.id } }),
        prisma.product.findUniqueOrThrow({ where: { id: productA2.id } }),
        prisma.product.findUniqueOrThrow({ where: { id: productA3.id } }),
        prisma.product.findUniqueOrThrow({ where: { id: productA4.id } }),
        prisma.product.findUniqueOrThrow({ where: { id: productBlank.id } }),
        prisma.product.findUniqueOrThrow({ where: { id: productB1.id } }),
        prisma.product.findUniqueOrThrow({ where: { id: productManual.id } }),
      ]);

    expect(refreshedA1.brandId).toBe(nikeBrandA!.id);
    expect(refreshedA2.brandId).toBe(nikeBrandA!.id);
    expect(refreshedA3.brandId).toBe(adidasBrandA!.id);
    expect(refreshedA4.brandId).toBe(nikeBrandA!.id);
    expect(refreshedBlank.brandId).toBeNull();
    expect(refreshedB1.brandId).toBe(nikeBrandB!.id);
    // Manual brandId is preserved, even though the legacy `brand` text ("Puma") differs.
    expect(refreshedManual.brandId).toBe(manualBrand.id);

    // Legacy `brand` string column must remain intact (dormant, not cleared).
    expect(refreshedA1.brand).toBe("Nike");

    // --- Idempotent re-run ---
    await runBackfill();

    const brandsAAfter = await prisma.brand.findMany({ where: { storeId: storeA.id } });
    const brandsBAfter = await prisma.brand.findMany({ where: { storeId: storeB.id } });
    expect(brandsAAfter).toHaveLength(brandsA.length);
    expect(brandsBAfter).toHaveLength(brandsB.length);

    const refreshedManualAfter = await prisma.product.findUniqueOrThrow({
      where: { id: productManual.id },
    });
    expect(refreshedManualAfter.brandId).toBe(manualBrand.id);
  });
});
