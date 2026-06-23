import type { TenantContext } from "@commerce-os/auth";

export function tenantWhere<T extends object>(
  context: TenantContext,
  where: T,
): T & { storeId: string } {
  return {
    ...where,
    storeId: context.storeId,
  };
}
