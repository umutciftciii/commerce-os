import type { PublicSearchFacet } from "@commerce-os/api-client";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { SearchState } from "../../../lib/search/url-state";

/**
 * TODO-156C — Tüm facet renderer'ların ORTAK prop sözleşmesi (registry bunu geçirir).
 *
 * Renderer'lar client'tır; URL güncellemesini `useSearchTransition` üzerinden kendileri yapar (props'ta
 * navigate YOK) → SSR'da provider olmadan da render edilir (fallback no-op). `state` URL'in tek gerçek
 * kaynağıdır; renderer yerel filtre kopyası TUTMAZ (yalnız input taslağı gibi geçici UI state serbesttir).
 */
export interface FacetRendererProps {
  facet: PublicSearchFacet;
  state: SearchState;
  t: StorefrontDictionary;
}
