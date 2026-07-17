import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Canli DB entegrasyon testi kosmuyoruz (in-memory DI). Varyant motoru TEMELI (ADR-070)
// migration'inin ADDITIVE + normalize (JSON YOK) oldugunu ve dogru FK politikasini tasidigini
// migration SQL'ini + schema.prisma'yi statik dogrulayarak garanti ederiz.
const here = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(
  resolve(here, "../prisma/migrations/20260717120000_add_product_variant_selection/migration.sql"),
  "utf8",
);
const schema = readFileSync(resolve(here, "../prisma/schema.prisma"), "utf8");

describe("Faz 2C-1 (ADR-070) — migration DDL", () => {
  it("creates the two normalized selection tables", () => {
    expect(migrationSql).toContain('CREATE TABLE "ProductVariantAttribute"');
    expect(migrationSql).toContain('CREATE TABLE "ProductVariantOptionSelection"');
  });

  it("is additive — no ALTER of ProductVariant and no DROP (only CREATE + additive FKs)", () => {
    // ProductVariant tablosuna (optionValues dahil) hicbir ALTER yok; yeni FK'ler yeni tablolarda.
    expect(migrationSql).not.toMatch(/ALTER TABLE "ProductVariant" /);
    expect(migrationSql).not.toContain("DROP ");
    // Yalniz yeni tablolara ait ALTER (FK) satirlari — ikisi de yeni tablolar.
    for (const alter of migrationSql.match(/ALTER TABLE "(\w+)"/g) ?? []) {
      expect(["ProductVariantAttribute", "ProductVariantOptionSelection"]).toContain(
        alter.replace(/ALTER TABLE "|"/g, ""),
      );
    }
  });

  it("uses ON DELETE RESTRICT for definition/option references (usage guard)", () => {
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "ProductVariantAttribute_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT',
    );
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "ProductVariantOptionSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE RESTRICT',
    );
  });

  it("cascades product/store/parent ownership deletes", () => {
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "ProductVariantAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE',
    );
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "ProductVariantOptionSelection_productVariantAttributeId_fkey" FOREIGN KEY ("productVariantAttributeId") REFERENCES "ProductVariantAttribute"("id") ON DELETE CASCADE',
    );
  });

  it("adds the unique indexes (one axis per product; one option per axis)", () => {
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "ProductVariantAttribute_productId_attributeDefinitionId_key"',
    );
    // NOT: Prisma index adini 63-karakter Postgres limitine kirpar (optionId -> opt).
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "ProductVariantOptionSelection_productVariantAttributeId_opt_key"',
    );
  });
});

describe("Faz 2C-1 (ADR-070) — schema.prisma models", () => {
  it("declares the two models", () => {
    expect(schema).toContain("model ProductVariantAttribute {");
    expect(schema).toContain("model ProductVariantOptionSelection {");
  });

  it("keeps definition/option relations as Restrict", () => {
    expect(schema).toMatch(/definition\s+AttributeDefinition\s+@relation\([^)]*onDelete: Restrict/);
    expect(schema).toMatch(/option\s+AttributeOption\s+@relation\([^)]*onDelete: Restrict/);
  });

  it("stores selections relationally, not as JSON", () => {
    // Modelin govdesinde Json tipli kolon olmamali (normalize).
    const model = schema.slice(schema.indexOf("model ProductVariantAttribute {"));
    const body = model.slice(0, model.indexOf("\n}"));
    expect(body).not.toContain("Json");
  });
});
