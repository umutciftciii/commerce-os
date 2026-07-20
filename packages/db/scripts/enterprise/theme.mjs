/**
 * TODO-158B (ADR-087) — Enterprise Demo Theme Engine içeriği.
 *
 * Deterministik + idempotent (sabit id'ler; wipe+recreate). Theme Studio ilk
 * açıldığında DOLU gelsin diye:
 *   - 1 PUBLISHED "Varsayılan" tema (v1 PUBLISHED = paketlenmiş varsayılan belge,
 *     v2 DRAFT = düzenlemeye devam kopyası) → vitrin bunu kullanır (globals.css
 *     ile birebir parite, geriye-uyumlu).
 *   - 10 preset teması (DRAFT) → tek tıkla yayınlanabilir hazır seçenekler.
 *
 * Belge içeriği @commerce-os/theme'den gelir (TEK otorite). storeId denormalize
 * tenant sütunu tüm satırlarda enterprise-demo (edm-store).
 */
import { DEFAULT_THEME_DOCUMENT, THEME_PRESETS } from "@commerce-os/theme";
import { STORE_ID } from "./constants.mjs";

function withName(document, name) {
  return { ...document, meta: { ...document.meta, name } };
}

export function buildThemeData() {
  const publishedAt = new Date("2026-07-20T12:00:00.000Z");
  const themes = [];
  const versions = [];

  // ── Yayınlanmış varsayılan tema (aktif) ────────────────────────────────────
  const defaultDoc = withName(DEFAULT_THEME_DOCUMENT, "Varsayılan");
  themes.push({
    id: "edm-theme-default",
    storeId: STORE_ID,
    name: "Varsayılan",
    description: "Editöryel lüks — paketlenmiş varsayılan tema (vitrin varsayılanı).",
    status: "PUBLISHED",
    source: "default",
  });
  versions.push({
    id: "edm-thver-default-1",
    themeId: "edm-theme-default",
    storeId: STORE_ID,
    version: 1,
    status: "PUBLISHED",
    schemaVersion: defaultDoc.schemaVersion,
    label: "seed",
    notes: "Enterprise demo başlangıç yayını.",
    document: defaultDoc,
    publishedAt,
  });
  versions.push({
    id: "edm-thver-default-2",
    themeId: "edm-theme-default",
    storeId: STORE_ID,
    version: 2,
    status: "DRAFT",
    schemaVersion: defaultDoc.schemaVersion,
    label: null,
    notes: null,
    document: defaultDoc,
    publishedAt: null,
  });

  // ── 10 preset teması (DRAFT) ────────────────────────────────────────────────
  for (const preset of THEME_PRESETS) {
    const themeId = `edm-theme-${preset.id}`;
    themes.push({
      id: themeId,
      storeId: STORE_ID,
      name: preset.name,
      description: preset.description,
      status: "DRAFT",
      source: preset.id,
    });
    versions.push({
      id: `edm-thver-${preset.id}-1`,
      themeId,
      storeId: STORE_ID,
      version: 1,
      status: "DRAFT",
      schemaVersion: preset.document.schemaVersion,
      label: null,
      notes: null,
      document: withName(preset.document, preset.name),
      publishedAt: null,
    });
  }

  return { themes, versions };
}
