import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/index.js";

// TODO-165A (ADR-165A / ADR-255) — Task 14b: per-store store-scoped governed
// AttributeOption copies + ProductTaxonomyValue backfill for FASHION_VERTICAL-enabled
// stores. Live DB integration test: seeds throwaway PLATFORM (storeId=null) governed
// AttributeDefinition/AttributeOption rows using the EXACT literal `fashion.*` codes the
// immutable migration hardcodes (so its data-driven SQL actually matches them), two
// FASHION_VERTICAL ENABLED stores + one control store that is NOT enabled, runs the real
// migration SQL body via $executeRawUnsafe, and asserts: independent store-scoped
// AttributeOption copies (distinct ids, storeId set, store-isolated), bound ACTIVE
// ProductTaxonomyValue rows, the control store is untouched, an existing product
// assignment against the GLOBAL option is left exactly as-is (safe transition — no
// re-pointing), same canonical value in both stores does not collide, and re-running the
// migration body is a no-op (no duplicate rows).

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  "../prisma/migrations/20260801140000_backfill_fashion_taxonomy/migration.sql",
);

function readBackfillStatements(): string[] {
  const sql = readFileSync(migrationPath, "utf8");
  // Strip comment-only lines, split the remaining body on ";" (two INSERT statements).
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
describe.skipIf(!process.env.DATABASE_URL)("TODO-165A Task 14b — FASHION_VERTICAL store-scoped taxonomy backfill migration (live DB)", () => {
  const createdStoreIds: string[] = [];
  const createdDefinitionIds: string[] = [];

  afterAll(async () => {
    // Store cascade removes StoreModule/ProductTaxonomyValue/store-scoped AttributeOption/
    // Product/ProductAttributeValue rows first; only then can the global (storeId=null)
    // AttributeDefinition rows be deleted (their remaining global AttributeOption children
    // cascade with them).
    if (createdStoreIds.length > 0) {
      await prisma.store.deleteMany({ where: { id: { in: createdStoreIds } } });
    }
    if (createdDefinitionIds.length > 0) {
      await prisma.attributeDefinition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
    }
  });

  it("backfills independent per-store options + taxonomy rows, skips non-enabled stores, preserves legacy global assignments, and is idempotent", async () => {
    const suffix = randomUUID().slice(0, 8);

    // Throwaway PLATFORM governed AttributeDefinitions using the REAL literal codes the
    // migration's hardcoded ARRAY[...] / CASE match against. Safe: this isolated test DB
    // has zero `fashion.*` AttributeDefinition rows before this test (verified) — cleaned
    // up in afterAll.
    const seasonDef = await prisma.attributeDefinition.create({
      data: { scope: "PLATFORM", code: "fashion.season", name: "Sezon", dataType: "SELECT" },
    });
    const colorFamilyDef = await prisma.attributeDefinition.create({
      data: {
        scope: "PLATFORM",
        code: "fashion.color_family",
        name: "Renk Ailesi",
        dataType: "SELECT",
      },
    });
    createdDefinitionIds.push(seasonDef.id, colorFamilyDef.id);

    // Global canonical options (storeId=null) — mirrors canonical-attributes.ts shape.
    const seasonSS = await prisma.attributeOption.create({
      data: {
        attributeDefinitionId: seasonDef.id,
        storeId: null,
        value: "ss",
        label: "İlkbahar/Yaz",
        sortOrder: 0,
      },
    });
    const seasonFW = await prisma.attributeOption.create({
      data: {
        attributeDefinitionId: seasonDef.id,
        storeId: null,
        value: "fw",
        label: "Sonbahar/Kış",
        sortOrder: 1,
      },
    });
    const colorBlack = await prisma.attributeOption.create({
      data: {
        attributeDefinitionId: colorFamilyDef.id,
        storeId: null,
        value: "black",
        label: "Siyah",
        sortOrder: 0,
      },
    });

    const storeA = await prisma.store.create({
      data: { name: `Task14b Store A ${suffix}`, slug: `task14b-store-a-${suffix}` },
    });
    const storeB = await prisma.store.create({
      data: { name: `Task14b Store B ${suffix}`, slug: `task14b-store-b-${suffix}` },
    });
    // Control store: FASHION_VERTICAL StoreModule row exists but is DISABLED — must be
    // left completely untouched by the backfill (proves the state='ENABLED' guard, not
    // just the moduleKey match).
    const storeC = await prisma.store.create({
      data: { name: `Task14b Store C ${suffix}`, slug: `task14b-store-c-${suffix}` },
    });
    createdStoreIds.push(storeA.id, storeB.id, storeC.id);

    await prisma.storeModule.create({
      data: { storeId: storeA.id, moduleKey: "FASHION_VERTICAL", state: "ENABLED" },
    });
    await prisma.storeModule.create({
      data: { storeId: storeB.id, moduleKey: "FASHION_VERTICAL", state: "ENABLED" },
    });
    await prisma.storeModule.create({
      data: { storeId: storeC.id, moduleKey: "FASHION_VERTICAL", state: "DISABLED" },
    });

    // Adversarial guard case: a STORE-scoped AttributeDefinition owned by store C that
    // happens to collide on the exact literal code text 'fashion.season' (a hypothetical
    // store-defined custom attribute, not the governed PLATFORM one), plus its OWN
    // store-scoped option. Without the migration's `d."scope"='PLATFORM' AND d."storeId"
    // IS NULL` guard on the AttributeDefinition join, this could be misread as a governed
    // definition and get an unintended ProductTaxonomyValue. Must be completely ignored.
    const storeCCustomSeasonDef = await prisma.attributeDefinition.create({
      data: {
        scope: "STORE",
        storeId: storeC.id,
        code: "fashion.season",
        name: "Store C'nin kendi 'fashion.season' kodu (collision)",
        dataType: "SELECT",
      },
    });
    const storeCCustomOption = await prisma.attributeOption.create({
      data: {
        attributeDefinitionId: storeCCustomSeasonDef.id,
        storeId: storeC.id,
        value: "custom-value",
        label: "Store C custom",
        sortOrder: 0,
      },
    });

    // Existing product assignment against the GLOBAL option, created BEFORE the backfill
    // runs — must resolve exactly the same afterward (safe transition: no re-pointing).
    const productA = await prisma.product.create({
      data: { storeId: storeA.id, title: "Legacy Product", slug: `legacy-${suffix}` },
    });
    const legacyAssignment = await prisma.productAttributeValue.create({
      data: {
        storeId: storeA.id,
        productId: productA.id,
        attributeDefinitionId: seasonDef.id,
        optionId: seasonSS.id,
      },
    });

    await runBackfill();

    // --- Store A gets its own store-scoped copies ---
    const optionsA = await prisma.attributeOption.findMany({
      where: { storeId: storeA.id },
      orderBy: [{ attributeDefinitionId: "asc" }, { sortOrder: "asc" }],
    });
    expect(optionsA).toHaveLength(3); // 2 season + 1 color_family
    for (const opt of optionsA) {
      expect(opt.storeId).toBe(storeA.id);
      expect(opt.id).not.toBe(seasonSS.id);
      expect(opt.id).not.toBe(seasonFW.id);
      expect(opt.id).not.toBe(colorBlack.id);
    }
    const optionA_ss = optionsA.find(
      (o) => o.attributeDefinitionId === seasonDef.id && o.value === "ss",
    );
    const optionA_fw = optionsA.find(
      (o) => o.attributeDefinitionId === seasonDef.id && o.value === "fw",
    );
    const optionA_black = optionsA.find(
      (o) => o.attributeDefinitionId === colorFamilyDef.id && o.value === "black",
    );
    expect(optionA_ss).toBeTruthy();
    expect(optionA_fw).toBeTruthy();
    expect(optionA_black).toBeTruthy();
    expect(optionA_ss!.label).toBe("İlkbahar/Yaz");
    expect(optionA_ss!.sortOrder).toBe(0);

    // --- Store B gets its OWN independent copies (distinct ids, same canonical values) ---
    const optionsB = await prisma.attributeOption.findMany({ where: { storeId: storeB.id } });
    expect(optionsB).toHaveLength(3);
    const optionB_ss = optionsB.find(
      (o) => o.attributeDefinitionId === seasonDef.id && o.value === "ss",
    );
    expect(optionB_ss).toBeTruthy();
    // Same canonical value ("ss") in A and B does not collide — distinct rows.
    expect(optionB_ss!.id).not.toBe(optionA_ss!.id);

    // Store A cannot see store B's options and vice versa.
    expect(optionsA.some((o) => o.id === optionB_ss!.id)).toBe(false);

    // --- Control store C (DISABLED) gets nothing from the backfill: the only option it
    // has is the one manually created above (its own STORE-scoped code-collision
    // definition), completely untouched — no governed copies were added alongside it, and
    // it was not converted into a ProductTaxonomyValue despite its definition's code
    // literally matching a governed code string.
    const optionsC = await prisma.attributeOption.findMany({ where: { storeId: storeC.id } });
    expect(optionsC).toHaveLength(1);
    expect(optionsC[0]!.id).toBe(storeCCustomOption.id);
    const taxonomyForCustomOption = await prisma.productTaxonomyValue.findUnique({
      where: { attributeOptionId: storeCCustomOption.id },
    });
    expect(taxonomyForCustomOption).toBeNull();

    // --- ProductTaxonomyValue rows bound 1:1 to each store-scoped option, ACTIVE ---
    const taxonomyA = await prisma.productTaxonomyValue.findMany({ where: { storeId: storeA.id } });
    expect(taxonomyA).toHaveLength(3);
    const taxA_ss = taxonomyA.find((t) => t.attributeOptionId === optionA_ss!.id);
    const taxA_black = taxonomyA.find((t) => t.attributeOptionId === optionA_black!.id);
    expect(taxA_ss).toBeTruthy();
    expect(taxA_ss!.type).toBe("SEASON");
    expect(taxA_ss!.slug).toBe("ss");
    expect(taxA_ss!.name).toBe("İlkbahar/Yaz");
    expect(taxA_ss!.status).toBe("ACTIVE");
    expect(taxA_black).toBeTruthy();
    expect(taxA_black!.type).toBe("COLOR_FAMILY");
    expect(taxA_black!.slug).toBe("black");

    const taxonomyC = await prisma.productTaxonomyValue.findMany({ where: { storeId: storeC.id } });
    expect(taxonomyC).toHaveLength(0);

    // --- Existing global-option product assignment is untouched (safe transition) ---
    const refreshedAssignment = await prisma.productAttributeValue.findUniqueOrThrow({
      where: { id: legacyAssignment.id },
    });
    expect(refreshedAssignment.optionId).toBe(seasonSS.id);
    const refreshedGlobalOption = await prisma.attributeOption.findUniqueOrThrow({
      where: { id: seasonSS.id },
    });
    expect(refreshedGlobalOption.storeId).toBeNull();

    // --- Idempotent re-run: no duplicate options or taxonomy rows ---
    await runBackfill();

    const optionsAAfter = await prisma.attributeOption.findMany({ where: { storeId: storeA.id } });
    const optionsBAfter = await prisma.attributeOption.findMany({ where: { storeId: storeB.id } });
    const taxonomyAAfter = await prisma.productTaxonomyValue.findMany({
      where: { storeId: storeA.id },
    });
    expect(optionsAAfter).toHaveLength(3);
    expect(optionsBAfter).toHaveLength(3);
    expect(taxonomyAAfter).toHaveLength(3);

    const refreshedAssignmentAfter = await prisma.productAttributeValue.findUniqueOrThrow({
      where: { id: legacyAssignment.id },
    });
    expect(refreshedAssignmentAfter.optionId).toBe(seasonSS.id);
  });
});
