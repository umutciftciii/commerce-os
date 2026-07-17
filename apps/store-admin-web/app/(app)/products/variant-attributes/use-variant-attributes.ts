"use client";

// Faz 2C-1 (ADR-070) — Kategori-güdümlü VARYANT eksen metadata hook'u.
//
// `useCategoryAttributes` (Faz 2B) yalnız ürün-seviyesi (variantDefining=false) attribute'ları
// döndürür ve varyant-defining olanları DIŞLAR. Bu hook onun aynasıdır: aynı ana kategori
// (primaryCategoryId) için YALNIZ variantDefining=true + option-tabanlı (SELECT/COLOR) + ACTIVE
// attribute'ları çözümler. CategoryAttribute serializer'ı self-describing olmadığından tanım +
// seçenek uçları ayrı çekilip client-side join edilir.
//
// Memoization: kategori değişmediği sürece yeniden istek atılmaz (kategori-bağımsız tanımlar tek
// sefer; kategori-attribute join'i kategori başına cache). KOMBINASYON URETMEZ.

import { useEffect, useRef, useState } from "react";
import type {
  AttributeDefinition,
  AttributeOption,
  CategoryAttribute,
} from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import type { ResolvedVariantAttribute, VariantAttributesState } from "./types";

const EMPTY: VariantAttributesState = { attributes: [], loading: false, error: false };

// Yalnız option-tabanlı (tek-seçimli) tipler eksen olabilir — ADR-070.
function isOptionBased(dataType: AttributeDefinition["dataType"]): boolean {
  return dataType === "SELECT" || dataType === "COLOR";
}

interface Caches {
  definitions?: Promise<Map<string, AttributeDefinition>>;
  options: Map<string, Promise<AttributeOption[]>>;
  resolved: Map<string, ResolvedVariantAttribute[]>;
}

export function useVariantAttributes(primaryCategoryId: string | null): VariantAttributesState {
  const cachesRef = useRef<Caches>({ options: new Map(), resolved: new Map() });
  const [state, setState] = useState<VariantAttributesState>(EMPTY);

  useEffect(() => {
    if (!primaryCategoryId) {
      setState(EMPTY);
      return;
    }

    const caches = cachesRef.current;
    const cached = caches.resolved.get(primaryCategoryId);
    if (cached) {
      setState({ attributes: cached, loading: false, error: false });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: false }));

    void (async () => {
      try {
        const resolved = await resolveCategory(caches, primaryCategoryId);
        caches.resolved.set(primaryCategoryId, resolved);
        if (cancelled) return;
        setState({ attributes: resolved, loading: false, error: false });
      } catch {
        if (cancelled) return;
        setState({ attributes: [], loading: false, error: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [primaryCategoryId]);

  return state;
}

async function resolveCategory(
  caches: Caches,
  categoryId: string,
): Promise<ResolvedVariantAttribute[]> {
  const [links, defMap] = await Promise.all([
    storeApi.listCategoryAttributes(categoryId),
    ensureDefinitions(caches),
  ]);

  // Yalnız variantDefining=true + option-tabanlı + tanımı bulunan/aktif attribute'lar.
  const variantLinks = links.data.filter((link: CategoryAttribute) => {
    if (!link.variantDefining) return false;
    const def = defMap.get(link.attributeDefinitionId);
    return def !== undefined && def.status === "ACTIVE" && isOptionBased(def.dataType);
  });

  const optionLists = await Promise.all(
    variantLinks.map((link) => ensureOptions(caches, link.attributeDefinitionId)),
  );

  const resolved: ResolvedVariantAttribute[] = variantLinks.map((link, index) => {
    const def = defMap.get(link.attributeDefinitionId)!;
    return {
      categoryAttributeId: link.id,
      attributeDefinitionId: link.attributeDefinitionId,
      code: def.code,
      name: def.name,
      dataType: def.dataType,
      displayOrder: link.displayOrder,
      options: (optionLists[index] ?? [])
        .filter((option) => option.status === "ACTIVE")
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
        .map((option) => ({
          id: option.id,
          value: option.value,
          label: option.label,
          colorHex: option.colorHex,
        })),
    };
  });

  return resolved.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

function ensureDefinitions(caches: Caches): Promise<Map<string, AttributeDefinition>> {
  if (!caches.definitions) {
    caches.definitions = storeApi
      .listAttributes()
      .then((response) => new Map(response.data.map((def) => [def.id, def])));
  }
  return caches.definitions;
}

function ensureOptions(caches: Caches, attributeId: string): Promise<AttributeOption[]> {
  let promise = caches.options.get(attributeId);
  if (!promise) {
    promise = storeApi.listAttributeOptions(attributeId).then((response) => response.data);
    caches.options.set(attributeId, promise);
  }
  return promise;
}
