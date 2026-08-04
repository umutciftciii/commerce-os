/**
 * F3B.3 / ADR-271 — `next` yönlendirme parametresi güvenliği (open-redirect savunması).
 * Yalnızca uygulama-içi mutlak relative yollara izin verilir; aksi halde güvenli
 * varsayılana (`fallback`) düşer. @commerce-os/config `safeReturnTo` ile AYNI kurallar
 * (storefront app-yerel; bundle'a zod taşımaz):
 *   - tek "/" ile başlamalı; "//" (protocol-relative) reddedilir
 *   - "\\" (backslash tricks), kontrol karakteri reddedilir
 *   - decode sonrası scheme ("://") reddedilir
 *   - /auth (login/logout/register) döngü yolları reddedilir
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const BLOCKED_PREFIXES = ["/auth"];

export function safeNextPath(value: string | undefined | null, fallback = "/account"): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (trimmed === "") return fallback;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("\\")) return fallback;
  if (CONTROL_CHARS.test(trimmed)) return fallback;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return fallback;
  }
  if (CONTROL_CHARS.test(decoded)) return fallback;
  if (decoded.startsWith("//") || decoded.includes("://") || decoded.includes("\\")) {
    return fallback;
  }
  const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  for (const prefix of BLOCKED_PREFIXES) {
    if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)) return fallback;
  }
  return trimmed;
}
