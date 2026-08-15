export interface StoreAdminTenantContext {
  storeSlug: string;
}

export interface TenantResolverSource {
  configuredStoreSlug?: string;
  host?: string; // reserved for future subdomain resolver; UNUSED in Phase 1
}

export function resolveStoreAdminTenantContext(
  source: TenantResolverSource,
): StoreAdminTenantContext | null {
  const trimmedSlug = source.configuredStoreSlug?.trim();
  if (!trimmedSlug) {
    return null;
  }

  return { storeSlug: trimmedSlug };
}
