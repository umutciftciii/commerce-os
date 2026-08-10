/**
 * ADR-289 (TODO-177) §6 — Resolution hierarchy (SAF modul).
 *
 * `(storeId, productId, topic)` → questionSet:
 *   Tier 1 PRODUCT   — store+product explicit mapping
 *   Tier 2 CATEGORY  — primaryCategory agacini KOKE dogru yurur, nearest-first ilk eslesen
 *   Tier 3 DEFAULT   — platform topic default (ZORUNLU; seed garanti eder → dead-end imkansiz)
 *
 * Girdi map'leri servis katmani tarafindan storeId-scoped sorgudan kurulur (bu modul saf kalir).
 * Map anahtari: `${id}:${topic}`. topicDefault eksikse MISSING_TOPIC_DEFAULT firlatir (seed invariant guard).
 */

import type { SupportTopic } from "@prisma/client";

export type ResolutionTier = "PRODUCT" | "CATEGORY" | "DEFAULT";

export interface ResolutionInput {
  topic: SupportTopic;
  productId: string;
  /** primaryCategoryId'den koke: nearest-first sirali ata kategori id'leri. */
  categoryAncestryIds: string[];
  /** `${productId}:${topic}` → questionSetId */
  productMap: Map<string, string>;
  /** `${categoryId}:${topic}` → questionSetId */
  categoryMap: Map<string, string>;
  topicDefault: Map<SupportTopic, string>;
}

export interface ResolutionResult {
  questionSetId: string;
  tier: ResolutionTier;
}

export function resolveQuestionSet(input: ResolutionInput): ResolutionResult {
  const { topic, productId, categoryAncestryIds, productMap, categoryMap, topicDefault } = input;

  const productHit = productMap.get(`${productId}:${topic}`);
  if (productHit) return { questionSetId: productHit, tier: "PRODUCT" };

  for (const categoryId of categoryAncestryIds) {
    const categoryHit = categoryMap.get(`${categoryId}:${topic}`);
    if (categoryHit) return { questionSetId: categoryHit, tier: "CATEGORY" };
  }

  const defaultHit = topicDefault.get(topic);
  if (defaultHit) return { questionSetId: defaultHit, tier: "DEFAULT" };

  throw new Error(`MISSING_TOPIC_DEFAULT:${topic}`);
}
