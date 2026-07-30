import { z } from "zod";
import { COLOR_PALETTE_IDS } from "./color-palettes.js";
import { FONT_PRESET_IDS, getFontPreset } from "./font-library.js";
import { LAYOUT_PRESET_KEYS } from "./layout-presets.js";
import type { ThemeDocument } from "./schema.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Store Override Policy — server-side enforcement (TODO-164B · ADR-233)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Platform Admin bir temayı mağazaya atarken, mağazanın HANGİ alanları
 * değiştirebileceğini tanımlar (editable/locked/inherited/required/hidden) + izin
 * verilen font/palet/düzen listelerini belirler. Store Admin (Brand Customizer)
 * yalnız `editable`/`required` alanları değiştirebilir.
 *
 * GÜVENLİK INVARIANT'I: Client gizlemesi YETKİ SAYILMAZ. Bu modül gateway'de
 * save/publish anında `enforceOverridePolicy` ile SERVER-SIDE uygulanır; locked
 * alanı API ile değiştirmeye çalışan istek `THEME_FIELD_LOCKED` ile reddedilir.
 *
 * Geriye uyum: Mevcut mağaza temalarında policy yoksa `defaultOverridePolicy()`
 * = HER alan editable (mevcut davranış korunur). Platform template'lerinde
 * (`ownerScope=PLATFORM`) policy EXPLICIT olmak zorundadır (`isPolicyExplicit`);
 * aksi halde publish `THEME_POLICY_INCOMPLETE` ile reddedilir.
 *
 * SAF modül — DOM/IO yok.
 */

// ── Canonical alan yolları (tek otorite) ──────────────────────────────────────
export const CANONICAL_FIELD_PATHS = [
  // Marka kimliği (logo/favicon otoritesi StoreSettings — bkz. enforce changedAssets)
  "brand.logo",
  "brand.favicon",
  "brand.primaryColor",
  "brand.accentColor",
  // Renkler
  "color.background",
  "color.surface",
  "color.surfaceMuted",
  "color.textPrimary",
  "color.textSecondary",
  "color.border",
  "color.link",
  "color.success",
  "color.warning",
  "color.error",
  "color.focus",
  // Tipografi
  "typography.headingFont",
  "typography.bodyFont",
  "typography.baseSize",
  // Slot / yapı (çoğunlukla platform-locked)
  "slot.header",
  "slot.footer",
  "slot.productCard",
  "slot.productDetailLayout",
  "slot.productListingLayout",
  "slot.hero",
  "slot.homeSectionFrame",
  "responsive.mobileNavigation",
  "layoutPreset",
] as const;

export type CanonicalFieldPath = (typeof CANONICAL_FIELD_PATHS)[number];

const CANONICAL_FIELD_SET = new Set<string>(CANONICAL_FIELD_PATHS);

export function isCanonicalFieldPath(value: string): value is CanonicalFieldPath {
  return CANONICAL_FIELD_SET.has(value);
}

// ── Field policy ───────────────────────────────────────────────────────────────
export const FIELD_POLICIES = ["editable", "locked", "inherited", "required", "hidden"] as const;
export type FieldPolicy = (typeof FIELD_POLICIES)[number];

/** Store Admin bu policy ile alanı değiştirebilir mi? */
export function isEditablePolicy(policy: FieldPolicy): boolean {
  return policy === "editable" || policy === "required";
}

export interface StoreOverridePolicy {
  fields: Partial<Record<CanonicalFieldPath, FieldPolicy>>;
  /** İzinli font preset id'leri (boş = hepsi). */
  allowedFonts: string[];
  /** İzinli palet id'leri (boş = hepsi) — katalog kısıtı. */
  allowedPalettes: string[];
  /** İzinli layout preset key'leri (boş = hepsi). */
  allowedLayoutPresets: string[];
}

/** Geriye uyumlu varsayılan: HER alan editable, tüm font/palet/düzen serbest. */
export function defaultOverridePolicy(): StoreOverridePolicy {
  const fields: Partial<Record<CanonicalFieldPath, FieldPolicy>> = {};
  for (const path of CANONICAL_FIELD_PATHS) fields[path] = "editable";
  return { fields, allowedFonts: [], allowedPalettes: [], allowedLayoutPresets: [] };
}

/** Platform template'i için: her canonical alan explicit tanımlı mı? */
export function isPolicyExplicit(policy: StoreOverridePolicy): boolean {
  return CANONICAL_FIELD_PATHS.every((path) => policy.fields[path] !== undefined);
}

/** Explicit olmayan (tanımsız) alan yollarını döndürür (hata mesajı için). */
export function missingPolicyFields(policy: StoreOverridePolicy): CanonicalFieldPath[] {
  return CANONICAL_FIELD_PATHS.filter((path) => policy.fields[path] === undefined);
}

/** Bir alanın efektif policy'si (tanımsız → editable, geriye uyum). */
export function fieldPolicy(policy: StoreOverridePolicy, path: CanonicalFieldPath): FieldPolicy {
  return policy.fields[path] ?? "editable";
}

export function isFieldEditable(policy: StoreOverridePolicy, path: CanonicalFieldPath): boolean {
  return isEditablePolicy(fieldPolicy(policy, path));
}

// ── Zod şeması (strict/bounded) ────────────────────────────────────────────────
const fieldPolicySchema = z.enum(FIELD_POLICIES);
const canonicalPathSchema = z.enum(CANONICAL_FIELD_PATHS);

export const storeOverridePolicySchema = z
  .object({
    fields: z.record(canonicalPathSchema, fieldPolicySchema).default({}),
    allowedFonts: z.array(z.string().min(1).max(64)).max(64).default([]),
    allowedPalettes: z.array(z.string().min(1).max(64)).max(64).default([]),
    allowedLayoutPresets: z.array(z.string().min(1).max(64)).max(64).default([]),
  })
  .strict();

export type StoreOverridePolicyValidation =
  | { ok: true; policy: StoreOverridePolicy }
  | { ok: false; errors: string[] };

export function validateOverridePolicy(input: unknown): StoreOverridePolicyValidation {
  const parsed = storeOverridePolicySchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  return {
    ok: true,
    policy: {
      fields: parsed.data.fields as Partial<Record<CanonicalFieldPath, FieldPolicy>>,
      allowedFonts: parsed.data.allowedFonts,
      allowedPalettes: parsed.data.allowedPalettes,
      allowedLayoutPresets: parsed.data.allowedLayoutPresets,
    },
  };
}

/** Runtime güvenli parse: geçersiz/eksik → varsayılan (geriye uyum, all editable). */
export function parseOverridePolicy(input: unknown): StoreOverridePolicy {
  if (input == null) return defaultOverridePolicy();
  const parsed = validateOverridePolicy(input);
  return parsed.ok ? parsed.policy : defaultOverridePolicy();
}

// ── Alan değerlerini belge/config'ten çöz (diff için) ──────────────────────────
export interface PolicyConfigView {
  layoutPreset?: string;
  slots?: Record<string, string | undefined>;
  slotVariants?: Record<string, string | undefined>;
}

export interface PolicyThemeState {
  document: ThemeDocument;
  config: PolicyConfigView;
}

function tok(doc: ThemeDocument, group: string, key: string): string | undefined {
  const bag = (doc.tokens as unknown as Record<string, Record<string, unknown>>)[group];
  const raw = bag?.[key];
  return typeof raw === "string" ? raw : undefined;
}

function slotValue(config: PolicyConfigView, slot: string): string | undefined {
  return config.slotVariants?.[slot] ?? config.slots?.[slot];
}

/**
 * Bir canonical alanın karşılaştırılabilir string değerini çıkarır. logo/favicon
 * belge/config'te DEĞİL (StoreSettings otoritesi) → undefined döner; onların
 * değişimi `enforce`'a `changedAssetFields` ile ayrıca bildirilir.
 */
export function resolveFieldValue(state: PolicyThemeState, path: CanonicalFieldPath): string | undefined {
  const { document: doc, config } = state;
  switch (path) {
    case "brand.logo":
    case "brand.favicon":
      return undefined;
    case "brand.primaryColor":
      return tok(doc, "brand", "primary");
    case "brand.accentColor":
      return tok(doc, "brand", "accent");
    case "color.background":
      return tok(doc, "surface", "background");
    case "color.surface":
      return tok(doc, "surface", "surface");
    case "color.surfaceMuted":
      return tok(doc, "surface", "surfaceMuted");
    case "color.textPrimary":
      return tok(doc, "text", "primary");
    case "color.textSecondary":
      return tok(doc, "text", "secondary");
    case "color.border":
      return tok(doc, "border", "default");
    case "color.link":
      return tok(doc, "text", "link");
    case "color.success":
      return tok(doc, "feedback", "success");
    case "color.warning":
      return tok(doc, "feedback", "warning");
    case "color.error":
      return tok(doc, "feedback", "error");
    case "color.focus":
      return tok(doc, "border", "focus");
    case "typography.headingFont":
      return tok(doc, "typography", "headingFont");
    case "typography.bodyFont":
      return tok(doc, "typography", "bodyFont");
    case "typography.baseSize":
      return tok(doc, "typography", "baseSize");
    case "slot.header":
      return slotValue(config, "header");
    case "slot.footer":
      return slotValue(config, "footer");
    case "slot.productCard":
      return slotValue(config, "productCard");
    case "slot.productDetailLayout":
      return slotValue(config, "productDetailLayout");
    case "slot.productListingLayout":
      return slotValue(config, "productListingLayout");
    case "slot.hero":
      return slotValue(config, "hero");
    case "slot.homeSectionFrame":
      return slotValue(config, "homeSectionFrame");
    case "responsive.mobileNavigation":
      return slotValue(config, "mobileNavigation");
    case "layoutPreset":
      return config.layoutPreset;
    default:
      return undefined;
  }
}

// ── Allowlist yardımcıları ─────────────────────────────────────────────────────
/** İzinli font preset'lerinin kapsadığı familyId'ler (boş allowlist → sınırsız). */
export function allowedFontFamilies(policy: StoreOverridePolicy): Set<string> | null {
  if (policy.allowedFonts.length === 0) return null; // sınırsız
  const families = new Set<string>();
  for (const presetId of policy.allowedFonts) {
    const preset = getFontPreset(presetId);
    if (preset) {
      families.add(preset.headingFamily);
      families.add(preset.bodyFamily);
    }
  }
  return families;
}

// ── Enforcement ────────────────────────────────────────────────────────────────
export type PolicyViolationCode =
  | "THEME_FIELD_LOCKED"
  | "THEME_FONT_NOT_ALLOWED"
  | "THEME_LAYOUT_NOT_ALLOWED";

export interface PolicyViolation {
  path: CanonicalFieldPath;
  code: PolicyViolationCode;
}

export interface EnforceOverrideInput {
  policy: StoreOverridePolicy;
  prev: PolicyThemeState;
  next: PolicyThemeState;
  /** Belge/config dışı (StoreSettings) değişen alanlar — ör. brand.logo. */
  changedAssetFields?: CanonicalFieldPath[];
}

export interface EnforceOverrideResult {
  ok: boolean;
  violations: PolicyViolation[];
}

/**
 * Store Admin'in yaptığı değişiklikleri override policy'ye göre denetler. Değişen
 * (prev≠next) her canonical alan için:
 *   - editable/required → izinli
 *   - locked/hidden/inherited → THEME_FIELD_LOCKED
 * Ayrıca: layoutPreset değiştiyse allowedLayoutPresets dışı → THEME_LAYOUT_NOT_ALLOWED;
 * heading/bodyFont değiştiyse allowedFonts kapsamı dışı → THEME_FONT_NOT_ALLOWED.
 * (allowedPalettes = katalog kısıtı; renkler editable ise burada gate EDİLMEZ.)
 *
 * SAF: throw etmez; ihlal listesi döner. Ham değer sızmaz (yalnız path + code).
 */
export function enforceOverridePolicy(input: EnforceOverrideInput): EnforceOverrideResult {
  const { policy, prev, next } = input;
  const violations: PolicyViolation[] = [];
  const changedAssets = new Set<CanonicalFieldPath>(input.changedAssetFields ?? []);
  const allowedFamilies = allowedFontFamilies(policy);

  for (const path of CANONICAL_FIELD_PATHS) {
    const isAsset = path === "brand.logo" || path === "brand.favicon";
    const changed = isAsset
      ? changedAssets.has(path)
      : resolveFieldValue(prev, path) !== resolveFieldValue(next, path);
    if (!changed) continue;

    // 1. Field policy (locked/hidden/inherited → red).
    if (!isFieldEditable(policy, path)) {
      violations.push({ path, code: "THEME_FIELD_LOCKED" });
      continue; // tek alan için tek ihlal yeter
    }

    // 2. Allowlist gate'leri (editable alan bile allowlist dışına çıkamaz).
    if (path === "layoutPreset" && policy.allowedLayoutPresets.length > 0) {
      const value = resolveFieldValue(next, path);
      if (value && !policy.allowedLayoutPresets.includes(value)) {
        violations.push({ path, code: "THEME_LAYOUT_NOT_ALLOWED" });
      }
    } else if (
      (path === "typography.headingFont" || path === "typography.bodyFont") &&
      allowedFamilies !== null
    ) {
      const value = resolveFieldValue(next, path);
      if (value && !allowedFamilies.has(value)) {
        violations.push({ path, code: "THEME_FONT_NOT_ALLOWED" });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

// ── Store Admin bağlamı projeksiyonu (UI locked/hidden gizleme için) ───────────
export interface FieldPolicyProjection {
  editable: CanonicalFieldPath[];
  locked: CanonicalFieldPath[];
  hidden: CanonicalFieldPath[];
}

/** Store Admin UI'ına yansıyacak alan sınıflandırması (client gizleme; server enforce). */
export function projectFieldPolicy(policy: StoreOverridePolicy): FieldPolicyProjection {
  const editable: CanonicalFieldPath[] = [];
  const locked: CanonicalFieldPath[] = [];
  const hidden: CanonicalFieldPath[] = [];
  for (const path of CANONICAL_FIELD_PATHS) {
    const p = fieldPolicy(policy, path);
    if (p === "hidden") hidden.push(path);
    else if (isEditablePolicy(p)) editable.push(path);
    else locked.push(path); // locked | inherited
  }
  return { editable, locked, hidden };
}

/** Bilinen referanslar (validasyon yardımcıları). */
export const KNOWN_FONT_PRESET_IDS = FONT_PRESET_IDS;
export const KNOWN_PALETTE_IDS = COLOR_PALETTE_IDS;
export const KNOWN_LAYOUT_PRESET_KEYS = LAYOUT_PRESET_KEYS;
