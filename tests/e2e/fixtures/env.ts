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
