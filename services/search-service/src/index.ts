/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Search Read-Model · PUBLIC API.
 *
 * services/search-service, `docs/SERVICE_BOUNDARIES.md` uyarınca arama indeksleme + (ileride) sorgu
 * davranışlarının sahibidir. Bu faz YALNIZ indeksleme temelini içerir: SearchProvider portu +
 * PostgresSearchProvider + deterministik document builder. Public search/facet UÇLARI YOKTUR (Faz B).
 */

import { prisma } from "@commerce-os/db";
import { createPostgresSearchProvider } from "./postgres-provider.js";
import type { SearchProvider } from "./types.js";

export const searchServiceBoundary = {
  name: "search-service",
  owns: ["product-search-read-model", "product-facet-projection", "search-index-jobs"],
} as const;

export * from "./types.js";
export { normalizeText, buildSearchText } from "./normalize.js";
export { buildSearchDocument } from "./document-builder.js";
export { createPrismaSearchDataAccess, type SearchDataAccess } from "./data.js";
export {
  createPostgresSearchProvider,
  type PostgresSearchProviderOptions,
} from "./postgres-provider.js";

/** Paylaşılan singleton prisma ile hazır provider (worker + CLI için kolaylık). */
export function createDefaultSearchProvider(): SearchProvider {
  return createPostgresSearchProvider(prisma);
}
