"use client";

import type { ReactNode } from "react";
import { resolveFacetKind, type FacetKind } from "../../../lib/search/facets";
import type { FacetRendererProps } from "./types";
import { FacetValueList } from "./facet-value-list";
import { FacetColorSwatch } from "./facet-color-swatch";
import { FacetNumberRange } from "./facet-number-range";
import { FacetDateRange } from "./facet-date-range";

/**
 * TODO-156C (ANALIZ-156A §6.2, brief §1) — FACET RENDERER REGISTRY (veri-güdümlü, switch-case YOK).
 *
 * `resolveFacetKind(facet)` → tek render-türü stringi → registry component'i seçer. Yeni bir attribute
 * tipi/sunumu eklemek için: (a) `resolveFacetKind`'a bir dal, (b) bu registry'ye bir SATIR. PLP/rail/drawer
 * DEĞİŞMEZ. Bilinmeyen tür → `checkbox` fallback (asla patlamaz). Boolean, brief §7 gereği checkbox listesi
 * paylaşır (switch yerine checkbox).
 */
const FACET_RENDERERS: Record<FacetKind, (props: FacetRendererProps) => ReactNode> = {
  checkbox: FacetValueList,
  boolean: FacetValueList,
  color: FacetColorSwatch,
  range: FacetNumberRange,
  date: FacetDateRange,
};

/** Facet'i türüne göre doğru renderer'a yönlendirir (registry lookup; güvenli fallback). */
export function FacetControl(props: FacetRendererProps): ReactNode {
  const kind = resolveFacetKind(props.facet);
  const Renderer = FACET_RENDERERS[kind] ?? FACET_RENDERERS.checkbox;
  return <Renderer {...props} />;
}
