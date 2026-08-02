"use client";

import { memo } from "react";
import type { PublicSearchFacet } from "@commerce-os/api-client";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { SearchState } from "../../../lib/search/url-state";
import { facetActiveCount } from "../../../lib/search/facets";
import { FacetSection } from "./facet-section";
import { FacetControl } from "./registry";
import { PriceFacet } from "./price-facet";
import { StockFacet } from "./stock-facet";

/**
 * TODO-156C (ANALIZ-156A §6, brief §15) — Facet listesinin PAYLAŞILAN render'ı (desktop rail + mobil drawer).
 *
 * Tek renderer ilkesi: rail ve drawer bu component'i sarar; kopya YOK. Sıra: Fiyat → Stok → dinamik facet'ler
 * (backend displayOrder). Her facet FacetSection (collapse) + registry FacetControl. `memo` ile facet/state
 * referansı değişmedikçe yeniden render yok (brief §14 performans). Facet yoksa yalnız fiyat/stok gösterilir.
 *
 * TODO-165A (ADR-165A) Task 21 — Sentezlenmiş marka facet'i (code "brand", search-query.ts
 * `synthesizeBrandFacet`, displayOrder -1 → her zaman en önde) bu jenerik `facets` listesinden GEÇER;
 * ayrı bir "marka section"a GEREK YOK çünkü zaten checkbox render'ı (registry → FacetValueList) paylaşır
 * ve `facetActiveCount`/`FacetValueList` marka kodunu tanıyıp DEDICATED `state.brand`'e yazar (bkz.
 * lib/search/facets.ts `nextStateForFacetValueToggle`). Bu dosya bu yüzden değişmedi (additive; mevcut
 * facet render sırası bozulmadı) — kararın gerekçesi burada belgelenir.
 */
export const FacetList = memo(function FacetList({
  facets,
  state,
  currency,
  t,
}: {
  facets: PublicSearchFacet[];
  state: SearchState;
  currency: string;
  t: StorefrontDictionary;
}) {
  const s = t.search;
  return (
    <div className="flex flex-col">
      <FacetSection
        title={s.priceFacetLabel}
        activeCount={state.minPrice !== null || state.maxPrice !== null ? 1 : 0}
      >
        <PriceFacet state={state} currency={currency} t={t} />
      </FacetSection>

      <FacetSection title={s.stockFacetLabel} activeCount={state.inStock ? 1 : 0}>
        <StockFacet state={state} t={t} />
      </FacetSection>

      {facets.map((facet) => (
        <FacetSection key={facet.code} title={facetTitle(facet, t)} activeCount={facetActiveCount(facet, state)}>
          <FacetControl facet={facet} state={state} t={t} />
        </FacetSection>
      ))}
    </div>
  );
});

/**
 * Facet başlığı: ad + (varsa) birim eki, ör. "Ağırlık (g)".
 *
 * TD-170 — Sentezlenmiş marka facet'inin adı sunucuda sabit "Marka" (TR) olarak
 * üretilir (search-query.ts synthesizeBrandFacet). Vitrin bunu locale'den türetir
 * (`brandLabel`: TR "Marka" / EN "Brand"); diğer facet'ler backend adını kullanır.
 */
export function facetTitle(facet: PublicSearchFacet, t: StorefrontDictionary): string {
  if (facet.code === "brand") return t.detail.brandLabel;
  return facet.unit ? `${facet.name} (${facet.unit})` : facet.name;
}
