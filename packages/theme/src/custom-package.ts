import { z } from "zod";
import { themeSlotKeySchema, isValidSlotVariant, type ThemeSlotKey } from "./slots.js";
import { layoutPresetKeySchema } from "./layout-presets.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Versioned Custom Theme Package (TODO-164 · ADR-220)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bir mağazaya özel görünüm, çekirdek içinde `if store.slug === …` KOŞULUYLA DEĞİL,
 * versiyonlanmış bir PAKET MANIFEST'i ile sağlanır. Paket YALNIZ izinli presentation
 * slotlarını (variant seçimi) + token preseti override eder; **business logic
 * import etmez**, arbitrary kod taşımaz.
 *
 * Manifest SUNUCU-TARAFINDA doğrulanır (bounded schema). Bilinmeyen slot/variant,
 * uyumsuz themeApiVersion veya DISABLED status reddedilir. Paket registry üzerinden
 * çözülür (theme-registry.ts) — client bir packageKey uydurup override YAPAMAZ.
 *
 * Örnek generic paket: `packages/themes/demo-aurora/manifest.json` (müşteri adı YOK).
 */

export const CUSTOM_PACKAGE_STATUSES = ["ACTIVE", "DEPRECATED", "DISABLED"] as const;
export type CustomPackageStatus = (typeof CUSTOM_PACKAGE_STATUSES)[number];

/**
 * Manifest şeması. `slots` yalnız slot→variant string; asıl variant allowlist'i
 * `validateCustomThemePackage` içinde slot registry'ye karşı denetlenir (şema
 * seviyesinde string kalır, cross-file bağımlılığı sadeleştirir).
 */
export const customThemePackageManifestSchema = z
  .object({
    packageKey: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[a-z][a-z0-9-]*$/, "packageKey küçük harf/rakam/tire olmalı"),
    version: z.number().int().positive(),
    themeApiVersion: z.number().int().positive(),
    minimumCommerceVersion: z.string().regex(/^\d+\.\d+\.\d+$/, "semver x.y.z olmalı"),
    nameTr: z.string().min(1).max(120),
    nameEn: z.string().min(1).max(120),
    status: z.enum(CUSTOM_PACKAGE_STATUSES),
    layoutPreset: layoutPresetKeySchema,
    /** Paketin override ettiği slotlar (allowlist doğrulaması validate'te). */
    supportedSlots: z.array(themeSlotKeySchema).max(32),
    /** slot → variant seçimi (yalnız supportedSlots içinde). */
    slots: z.record(themeSlotKeySchema, z.string()).default({}),
    /** Varsayılan token preset id'si (presets.ts) — opsiyonel. */
    tokenPreset: z.string().max(64).nullish(),
    tokenSchemaVersion: z.number().int().positive(),
  })
  .strict();

export type CustomThemePackageManifest = z.infer<typeof customThemePackageManifestSchema>;

export type CustomPackageValidation =
  | { ok: true; manifest: CustomThemePackageManifest }
  | { ok: false; errors: string[] };

/**
 * Manifest'i doğrular: bounded schema + slot/variant allowlist bütünlüğü.
 *  - Şema başarısız → hata listesi.
 *  - `slots` içindeki her anahtar `supportedSlots`'ta OLMALI ve variant izinli OLMALI.
 * GÜVENLİK: ham değer/regex TAŞINMAZ; yalnız okunabilir hata mesajı.
 */
export function validateCustomThemePackage(input: unknown): CustomPackageValidation {
  const parsed = customThemePackageManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    };
  }
  const m = parsed.data;
  const errors: string[] = [];
  const supported = new Set<ThemeSlotKey>(m.supportedSlots);
  for (const [slot, variant] of Object.entries(m.slots)) {
    if (!supported.has(slot as ThemeSlotKey)) {
      errors.push(`slots.${slot}: supportedSlots dışında`);
      continue;
    }
    if (!isValidSlotVariant(slot, variant)) {
      errors.push(`slots.${slot}: '${variant}' izinli variant değil`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest: m };
}

/**
 * Paketlenmiş generic demo custom theme paketleri. Bunlar `packages/themes/<key>/
 * manifest.json` ile AYNIDIR (kaynak-doğru burasıdır; JSON dosyaları belge/örnek).
 * Registry bunları CUSTOM_PACKAGE kaydı olarak yayınlar.
 */
export const BUNDLED_CUSTOM_PACKAGES: readonly CustomThemePackageManifest[] = [
  {
    packageKey: "demo-aurora",
    version: 1,
    themeApiVersion: 1,
    minimumCommerceVersion: "1.0.0",
    nameTr: "Aurora (Demo Paket)",
    nameEn: "Aurora (Demo Package)",
    status: "ACTIVE",
    layoutPreset: "PREMIUM_BOUTIQUE",
    supportedSlots: ["header", "hero", "productCard", "productDetailLayout"],
    slots: {
      header: "minimal",
      hero: "split",
      productCard: "premium",
      productDetailLayout: "gallery-left",
    },
    tokenPreset: "dark-luxury",
    tokenSchemaVersion: 1,
  },
];

const BUNDLED_BY_KEY: ReadonlyMap<string, CustomThemePackageManifest> = new Map(
  BUNDLED_CUSTOM_PACKAGES.map((m) => [m.packageKey, m]),
);

/** Paketlenmiş custom package manifest'i (yoksa undefined). */
export function getBundledCustomPackage(
  packageKey: string,
): CustomThemePackageManifest | undefined {
  return BUNDLED_BY_KEY.get(packageKey);
}
