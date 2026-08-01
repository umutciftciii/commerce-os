// TODO-165A (ADR-165A) — Task 8: fashion option resolution precedence + governed-option
// mutation guard. SAF (DB/IO yok, deterministik). Iki bagimsiz pure fonksiyon uretir:
//
//  - resolveFashionOptions: bir `fashion.*` (governed) AttributeDefinition kodu icin
//    STORE-scoped ACTIVE governed secenekleri + GLOBAL canonical (storeId=null) secenekleri
//    tek bir listeye indirger (store-scoped kazanir, value ile de-dupe). Governed OLMAYAN
//    kodlar icin listeyi DEGISTIRMEDEN doner (bu resolver yalniz fashion.* kapsaminda).
//    Tuketiciler: T22 (urun formu fashion adimi), facet/label render.
//
//  - assertOptionNotGoverned: generic `attributes` option mutation uclarinin (rename/
//    archive/reorder) governed (taxonomyValue baglanmis) bir AttributeOption'i degistirmesini
//    engeller. `ATTRIBUTE_OPTION_GOVERNED` (→ 409) firlatir. Governed secenekler yalniz
//    Task 9'un taxonomy servisi uzerinden yonetilir; generic option ucu bunlara dokunamaz.
//
// Bu modul YENI bir taksonomi/attribute kaynagi KURMAZ — yalniz mevcut iki otoritenin
// (AttributeOption + taxonomy-map.ts governed-kod listesi) uzerinde SAF okuma/karar mantigi.

import { taxonomyTypeForDefinitionCode } from "./taxonomy-map.js";

/** resolveFashionOptions'in isledigi minimum AttributeOption sekli. */
export interface ResolvableFashionOption {
  storeId: string | null;
  value: string;
  sortOrder: number;
  status: "ACTIVE" | "ARCHIVED";
}

/**
 * Bir `definitionCode` icin (yalniz GOVERNED_TAXONOMY_CODES kapsamindaysa) STORE-scoped
 * ACTIVE governed secenekleri + GLOBAL canonical (storeId=null) ACTIVE secenekleri tek
 * listeye indirger.
 *
 * Kurallar:
 *  - `allOptions` TEK bir AttributeDefinition'a ait secenekler kumesidir (cagiran filtreler).
 *  - Store-scoped ACTIVE secenekler ONCE, sirali (sortOrder) gelir.
 *  - Global canonical (storeId=null) ACTIVE secenekler SONRA, sirali (sortOrder) gelir —
 *    yalniz store'un GOVERNED ETMEDIGI (herhangi bir statusteki store-scoped kaydi
 *    OLMAYAN) `value`'lar icin.
 *  - value ile de-dupe: store-scoped kazanir (bir store-scoped kaydi olan value hicbir
 *    zaman global twin ile TEKRAR gorunmez — ARCHIVED store-scoped kayit da bu value'yu
 *    "governed" olarak isaretler, yani global fallback DA gizlenir: "archived = yeni secim
 *    yok", eski global secenegin geri gelmesi degil).
 *  - Governed OLMAYAN `definitionCode` icin: `allOptions` DEGISTIRILMEDEN (filtre/sort
 *    uygulanmadan) doner — bu resolver yalniz fashion.* governed kodlar icin devreye girer.
 */
export function resolveFashionOptions<T extends ResolvableFashionOption>(
  storeId: string,
  definitionCode: string,
  allOptions: readonly T[],
): T[] {
  if (taxonomyTypeForDefinitionCode(definitionCode) === null) {
    return [...allOptions];
  }

  const storeOptions = allOptions.filter((o) => o.storeId === storeId);
  // "Bu store bu value'yu governed ediyor mu?" — status'ten BAGIMSIZ (ARCHIVED dahil):
  // archived bir store-scoped kaydi olan value icin global twin RESURRECT edilmez.
  const governedValues = new Set(storeOptions.map((o) => o.value));

  const storeActive = storeOptions
    .filter((o) => o.status === "ACTIVE")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const globalFallback = allOptions
    .filter((o) => o.storeId === null && o.status === "ACTIVE" && !governedValues.has(o.value))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // value ile de-dupe (store-scoped zaten globalFallback'ten governedValues ile disarida
  // birakildi; burada yalniz ayni grup icinde olasi ikilenmelere karsi savunma).
  const seen = new Set<string>();
  const result: T[] = [];
  for (const option of [...storeActive, ...globalFallback]) {
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    result.push(option);
  }
  return result;
}

/** `assertOptionNotGoverned` firlattiginda tasinan stabil hata kodu. */
export const ATTRIBUTE_OPTION_GOVERNED = "ATTRIBUTE_OPTION_GOVERNED" as const;

export class AttributeOptionGovernedError extends Error {
  readonly code = ATTRIBUTE_OPTION_GOVERNED;
  readonly optionId: string;

  constructor(optionId: string) {
    super(
      `AttributeOption "${optionId}" is governed by a taxonomy value and cannot be mutated via the generic option endpoint.`,
    );
    this.name = "AttributeOptionGovernedError";
    this.optionId = optionId;
  }
}

/** assertOptionNotGoverned'in kabul ettigi minimum sekil: reverse `taxonomyValue` iliskisi. */
export interface GovernanceCheckableOption {
  id: string;
  taxonomyValue?: unknown | null;
}

/**
 * Bir AttributeOption'in reverse `taxonomyValue` iliskisi NON-NULL ise (governed) firlatir.
 * Cagiran, generic option mutasyonundan (rename/archive/reorder) ONCE, `taxonomyValue`
 * iliskisini YUKLENMIS bir option ile cagirmalidir (bkz. attributes/data.ts
 * `findAttributeOptionGovernance`). Governed secenekler yalniz Task 9'un taxonomy servisi
 * uzerinden yonetilir.
 */
export function assertOptionNotGoverned(option: GovernanceCheckableOption): void {
  if (option.taxonomyValue != null) {
    throw new AttributeOptionGovernedError(option.id);
  }
}
