/**
 * ADR-271 — Güvenli same-origin returnTo (open-redirect savunması). @commerce-os/config
 * `safeReturnTo` ile AYNI kurallar; admin-web @commerce-os/config'e bağımlı olmadığı
 * için app-yerel kopya (istemci bundle'ında zod taşımaz).
 *
 * Yalnız tek "/" ile başlayan relative path kabul edilir; "//", "\\", scheme,
 * kontrol karakteri, ve /login döngü yolları reddedilir → `fallback`.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const BLOCKED_PREFIXES = ["/login"];

export function safeInternalPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (value === "") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (CONTROL_CHARS.test(value)) return fallback;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (CONTROL_CHARS.test(decoded)) return fallback;
  if (decoded.startsWith("//") || decoded.includes("://") || decoded.includes("\\")) {
    return fallback;
  }
  const pathOnly = value.split(/[?#]/, 1)[0] ?? value;
  for (const prefix of BLOCKED_PREFIXES) {
    if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)) return fallback;
  }
  return value;
}
