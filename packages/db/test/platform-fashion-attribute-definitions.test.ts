import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/index.js";

// TODO-165A Task 27P (ADR-165A gap-fix) — PLATFORM governed `fashion.*` AttributeDefinition
// provisioning migration. Prior to this migration NOTHING in the repo provisioned the
// scope=PLATFORM/storeId=NULL `AttributeDefinition` rows that `ensureStoreTaxonomyDefaults`
// (apps/api-gateway/src/taxonomy/taxonomy-service.ts) + `platformDefinitionIdForCode`
// (taxonomy-data.ts) require for EVERY governed taxonomy type — a fresh DB / new store
// enabling FASHION_VERTICAL silently got ZERO governed values. This migration is the ONE
// authority that provisions them (ADDITIVE + IDEMPOTENT — safe to re-run).
//
// Codes/dataTypes below mirror `apps/api-gateway/src/fashion/canonical-attributes.ts`
// (FASHION_PRODUCT_ATTRIBUTES + FASHION_VARIANT_ATTRIBUTES entries whose codes are governed)
// and `@commerce-os/contracts/product-taxonomy` TAXONOMY_TYPE_REGISTRY[type].definitionCode —
// this test hardcodes the literal list (mirrors `fashion-taxonomy-backfill.test.ts` style)
// rather than importing api-gateway/contracts to keep this package's test dependency graph
// unchanged.
//
// Unlike `fashion-taxonomy-backfill.test.ts` (which seeds THROWAWAY PLATFORM defs and
// deletes them in afterAll), these rows are the REAL governed provisioning — they are
// intentionally NOT cleaned up (they must persist for `ensureStoreTaxonomyDefaults` to work
// on this DB going forward).

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  "../prisma/migrations/20260802120000_provision_platform_fashion_attribute_definitions/migration.sql",
);

// `id` pins these to the EXACT deterministic rows this migration creates (not just "any
// row with this code") — this file runs concurrently (separate vitest worker) alongside
// `fashion-taxonomy-backfill.test.ts`, which seeds its OWN throwaway PLATFORM rows for two
// of these same literal codes (fashion.season / fashion.color_family) mid-test before its
// own afterAll cleanup; matching on id as well as code makes this test immune to that
// unrelated file's transient rows.
const EXPECTED: readonly { id: string; code: string; dataType: string }[] = [
  { id: "plat-fashion-season", code: "fashion.season", dataType: "SELECT" },
  { id: "plat-fashion-collection", code: "fashion.collection", dataType: "SELECT" },
  { id: "plat-fashion-material", code: "fashion.material", dataType: "MULTI_SELECT" },
  { id: "plat-fashion-fit", code: "fashion.fit", dataType: "SELECT" },
  { id: "plat-fashion-pattern", code: "fashion.pattern", dataType: "SELECT" },
  { id: "plat-fashion-collar-type", code: "fashion.collar_type", dataType: "SELECT" },
  { id: "plat-fashion-sleeve-type", code: "fashion.sleeve_type", dataType: "SELECT" },
  { id: "plat-fashion-length", code: "fashion.length", dataType: "SELECT" },
  { id: "plat-fashion-care", code: "fashion.care", dataType: "MULTI_SELECT" },
  { id: "plat-fashion-sustainability", code: "fashion.sustainability", dataType: "MULTI_SELECT" },
  { id: "plat-fashion-color-family", code: "fashion.color_family", dataType: "SELECT" },
];

function readMigrationStatements(): string[] {
  const sql = readFileSync(migrationPath, "utf8");
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

// Canlı Postgres gerektirir; DATABASE_URL yoksa (ör. CI unit-test job'i, DB yok) atlanir.
describe.skipIf(!process.env.DATABASE_URL)("TODO-165A Task 27P — PLATFORM fashion.* AttributeDefinition provisioning (live DB)", () => {
  it("provisions exactly the 11 governed PLATFORM AttributeDefinition rows (scope=PLATFORM, storeId=NULL) with correct code/dataType/status", async () => {
    const rows = await prisma.attributeDefinition.findMany({
      where: { scope: "PLATFORM", storeId: null, id: { in: EXPECTED.map((e) => e.id) } },
    });
    expect(rows).toHaveLength(EXPECTED.length);
    for (const expected of EXPECTED) {
      const row = rows.find((r) => r.id === expected.id);
      expect(row).toBeTruthy();
      expect(row!.code).toBe(expected.code);
      expect(row!.scope).toBe("PLATFORM");
      expect(row!.storeId).toBeNull();
      expect(row!.dataType).toBe(expected.dataType);
      expect(row!.status).toBe("ACTIVE");
      expect(row!.name.length).toBeGreaterThan(0);
    }
  });

  it("re-running the migration body is idempotent — no duplicate PLATFORM rows are created", async () => {
    const statements = readMigrationStatements();
    expect(statements.length).toBeGreaterThanOrEqual(EXPECTED.length);
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
    const rows = await prisma.attributeDefinition.findMany({
      where: { scope: "PLATFORM", storeId: null, id: { in: EXPECTED.map((e) => e.id) } },
    });
    expect(rows).toHaveLength(EXPECTED.length);
  });
});
