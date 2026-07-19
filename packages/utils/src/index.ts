export {
  formatCampaignAmount,
  getCampaignBadgeText,
  getCampaignPublicLabel,
  getCampaignDiscountText,
  type CampaignLabelInput,
  type CampaignLabelLocale,
} from "./campaign-label.js";

export {
  DEFAULT_VAT_RATE_BPS,
  VAT_RATE_BPS_MAX,
  VAT_RATE_BPS_MIN,
  VAT_RATE_BPS_PRESETS,
  isValidVatRateBps,
  splitGrossByVat,
  vatFromNet,
  type VatBreakdownMinor,
} from "./vat.js";

// TODO-156D (ADR-081) — Slug üretim/normalizasyon motoru (SAF, çerçeve-bağımsız).
export {
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_FALLBACK,
  DEFAULT_RESERVED_SLUGS,
  slugify,
  isCanonicalSlug,
  validateSlug,
  resolveUniqueSlug,
  generateSlug,
  type SlugValidationError,
  type SlugValidationResult,
} from "./slug.js";

// TODO-156D (ADR-082) — Redirect çözümleme motoru (SAF, chain/loop korumalı).
export {
  REDIRECT_TYPES,
  REDIRECT_ENUM_TO_STATUS,
  redirectEnumToStatus,
  normalizeRedirectPath,
  buildRedirectIndex,
  resolveRedirect,
  resolveRedirectFromRules,
  type RedirectType,
  type RedirectRule,
  type RedirectResolution,
} from "./redirect.js";

// TODO-156D tamamlama (ADR-081/082) — Entity → kanonik URL path (gateway yazar + storefront çözer, tek kaynak).
export { productUrlPath, categoryUrlPath } from "./seo-paths.js";

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * TD-038 — Opsiyonel ortam degiskeni (string) okuma yardimcisi. Web app'lerin
 * ISTEK/BOOT zamaninda okudugu opsiyonel env'ler icindir; `packages/config`'in
 * zod-tabanli `optionalEnv` helper'inin duz-string karsiligidir (config'i web
 * bundle'ina tasimadan ayni bos-string toleransini saglar — bkz. ADR-057/TD-036).
 *
 * Kural (config ile ayni): `undefined` / `null` / `""` / yalniz-bosluk → `undefined`.
 * Boylece cagiran taraf `?? default` ile guvenle varsayilana duser ve `KEY=`
 * seklinde bos birakilan bir env degeri varsayilani ARTIK bypass etmez.
 *
 * Bos OLMAYAN deger oldugu gibi (trim EDILMEDEN) dondurulur; cookie adi/secret
 * gibi degerlerde beklenmedik kirpma yapilmaz. Deger secret olabilir; bu helper
 * degeri ASLA loglamaz.
 */
export function optionalEnvString(value: string | undefined | null): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value.trim() === "" ? undefined : value;
}
