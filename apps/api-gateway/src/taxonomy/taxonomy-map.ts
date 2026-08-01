// TODO-165A (ADR-165A) — Product Data Governance: taxonomy registry <-> canonical-attributes
// bridge. SAF (DB/IO yok, deterministik). Governed `ProductTaxonomyType` registry'sini
// (`@commerce-os/contracts/product-taxonomy`) mevcut fashion attribute katalogundaki
// (`../fashion/canonical-attributes.ts`) `fashion.*` AttributeDefinition kodlarina baglar.
// YENI bir taksonomi/attribute kaynagi KURULMAZ — bu modul yalniz iki mevcut TEK OTORITE
// arasinda kod<->tip cevirisi + grounding dogrulamasi saglar.
//
// Tuketiciler (bu Task pure logic olarak uretir, servis/route/DB YOK):
//   - T9  taxonomy servisi + ensureStoreTaxonomyDefaults
//   - T10b bootstrap
//   - T14b backfill migration parity testi (packages/db/prisma/migrations/
//     20260801140000_backfill_fashion_taxonomy/migration.sql)
//   - T27/T28 seed
//   - T8 option resolver
//
// `GOVERNED_TAXONOMY_CODES` sirasi PRODUCT_TAXONOMY_TYPES'tan turer (tek otorite, stabil sira).

import {
  PRODUCT_TAXONOMY_TYPES,
  TAXONOMY_TYPE_REGISTRY,
  type ProductTaxonomyType,
} from "@commerce-os/contracts/product-taxonomy";
import { CANONICAL_ATTRIBUTE_CODES } from "../fashion/canonical-attributes.js";

/**
 * Governed `fashion.*` kodlarinin TEK sirali otoritesi — T14b migration'inin
 * hardcode ettigi `d.code = ANY(ARRAY[...])` listesi ve T9/T14b bootstrap'in
 * iterate ettigi liste ile birebir ayni olmalidir (bkz. parseGovernedCodesFromMigrationSql
 * parity testi).
 */
export const GOVERNED_TAXONOMY_CODES: string[] = PRODUCT_TAXONOMY_TYPES.map(
  (type) => TAXONOMY_TYPE_REGISTRY[type].definitionCode,
);

// Grounding guard: her definitionCode canonical-attributes.ts kataloğunda GERCEKTEN var
// olmali. Registry'ye yeni bir tip eklenip katalogda karsiligi unutulursa modul yukleme
// aninda (import-time) yuksek sesle patlar — sessiz drift yerine erken hata.
const CANONICAL_CODE_SET: ReadonlySet<string> = new Set(CANONICAL_ATTRIBUTE_CODES);
for (const type of PRODUCT_TAXONOMY_TYPES) {
  const code = TAXONOMY_TYPE_REGISTRY[type].definitionCode;
  if (!CANONICAL_CODE_SET.has(code)) {
    throw new Error(
      `taxonomy-map: ProductTaxonomyType "${type}" declares definitionCode "${code}" which ` +
        `does not exist in canonical-attributes.ts (CANONICAL_ATTRIBUTE_CODES). ` +
        `Every governed taxonomy type must be grounded in the fashion attribute catalog.`,
    );
  }
}

const CODE_TO_TYPE: ReadonlyMap<string, ProductTaxonomyType> = new Map(
  PRODUCT_TAXONOMY_TYPES.map((type) => [TAXONOMY_TYPE_REGISTRY[type].definitionCode, type]),
);

/** `fashion.*` kodundan governed `ProductTaxonomyType`'a cozer; governed degilse null. */
export function taxonomyTypeForDefinitionCode(code: string): ProductTaxonomyType | null {
  return CODE_TO_TYPE.get(code) ?? null;
}

/** Governed `ProductTaxonomyType`'dan bagli `fashion.*` AttributeDefinition koduna cozer. */
export function definitionCodeForTaxonomyType(type: ProductTaxonomyType): string {
  return TAXONOMY_TYPE_REGISTRY[type].definitionCode;
}

export interface ParsedMigrationTaxonomy {
  /** `d.code = ANY(ARRAY[...])` icindeki tirnakli kodlar, gorunum sirasiyla. */
  codes: string[];
  /** `CASE "code" WHEN '<code>' THEN '<TYPE>' ... END` eslemesi (kod -> tip string). */
  caseMap: Record<string, string>;
}

/**
 * T14b backfill migration SQL'inden governed kod listesini + CASE code->type
 * esemesini cikarir (saf metin parse, DB baglantisi yok). Migration-parity testinin
 * hem bu Task'taki inline fixture'a hem de T14b'nin gercek migration.sql dosyasina
 * karsi calismasini saglayan tek parser.
 *
 * Beklenen sekiller:
 *   - `... = ANY(ARRAY['fashion.season', 'fashion.collection', ...])`
 *   - `CASE "code" WHEN 'fashion.season' THEN 'SEASON' WHEN ... END` (opsiyonel
 *     tablo/alan prefiksi, ör. `CASE d.code WHEN ...` da desteklenir)
 */
export function parseGovernedCodesFromMigrationSql(sql: string): ParsedMigrationTaxonomy {
  const codes: string[] = [];
  const arrayMatch = sql.match(/ANY\s*\(\s*ARRAY\s*\[([\s\S]*?)\]\s*\)/i);
  if (arrayMatch) {
    const stringLiteralRe = /'([^']*)'/g;
    let m: RegExpExecArray | null;
    while ((m = stringLiteralRe.exec(arrayMatch[1])) !== null) {
      codes.push(m[1]);
    }
  }

  const caseMap: Record<string, string> = {};
  const caseMatch = sql.match(/CASE\s+(?:\w+\.)?"?code"?\s+([\s\S]*?)\bEND\b/i);
  if (caseMatch) {
    const whenThenRe = /WHEN\s*'([^']*)'\s*THEN\s*'([^']*)'/gi;
    let wm: RegExpExecArray | null;
    while ((wm = whenThenRe.exec(caseMatch[1])) !== null) {
      caseMap[wm[1]] = wm[2];
    }
  }

  return { codes, caseMap };
}
