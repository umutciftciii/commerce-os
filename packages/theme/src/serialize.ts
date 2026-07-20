import {
  THEME_SCHEMA_VERSION,
  validateThemeDocument,
  type ThemeDocument,
} from "./schema.js";
import { collectResolutionErrors } from "./resolve.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Theme Import / Export (ADR-087)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tema tamamen JSON tabanlıdır. Export bir zarf (envelope) üretir:
 * `{ format, schemaVersion, exportedAt?, document }`. Import zarfı/ham belgeyi
 * kabul eder, `schemaVersion` migrasyonunu uygular, şemayı doğrular ve
 * referans bütünlüğünü (çözülemeyen/döngü) denetler.
 */

export const THEME_EXPORT_FORMAT = "commerce-os/theme" as const;

export interface ThemeExportEnvelope {
  format: typeof THEME_EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt?: string;
  document: ThemeDocument;
}

/** Belgeyi taşınabilir zarfa sarar. `exportedAt` çağıran tarafından verilir. */
export function exportThemeEnvelope(
  document: ThemeDocument,
  exportedAt?: string,
): ThemeExportEnvelope {
  return {
    format: THEME_EXPORT_FORMAT,
    schemaVersion: document.schemaVersion,
    ...(exportedAt ? { exportedAt } : {}),
    document,
  };
}

/** Zarfı (veya ham belgeyi) biçimli JSON metnine serialize eder. */
export function exportThemeJson(document: ThemeDocument, exportedAt?: string): string {
  return JSON.stringify(exportThemeEnvelope(document, exportedAt), null, 2);
}

/**
 * schemaVersion migrasyon kancası. Şu an tek sürüm (v1) var; ileri sürümlerde
 * buraya kademeli dönüşümler eklenir. Bilinmeyen/gelecek sürüm reddedilir.
 */
export function migrateThemeDocument(raw: unknown): { ok: true; value: unknown } | {
  ok: false;
  error: string;
} {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "belge bir nesne değil" };
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== "number") {
    return { ok: false, error: "schemaVersion eksik veya sayı değil" };
  }
  if (version > THEME_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `desteklenmeyen ileri şema sürümü: ${version} (max ${THEME_SCHEMA_VERSION})`,
    };
  }
  // v1: dönüşüm yok. (İleride: while(version < CURRENT) { ...; version++ })
  return { ok: true, value: raw };
}

export type ThemeImportResult =
  | { ok: true; document: ThemeDocument }
  | { ok: false; errors: string[] };

/**
 * Bir zarfı veya ham belgeyi import eder: migrasyon → şema doğrulama →
 * referans bütünlüğü. Herhangi bir adımda başarısızsa hata listesi döner.
 */
export function importTheme(input: unknown): ThemeImportResult {
  // Zarf mı, ham belge mi?
  let candidate: unknown = input;
  if (
    input &&
    typeof input === "object" &&
    (input as { format?: unknown }).format === THEME_EXPORT_FORMAT &&
    "document" in (input as object)
  ) {
    candidate = (input as { document: unknown }).document;
  }

  const migrated = migrateThemeDocument(candidate);
  if (!migrated.ok) {
    return { ok: false, errors: [migrated.error] };
  }

  const validated = validateThemeDocument(migrated.value);
  if (!validated.ok) {
    return { ok: false, errors: validated.errors };
  }

  const refErrors = collectResolutionErrors(validated.document);
  if (refErrors.length > 0) {
    return { ok: false, errors: refErrors };
  }

  return { ok: true, document: validated.document };
}

/** JSON metnini parse edip import eder. Parse hatası da rapor edilir. */
export function importThemeJson(json: string): ThemeImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`geçersiz JSON: ${message}`] };
  }
  return importTheme(parsed);
}
