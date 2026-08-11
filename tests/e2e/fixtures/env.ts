export function envUrl(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v.replace(/\/$/, "") : fallback;
}
export function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`[e2e] Required env ${name} is not set (no silent fallback allowed).`);
  return v;
}
export const STOREFRONT_URL = envUrl("E2E_STOREFRONT_URL", "http://localhost:3100");
export const GATEWAY_URL = envUrl("E2E_GATEWAY_URL", "http://localhost:4000");
export const STORE_ADMIN_URL = envUrl("E2E_STORE_ADMIN_URL", "http://localhost:3002");
// TODO-178 Faz F — Platform Admin (admin-web) global konsolu. Store→Platform talep sisteminin
// platform yüzeyi burada; store-admin ile birlikte gerçek cross-app regression'ı kurar.
// Lokal host `pnpm e2e:platform-admin` :3120; CI `admin-web-e2e` servisi :3120.
export const PLATFORM_ADMIN_URL = envUrl("E2E_PLATFORM_ADMIN_URL", "http://localhost:3120");
