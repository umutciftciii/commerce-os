import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Bu repoda canli DB entegrasyon testi kosmuyor (in-memory DI deseni). CHECK constraint
// ve MULTI_SELECT junction'inin DDL'de gercekten mevcut oldugunu, migration SQL'ini ve
// schema.prisma'yi statik olarak dogrulayarak garanti ederiz (ADR-068).
const here = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(
  resolve(here, "../prisma/migrations/20260714130000_add_product_attribute_values/migration.sql"),
  "utf8",
);
const schema = readFileSync(resolve(here, "../prisma/schema.prisma"), "utf8");

describe("Faz 2A (ADR-068) — migration DDL", () => {
  it("creates the three value tables", () => {
    expect(migrationSql).toContain('CREATE TABLE "ProductAttributeValue"');
    expect(migrationSql).toContain('CREATE TABLE "VariantAttributeValue"');
    expect(migrationSql).toContain('CREATE TABLE "ProductAttributeValueOption"');
  });

  it("adds a CHECK constraint limiting ProductAttributeValue to at most one value column", () => {
    expect(migrationSql).toContain('CONSTRAINT "ProductAttributeValue_single_value_check" CHECK');
    // Tum 7 deger kolonu CHECK ifadesinde sayilmali.
    for (const col of [
      "valueText",
      "valueInteger",
      "valueDecimal",
      "valueBoolean",
      "valueDate",
      "optionId",
      "mediaId",
    ]) {
      expect(migrationSql).toContain(`"${col}" IS NOT NULL`);
    }
    expect(migrationSql).toMatch(/\)\s*<=\s*1/);
  });

  it("adds a CHECK constraint for VariantAttributeValue (valueText XOR optionId)", () => {
    expect(migrationSql).toContain('CONSTRAINT "VariantAttributeValue_single_value_check" CHECK');
  });

  it("uses ON DELETE RESTRICT for definition/option/media references (usage guard)", () => {
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "ProductAttributeValue_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT',
    );
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "ProductAttributeValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE RESTRICT',
    );
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "ProductAttributeValue_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT',
    );
  });

  it("cascades product/variant/store ownership deletes", () => {
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "ProductAttributeValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE',
    );
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "VariantAttributeValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE',
    );
  });

  it("adds the unique + junction indexes", () => {
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "ProductAttributeValue_productId_attributeDefinitionId_key"',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "VariantAttributeValue_variantId_attributeDefinitionId_key"',
    );
    // NOT: Prisma index adini 63-karakter Postgres limitine kirpar (optionId -> optionI).
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "ProductAttributeValueOption_productAttributeValueId_optionI_key"',
    );
  });
});

describe("Faz 2A (ADR-068) — schema.prisma models", () => {
  it("declares the three models", () => {
    expect(schema).toContain("model ProductAttributeValue {");
    expect(schema).toContain("model VariantAttributeValue {");
    expect(schema).toContain("model ProductAttributeValueOption {");
  });

  it("keeps definition/option/media relations as Restrict", () => {
    expect(schema).toMatch(
      /definition\s+AttributeDefinition\s+@relation\([^)]*onDelete: Restrict/,
    );
  });
});
