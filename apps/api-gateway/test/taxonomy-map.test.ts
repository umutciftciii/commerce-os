// TODO-165A (ADR-165A) — Product Data Governance: taxonomy registry <-> canonical-attributes
// bridge tests. Pure logic — no DB/IO. Verifies:
//   1) every ProductTaxonomyType (contracts) resolves to a real fashion.* code that is
//      grounded in the canonical-attributes.ts catalog, and the reverse map round-trips.
//   2) GOVERNED_TAXONOMY_CODES is derived (single authority) from PRODUCT_TAXONOMY_TYPES.
//   3) parseGovernedCodesFromMigrationSql correctly extracts the `d.code = ANY(ARRAY[...])`
//      list and the `CASE "code" WHEN ... THEN ... END` map from a representative SQL
//      fixture — this proves the parser works. The real T14b migration file does not exist
//      yet, so parity against it is a pending it.todo wired up in T14b.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  PRODUCT_TAXONOMY_TYPES,
  TAXONOMY_TYPE_REGISTRY,
  type ProductTaxonomyType,
} from "@commerce-os/contracts/product-taxonomy";
import { CANONICAL_ATTRIBUTE_CODES } from "../src/fashion/canonical-attributes.js";
import {
  GOVERNED_TAXONOMY_CODES,
  taxonomyTypeForDefinitionCode,
  definitionCodeForTaxonomyType,
  parseGovernedCodesFromMigrationSql,
} from "../src/taxonomy/taxonomy-map.js";

const here = dirname(fileURLToPath(import.meta.url));
const realMigrationPath = resolve(
  here,
  "../../../packages/db/prisma/migrations/20260801140000_backfill_fashion_taxonomy/migration.sql",
);

describe("taxonomy-map bridge", () => {
  it("every ProductTaxonomyType's definitionCode is grounded in the canonical-attributes.ts catalog", () => {
    expect(PRODUCT_TAXONOMY_TYPES.length).toBeGreaterThan(0);
    for (const type of PRODUCT_TAXONOMY_TYPES) {
      const code = TAXONOMY_TYPE_REGISTRY[type].definitionCode;
      expect(CANONICAL_ATTRIBUTE_CODES).toContain(code);
    }
  });

  it("GOVERNED_TAXONOMY_CODES is derived from PRODUCT_TAXONOMY_TYPES in stable order", () => {
    expect(GOVERNED_TAXONOMY_CODES).toEqual(
      PRODUCT_TAXONOMY_TYPES.map((type) => TAXONOMY_TYPE_REGISTRY[type].definitionCode),
    );
    // No duplicates — each governed code maps to exactly one type.
    expect(new Set(GOVERNED_TAXONOMY_CODES).size).toBe(GOVERNED_TAXONOMY_CODES.length);
  });

  it("type -> code -> type round-trips for every governed taxonomy type", () => {
    for (const type of PRODUCT_TAXONOMY_TYPES) {
      const code = definitionCodeForTaxonomyType(type);
      expect(typeof code).toBe("string");
      expect(taxonomyTypeForDefinitionCode(code)).toBe(type);
    }
  });

  it("returns null for codes that are not part of the governed taxonomy", () => {
    // fashion.gender exists in the canonical catalog but is not a governed taxonomy type.
    expect(taxonomyTypeForDefinitionCode("fashion.gender")).toBeNull();
    expect(taxonomyTypeForDefinitionCode("not.a.real.code")).toBeNull();
  });

  describe("parseGovernedCodesFromMigrationSql", () => {
    // Representative fixture matching the shape T14b's backfill migration will use:
    // an ARRAY[...] allowlist filter + a CASE code->type mapping. Order matches
    // PRODUCT_TAXONOMY_TYPES so codes/caseMap can be compared 1:1 against
    // GOVERNED_TAXONOMY_CODES / TAXONOMY_TYPE_REGISTRY.
    const FIXTURE_SQL = `
      -- Backfill ProductTaxonomyValue.type from legacy fashion.* attribute values.
      UPDATE "ProductTaxonomyDefinition" td
      SET "storeId" = td."storeId"
      FROM "AttributeDefinition" d
      WHERE d.code = ANY(ARRAY[
        'fashion.season',
        'fashion.collection',
        'fashion.material',
        'fashion.fit',
        'fashion.pattern',
        'fashion.collar_type',
        'fashion.sleeve_type',
        'fashion.length',
        'fashion.care',
        'fashion.sustainability',
        'fashion.color_family'
      ]);

      UPDATE "ProductTaxonomyDefinition"
      SET "type" = CASE "code"
        WHEN 'fashion.season' THEN 'SEASON'
        WHEN 'fashion.collection' THEN 'COLLECTION'
        WHEN 'fashion.material' THEN 'MATERIAL'
        WHEN 'fashion.fit' THEN 'FIT'
        WHEN 'fashion.pattern' THEN 'PATTERN'
        WHEN 'fashion.collar_type' THEN 'COLLAR'
        WHEN 'fashion.sleeve_type' THEN 'SLEEVE'
        WHEN 'fashion.length' THEN 'LENGTH'
        WHEN 'fashion.care' THEN 'CARE_LABEL'
        WHEN 'fashion.sustainability' THEN 'SUSTAINABILITY_LABEL'
        WHEN 'fashion.color_family' THEN 'COLOR_FAMILY'
      END;
    `;

    it("extracts the ARRAY[...] code list exactly equal to GOVERNED_TAXONOMY_CODES", () => {
      const parsed = parseGovernedCodesFromMigrationSql(FIXTURE_SQL);
      expect(parsed.codes).toEqual(GOVERNED_TAXONOMY_CODES);
    });

    it("extracts the CASE map with each code pointing to the correct ProductTaxonomyType", () => {
      const parsed = parseGovernedCodesFromMigrationSql(FIXTURE_SQL);
      for (const type of PRODUCT_TAXONOMY_TYPES) {
        const code = TAXONOMY_TYPE_REGISTRY[type].definitionCode;
        expect(parsed.caseMap[code]).toBe(type as ProductTaxonomyType);
      }
      expect(Object.keys(parsed.caseMap).length).toBe(GOVERNED_TAXONOMY_CODES.length);
    });

    // T14b: parity against the REAL immutable migration file (not just the fixture above).
    // The migration's hardcoded `d.code = ANY(ARRAY[...])` list and `CASE "code" WHEN ...
    // THEN ... END` type map must equal GOVERNED_TAXONOMY_CODES / TAXONOMY_TYPE_REGISTRY
    // exactly (order included) — this is what keeps the backfill migration's hardcoded
    // governed-code list from silently drifting away from the single-authority registry.
    it("T14b: parity against real 20260801140000 migration.sql", () => {
      const sql = readFileSync(realMigrationPath, "utf8");
      const parsed = parseGovernedCodesFromMigrationSql(sql);

      expect(parsed.codes).toEqual(GOVERNED_TAXONOMY_CODES);

      for (const type of PRODUCT_TAXONOMY_TYPES) {
        const code = TAXONOMY_TYPE_REGISTRY[type].definitionCode;
        expect(parsed.caseMap[code]).toBe(type as ProductTaxonomyType);
      }
      expect(Object.keys(parsed.caseMap).length).toBe(GOVERNED_TAXONOMY_CODES.length);
    });
  });
});
