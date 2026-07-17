"use client";

// Faz 2B (TODO-146) — Kategori-güdümlü attribute metadata hook'u.
//
// Ana kategori (primaryCategoryId) attribute ŞEMASINI sürer: backend değer
// doğrulaması da primaryCategoryId + CategoryAttribute bağına göre yapıldığından
// (Faz 2A service), UI aynı otoriteyi izler. CategoryAttribute serializer'ı
// self-describing olmadığı için tanım/seçenek/grup ayrı çekilip join edilir.
//
// Memoization (TODO-146 md.13): kategori değişmediği sürece YENİDEN istek atılmaz.
// Kategori-bağımsız veriler (tanımlar, gruplar, seçenekler) tek sefer çekilir ve
// kategori değişimlerinde yeniden kullanılır; kategori-attribute join'i kategori
// başına cache'lenir.

import { useEffect, useRef, useState } from "react";
import type {
  AttributeDefinition,
  AttributeGroup,
  AttributeOption,
  CategoryAttribute,
} from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import {
  parseValidationRules,
  type ResolvedAttribute,
  type ResolvedAttributeGroup,
} from "./types";

const GENERAL_GROUP_ID = "__general__";

export interface CategoryAttributesState {
  groups: ResolvedAttributeGroup[];
  attributes: ResolvedAttribute[];
  loading: boolean;
  error: boolean;
}

const EMPTY: CategoryAttributesState = {
  groups: [],
  attributes: [],
  loading: false,
  error: false,
};

interface Caches {
  // Kategori-bağımsız (tek sefer). Promise cache → paralel istekler tekilleşir.
  definitions?: Promise<Map<string, AttributeDefinition>>;
  groups?: Promise<Map<string, AttributeGroup>>;
  // attributeDefinitionId → seçenekler (SELECT/MULTI_SELECT/COLOR).
  options: Map<string, Promise<AttributeOption[]>>;
  // categoryId → çözümlenmiş sonuç.
  resolved: Map<string, ResolvedAttributeGroup[]>;
}

/**
 * Bir ana kategori için ürün-seviyesi (variantDefining olmayan) attribute şemasını
 * çözümler. Varyat attribute'ları bu fazın kapsamı dışıdır ve dışlanır.
 */
export function useCategoryAttributes(
  primaryCategoryId: string | null,
  options?: { groupLabel: string },
): CategoryAttributesState {
  const groupLabel = options?.groupLabel ?? "General Attributes";
  const cachesRef = useRef<Caches>({ options: new Map(), resolved: new Map() });
  const [state, setState] = useState<CategoryAttributesState>(EMPTY);

  useEffect(() => {
    if (!primaryCategoryId) {
      setState(EMPTY);
      return;
    }

    const caches = cachesRef.current;
    const cached = caches.resolved.get(primaryCategoryId);
    if (cached) {
      setState({ groups: cached, attributes: flatten(cached), loading: false, error: false });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: false }));

    void (async () => {
      try {
        const resolved = await resolveCategory(caches, primaryCategoryId, groupLabel);
        caches.resolved.set(primaryCategoryId, resolved);
        if (cancelled) return;
        setState({ groups: resolved, attributes: flatten(resolved), loading: false, error: false });
      } catch {
        if (cancelled) return;
        setState({ groups: [], attributes: [], loading: false, error: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [primaryCategoryId, groupLabel]);

  return state;
}

function flatten(groups: ResolvedAttributeGroup[]): ResolvedAttribute[] {
  return groups.flatMap((group) => group.attributes);
}

async function resolveCategory(
  caches: Caches,
  categoryId: string,
  generalLabel: string,
): Promise<ResolvedAttributeGroup[]> {
  const [links, defMap, groupMap] = await Promise.all([
    storeApi.listCategoryAttributes(categoryId),
    ensureDefinitions(caches),
    ensureGroups(caches),
  ]);

  // Yalnız ürün-seviyesi (variantDefining=false) ve tanımı bulunan/aktif attribute'lar.
  const productLinks = links.data.filter((link: CategoryAttribute) => {
    if (link.variantDefining) return false;
    const def = defMap.get(link.attributeDefinitionId);
    return def !== undefined && def.status === "ACTIVE";
  });

  // Seçenek gerektiren tipler için seçenekleri (cache'li) çek.
  const needsOptions = productLinks.filter((link) => {
    const def = defMap.get(link.attributeDefinitionId)!;
    return def.dataType === "SELECT" || def.dataType === "MULTI_SELECT" || def.dataType === "COLOR";
  });
  const optionLists = await Promise.all(
    needsOptions.map((link) => ensureOptions(caches, link.attributeDefinitionId)),
  );
  const optionsByDef = new Map<string, AttributeOption[]>();
  needsOptions.forEach((link, index) => {
    optionsByDef.set(link.attributeDefinitionId, optionLists[index]!);
  });

  const resolvedAttributes: ResolvedAttribute[] = productLinks.map((link) => {
    const def = defMap.get(link.attributeDefinitionId)!;
    const rawOptions = optionsByDef.get(link.attributeDefinitionId) ?? [];
    return {
      categoryAttributeId: link.id,
      attributeDefinitionId: link.attributeDefinitionId,
      code: def.code,
      name: def.name,
      description: def.description,
      dataType: def.dataType,
      unit: def.unit,
      required: link.required,
      displayOrder: link.displayOrder,
      groupId: link.groupId,
      options: rawOptions
        .filter((option) => option.status === "ACTIVE")
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
        .map((option) => ({
          id: option.id,
          value: option.value,
          label: option.label,
          colorHex: option.colorHex,
        })),
      rules: parseValidationRules(link.validationRules),
    };
  });

  return groupAttributes(resolvedAttributes, groupMap, generalLabel);
}

/**
 * Attribute'ları gruplara böler ve sıralar. Sıralama (TODO-146 md.4/md.6):
 *  - grup içi: displayOrder ASC, sonra name ASC,
 *  - gruplar: "General Attributes" (grupsuz) önce, sonra AttributeGroup.sortOrder
 *    ASC + name ASC.
 */
function groupAttributes(
  attributes: ResolvedAttribute[],
  groupMap: Map<string, AttributeGroup>,
  generalLabel: string,
): ResolvedAttributeGroup[] {
  const buckets = new Map<string, ResolvedAttribute[]>();
  for (const attr of attributes) {
    const key = attr.groupId && groupMap.has(attr.groupId) ? attr.groupId : GENERAL_GROUP_ID;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(attr);
    else buckets.set(key, [attr]);
  }

  const sortAttrs = (list: ResolvedAttribute[]) =>
    [...list].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  const result: ResolvedAttributeGroup[] = [];

  const general = buckets.get(GENERAL_GROUP_ID);
  if (general) {
    result.push({ id: null, name: generalLabel, sortOrder: -1, attributes: sortAttrs(general) });
  }

  const namedGroups = [...buckets.keys()]
    .filter((key) => key !== GENERAL_GROUP_ID)
    .map((key) => groupMap.get(key)!)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  for (const group of namedGroups) {
    result.push({
      id: group.id,
      name: group.name,
      sortOrder: group.sortOrder,
      attributes: sortAttrs(buckets.get(group.id) ?? []),
    });
  }

  return result;
}

function ensureDefinitions(caches: Caches): Promise<Map<string, AttributeDefinition>> {
  if (!caches.definitions) {
    caches.definitions = storeApi
      .listAttributes()
      .then((response) => new Map(response.data.map((def) => [def.id, def])));
  }
  return caches.definitions;
}

function ensureGroups(caches: Caches): Promise<Map<string, AttributeGroup>> {
  if (!caches.groups) {
    caches.groups = storeApi
      .listAttributeGroups()
      .then((response) => new Map(response.data.map((group) => [group.id, group])));
  }
  return caches.groups;
}

function ensureOptions(caches: Caches, attributeId: string): Promise<AttributeOption[]> {
  let promise = caches.options.get(attributeId);
  if (!promise) {
    promise = storeApi.listAttributeOptions(attributeId).then((response) => response.data);
    caches.options.set(attributeId, promise);
  }
  return promise;
}
