"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  validateThemeDocument,
  validateColor,
  applyPaletteToDocument,
  listColorPalettes,
  FONT_PRESETS,
  getFontPreset,
  resolveFontPresetStacks,
  FIELD_LABELS,
  type ThemeDocument,
  type CanonicalFieldPath,
  type FontPreset,
} from "@commerce-os/theme";
import type { ThemeSummary, ThemeDetail, ThemePresetSummary } from "@commerce-os/api-client";
import type { Locale } from "@commerce-os/i18n";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import {
  Alert,
  Badge,
  Button,
  Card,
  SectionCard,
  Select,
  Spinner,
  useLocale,
} from "../../../components/ui";
import { ColorField } from "./color-field";

/**
 * TODO-164B (ADR-232/236) — Store Admin "Marka ve Görünüm" (Brand Customizer).
 * Teknik slot/token/config/version alanları KALDIRILDI. Yalnız marka renkleri (renk
 * seçici + hazır paletler + kullanım açıklamaları + kontrast), izinli fontlar (önizleme
 * örnekleriyle), izinli hazır düzen, önizleme ve yayınlama. Platform Admin'in override
 * policy'siyle kilitlenen alanlar gizlenir/pasifleştirilir — server enforcement asıl
 * otoritedir (client gizlemesi yetki değildir).
 */

// Kullanıcı-dostu hazır düzen adları (teknik anahtar gizli).
const LAYOUT_FRIENDLY: Record<string, string> = {
  BASE_COMMERCE: "Sade (varsayılan)",
  FASHION_MINIMAL: "Minimal",
  FASHION_EDITORIAL: "Editoryal",
  MARKETPLACE_DENSE: "Yoğun Katalog",
  PREMIUM_BOUTIQUE: "Premium",
};
const ALL_LAYOUTS = Object.keys(LAYOUT_FRIENDLY);

const VIEWPORTS = [
  { key: "desktop", label: "Masaüstü", width: 1280 },
  { key: "tablet", label: "Tablet", width: 768 },
  { key: "mobile", label: "Mobil", width: 390 },
] as const;

// Kullanıcıya gösterilen renk alanları: canonical yol → belge token konumu + kontrast eşi.
type Grp = "brand" | "surface" | "text" | "border" | "feedback";
interface ColorUi {
  path: CanonicalFieldPath;
  group: Grp;
  key: string;
  /** Kontrast referans alanı (belge token yolu) + eşik. */
  contrast?: { group: Grp; key: string; threshold: number };
}
const COLOR_UI: ColorUi[] = [
  { path: "brand.primaryColor", group: "brand", key: "primary", contrast: { group: "text", key: "inverse", threshold: 3 } },
  { path: "brand.accentColor", group: "brand", key: "accent" },
  { path: "color.background", group: "surface", key: "background", contrast: { group: "text", key: "primary", threshold: 4.5 } },
  { path: "color.surface", group: "surface", key: "surface", contrast: { group: "text", key: "primary", threshold: 4.5 } },
  { path: "color.surfaceMuted", group: "surface", key: "surfaceMuted" },
  { path: "color.textPrimary", group: "text", key: "primary", contrast: { group: "surface", key: "background", threshold: 4.5 } },
  { path: "color.textSecondary", group: "text", key: "secondary", contrast: { group: "surface", key: "background", threshold: 4.5 } },
  { path: "color.border", group: "border", key: "default" },
  { path: "color.link", group: "text", key: "link", contrast: { group: "surface", key: "background", threshold: 4.5 } },
  { path: "color.success", group: "feedback", key: "success" },
  { path: "color.warning", group: "feedback", key: "warning" },
  { path: "color.error", group: "feedback", key: "error" },
  { path: "color.focus", group: "border", key: "focus" },
];

function statusTone(status: string): "success" | "neutral" | "warning" {
  if (status === "PUBLISHED") return "success";
  if (status === "ARCHIVED") return "neutral";
  return "warning";
}

/** Belgede saklı heading/body font'una göre eşleşen font preset id'sini bul (yoksa ""). */
function currentFontPresetId(doc: ThemeDocument | null): string {
  if (!doc) return "";
  const h = String(doc.tokens.typography.headingFont ?? "");
  const b = String(doc.tokens.typography.bodyFont ?? "");
  return FONT_PRESETS.find((p) => p.headingFamily === h && p.bodyFamily === b)?.id ?? "";
}

const STOREFRONT_BASE_URL =
  (process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "").replace(/\/+$/, "") || null;

export function ThemeStudio() {
  const locale = useLocale() as Locale;
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [presets, setPresets] = useState<ThemePresetSummary[]>([]);
  const [detail, setDetail] = useState<ThemeDetail | null>(null);
  const [doc, setDoc] = useState<ThemeDocument | null>(null);
  const [layoutPreset, setLayoutPreset] = useState<string>("BASE_COMMERCE");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState("");
  const [viewport, setViewport] = useState<(typeof VIEWPORTS)[number]["key"]>("desktop");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  // Store admin'in değiştiremeyeceği (locked) slot/config alanları — atama config'inden
  // KORUNUR (reset edilmez → THEME_FIELD_LOCKED tetiklenmez).
  const preservedRef = useRef<{ themeKey: string; slotVariants: Record<string, string> }>({
    themeKey: "BASE_COMMERCE",
    slotVariants: {},
  });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // ── Policy bağlamı (server'dan gelir; null → hepsi editable) ────────────────
  const projection = detail?.fieldPolicyProjection ?? null;
  const policy = detail?.overridePolicy ?? null;
  const hiddenSet = useMemo(() => new Set(projection?.hidden ?? []), [projection]);
  const lockedSet = useMemo(() => new Set(projection?.locked ?? []), [projection]);
  const isHidden = (p: CanonicalFieldPath) => hiddenSet.has(p);
  const isLocked = (p: CanonicalFieldPath) => lockedSet.has(p);
  const allowedFonts = policy?.allowedFonts ?? [];
  const allowedPalettes = policy?.allowedPalettes ?? [];
  const allowedLayouts = policy?.allowedLayoutPresets ?? [];

  const fontOptions: FontPreset[] = useMemo(
    () => (allowedFonts.length > 0 ? FONT_PRESETS.filter((p) => allowedFonts.includes(p.id)) : [...FONT_PRESETS]),
    [allowedFonts],
  );
  const paletteOptions = useMemo(
    () => listColorPalettes().filter((p) => allowedPalettes.length === 0 || allowedPalettes.includes(p.id)),
    [allowedPalettes],
  );
  const layoutOptions = useMemo(
    () => (allowedLayouts.length > 0 ? ALL_LAYOUTS.filter((k) => allowedLayouts.includes(k)) : ALL_LAYOUTS),
    [allowedLayouts],
  );
  const layoutLocked = isLocked("layoutPreset");

  async function refreshList() {
    const list = await storeApi.listThemes();
    setThemes(list.themes);
  }

  useEffect(() => {
    (async () => {
      try {
        const [list, pres] = await Promise.all([storeApi.listThemes(), storeApi.themePresets()]);
        setThemes(list.themes);
        setPresets(pres.presets);
      } catch {
        setError("Temalar yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function run(fn: () => Promise<void>, okMsg?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (okMsg) setNotice(okMsg);
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  const hydratePreserved = (config: unknown) => {
    const c = (config ?? {}) as Record<string, unknown>;
    preservedRef.current = {
      themeKey: typeof c.themeKey === "string" ? c.themeKey : "BASE_COMMERCE",
      slotVariants: { ...((c.slotVariants ?? c.slots ?? {}) as Record<string, string>) },
    };
  };

  const loadDetail = (d: ThemeDetail) => {
    setDetail(d);
    setLayoutPreset(d.layoutPreset ?? "BASE_COMMERCE");
    hydratePreserved(d.draft?.config ?? d.published?.config);
    setIframeUrl(null);
    const source = d.draft?.document ?? d.published?.document;
    const valid = validateThemeDocument(source);
    setDoc(valid.ok ? valid.document : null);
  };

  const openEditor = (themeId: string) =>
    run(async () => {
      loadDetail(await storeApi.getTheme(themeId));
    });

  const closeEditor = () => {
    setDetail(null);
    setDoc(null);
    setNotice(null);
    setError(null);
  };

  const createTheme = () =>
    run(async () => {
      if (!newName.trim()) throw new Error("Tema adı gerekli.");
      const d = await storeApi.createTheme({
        name: newName.trim(),
        ...(newPreset ? { presetId: newPreset } : {}),
      });
      setNewName("");
      setNewPreset("");
      await refreshList();
      loadDetail(d);
    }, "Tema oluşturuldu.");

  // ── Belge güncelleyiciler ────────────────────────────────────────────────────
  const pushRecent = (v: string) =>
    setRecent((prev) => (validateColor(v).ok ? [v, ...prev.filter((c) => c !== v)].slice(0, 8) : prev));

  const setColor = (group: Grp, key: string, value: string) => {
    pushRecent(value);
    setDoc((prev) =>
      prev ? { ...prev, tokens: { ...prev.tokens, [group]: { ...prev.tokens[group], [key]: value } } } : prev,
    );
  };

  const applyPalette = (id: string) =>
    setDoc((prev) => (prev ? applyPaletteToDocument(prev, id) : prev));

  const applyFontPreset = (presetId: string) => {
    const preset = getFontPreset(presetId);
    if (!preset) return;
    setDoc((prev) =>
      prev
        ? {
            ...prev,
            tokens: {
              ...prev.tokens,
              typography: {
                ...prev.tokens.typography,
                headingFont: preset.headingFamily,
                bodyFont: preset.bodyFamily,
              },
            },
          }
        : prev,
    );
  };

  // Kilitli/gizli slot + korunan themeKey ile config (store admin slot düzenlemez;
  // atama config'i KORUNUR → locked slot değişmez).
  const themeConfig = () => ({
    themeKey: preservedRef.current.themeKey,
    layoutPreset,
    slots: {},
    ...(Object.keys(preservedRef.current.slotVariants).length
      ? { slotVariants: preservedRef.current.slotVariants }
      : {}),
  });

  const duplicateTheme = () =>
    run(async () => {
      if (!detail) return;
      const copy = await storeApi.duplicateTheme(detail.id, { name: `${detail.name} (kopya)` });
      await refreshList();
      loadDetail(copy);
    }, "Tema kopyalandı.");

  const archiveTheme = () =>
    run(async () => {
      if (!detail) return;
      await storeApi.archiveTheme(detail.id);
      await refreshList();
      closeEditor();
    }, "Tema arşivlendi.");

  const openLivePreview = () =>
    run(async () => {
      if (!detail) return;
      if (!STOREFRONT_BASE_URL) {
        throw new Error("Vitrin önizleme adresi yapılandırılmadı (NEXT_PUBLIC_STOREFRONT_URL).");
      }
      if (doc) {
        await storeApi.saveThemeDraft(detail.id, {
          document: doc as unknown as Record<string, unknown>,
          config: themeConfig(),
        });
      }
      const { token } = await storeApi.themePreviewToken(detail.id);
      setIframeUrl(`${STOREFRONT_BASE_URL}/?themePreview=${encodeURIComponent(token)}`);
    });

  // Preview highlight: seçili ayarın storefront bölgesini kısa süre vurgula (postMessage).
  const highlight = (path: CanonicalFieldPath) => {
    const target = FIELD_LABELS[path]?.previewTarget;
    if (!target) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "cos-theme-highlight", target },
      STOREFRONT_BASE_URL ?? "*",
    );
  };

  const saveDraft = () =>
    run(async () => {
      if (!detail || !doc) return;
      const d = await storeApi.saveThemeDraft(detail.id, {
        document: doc as unknown as Record<string, unknown>,
        config: themeConfig(),
      });
      loadDetail(d);
      await refreshList();
    }, "Taslak kaydedildi.");

  const publish = () =>
    run(async () => {
      if (!detail) return;
      if (doc) {
        await storeApi.saveThemeDraft(detail.id, {
          document: doc as unknown as Record<string, unknown>,
          config: themeConfig(),
        });
      }
      const d = await storeApi.publishTheme(detail.id, {});
      loadDetail(d);
      await refreshList();
    }, "Görünüm yayınlandı — vitrinde yayında.");

  const removeTheme = (themeId: string) =>
    run(async () => {
      await storeApi.deleteTheme(themeId);
      await refreshList();
    }, "Tema silindi.");

  // Alan-seviyesi renk doğrulama (kaydetmeden önce işaretle; sunucu ikinci savunma).
  const invalidFields = useMemo(() => {
    const set = new Set<string>();
    if (!doc) return set;
    for (const c of COLOR_UI) {
      const value = String(doc.tokens[c.group]?.[c.key] ?? "");
      if (!validateColor(value).ok) set.add(c.path);
    }
    return set;
  }, [doc]);
  const hasErrors = invalidFields.size > 0;

  const activeFontId = currentFontPresetId(doc);
  const fontStacks = activeFontId ? resolveFontPresetStacks(activeFontId) : undefined;

  if (loading) {
    return (
      <SectionCard title="Marka ve Görünüm">
        <Spinner label="Yükleniyor…" />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <Alert tone="error" title="Hata">{error}</Alert> : null}
      {notice ? <Alert tone="success" title="Tamam">{notice}</Alert> : null}

      {!detail ? (
        <>
          <SectionCard
            title="Yeni görünüm"
            description="Mağazanız için bir görünüm oluşturun. İsterseniz hazır bir palet seçin."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-white/50">Görünüm adı</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Örn. Bahar Koleksiyonu"
                  className="w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white/90 outline-none focus:border-white/30"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-white/50">Hazır palet</label>
                <Select
                  value={newPreset}
                  onChange={(e) => setNewPreset(e.target.value)}
                  options={[
                    { value: "", label: "Varsayılan" },
                    ...presets.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>
              <Button onClick={createTheme} disabled={busy}>
                Oluştur
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Görünümler" description="Yalnız bir görünüm yayında olabilir.">
            {themes.length === 0 ? (
              <p className="text-sm text-white/50">Henüz görünüm yok.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {themes.map((t) => (
                  <Card key={t.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white/90">{t.name}</p>
                      <Badge tone={statusTone(t.status)}>
                        {t.status === "PUBLISHED" ? "Yayında" : t.status === "ARCHIVED" ? "Arşiv" : "Taslak"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => openEditor(t.id)} disabled={busy}>
                        Düzenle
                      </Button>
                      {t.status !== "PUBLISHED" ? (
                        <Button size="sm" variant="ghost" onClick={() => removeTheme(t.id)} disabled={busy}>
                          Sil
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      ) : (
        <SectionCard
          title={`Marka ve Görünüm: ${detail.name}`}
          description={detail.status === "PUBLISHED" ? "Yayında" : "Taslak — değişiklikler yayınlanana kadar vitrini etkilemez."}
        >
          {/* Sticky aksiyon çubuğu */}
          <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap gap-2 bg-[#0d0d0f]/80 px-1 py-2 backdrop-blur">
            <Button variant="secondary" size="sm" onClick={closeEditor}>
              ← Geri
            </Button>
            <Button size="sm" onClick={saveDraft} disabled={busy || !doc || hasErrors}>
              Taslağı kaydet
            </Button>
            <Button size="sm" onClick={publish} disabled={busy || hasErrors}>
              Yayınla
            </Button>
            <Button variant="secondary" size="sm" onClick={duplicateTheme} disabled={busy}>
              Kopyala
            </Button>
            {detail.status !== "PUBLISHED" ? (
              <Button variant="ghost" size="sm" onClick={archiveTheme} disabled={busy}>
                Arşivle
              </Button>
            ) : null}
          </div>

          {!doc ? (
            <Alert tone="warning" title="Görünüm düzenlenemiyor">
              Bu görünüm sürümü çözümlenemedi.
            </Alert>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {hasErrors ? (
                <div className="lg:col-span-2">
                  <Alert tone="error" title="Geçersiz renk değeri">
                    Bazı renkler geçerli değil (kırmızı işaretli). Kaydetme ve yayınlama düzeltilene kadar engellenir.
                  </Alert>
                </div>
              ) : null}

              {/* SOL: düzenleme */}
              <div className="space-y-6">
                {/* Marka (logo/görseller — tek otorite Ayarlar > Marka) */}
                <div className="rounded-lg border border-white/10 p-4">
                  <p className="mb-1 text-sm font-semibold text-white/85">Marka</p>
                  <p className="text-[11px] text-white/50">
                    Logo, favicon ve marka görselleri <span className="text-white/70">Ayarlar → Marka</span>{" "}
                    bölümünden yönetilir (tek kaynak). Buradaki renk ve yazı tipi seçimleri vitrin genelinde uygulanır.
                  </p>
                </div>

                {/* Renkler */}
                <div>
                  <p className="mb-2 text-sm font-semibold text-white/85">Renkler</p>
                  {/* Hazır paletler */}
                  {paletteOptions.length > 0 ? (
                    <div className="mb-3">
                      <p className="mb-1.5 text-[11px] text-white/45">Hazır palet uygula</p>
                      <div className="flex flex-wrap gap-2">
                        {paletteOptions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => applyPalette(p.id)}
                            disabled={busy}
                            className="flex items-center gap-1.5 rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/[0.06]"
                            title={p.descriptionTr}
                          >
                            <span className="flex">
                              {[p.brand.primary, p.surface.background, p.text.primary].map((c, i) => (
                                <span key={i} className="h-3 w-3 rounded-sm border border-black/20" style={{ background: c }} />
                              ))}
                            </span>
                            {p.nameTr}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {COLOR_UI.filter((c) => !isHidden(c.path)).map((c) => {
                      const label = FIELD_LABELS[c.path];
                      const value = String(doc.tokens[c.group][c.key] ?? "");
                      const contrastAgainst = c.contrast
                        ? String(doc.tokens[c.contrast.group][c.contrast.key] ?? "")
                        : undefined;
                      return (
                        <ColorField
                          key={c.path}
                          label={label.labelTr}
                          description={label.descriptionTr}
                          usage={label.usageTr}
                          value={value}
                          invalid={invalidFields.has(c.path)}
                          disabled={busy}
                          locked={isLocked(c.path)}
                          contrastAgainst={contrastAgainst}
                          contrastThreshold={c.contrast?.threshold}
                          recent={recent}
                          onChange={(v) => setColor(c.group, c.key, v)}
                          onHighlight={iframeUrl ? () => highlight(c.path) : undefined}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Tipografi */}
                {!isHidden("typography.bodyFont") ? (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-white/85">Tipografi</p>
                    <Select
                      label="Yazı tipi"
                      value={activeFontId}
                      disabled={busy || isLocked("typography.bodyFont")}
                      onChange={(e) => applyFontPreset(e.target.value)}
                      options={[
                        { value: "", label: activeFontId ? "Özel" : "Varsayılan" },
                        ...fontOptions.map((p) => ({ value: p.id, label: `${p.nameTr} (${p.category})` })),
                      ]}
                    />
                    {getFieldLabelSafe("typography.bodyFont")}
                    {/* Font önizleme örneği */}
                    {fontStacks ? (
                      <div className="mt-3 rounded-lg border border-white/10 p-3" style={{ background: "var(--tp-paper,#111)" }}>
                        <p style={{ fontFamily: fontStacks.headingStack, fontSize: 20, color: "#f5f5f5", margin: 0 }}>
                          Öne çıkan ürünler
                        </p>
                        <p style={{ fontFamily: fontStacks.bodyStack, fontSize: 13, color: "#c9c9c9", margin: "6px 0" }}>
                          Bu paragraf gövde yazı tipini gösterir. Fiyat ve buton örnekleri aşağıdadır.
                        </p>
                        <div className="flex items-center gap-3">
                          <span style={{ fontFamily: fontStacks.bodyStack, fontSize: 15, fontWeight: 600, color: "#fff" }}>
                            ₺ 199,90
                          </span>
                          <span
                            style={{
                              fontFamily: fontStacks.bodyStack,
                              fontSize: 12,
                              background: "#735389",
                              color: "#fff",
                              borderRadius: 6,
                              padding: "6px 12px",
                            }}
                          >
                            Sepete ekle
                          </span>
                          <span style={{ fontFamily: fontStacks.bodyStack, fontSize: 12, color: "#9a9a9a" }}>
                            Menü · Kategoriler
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Hazır düzen */}
                {!isHidden("layoutPreset") ? (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-white/85">Hazır düzen</p>
                    <Select
                      value={layoutPreset}
                      disabled={busy || layoutLocked}
                      onChange={(e) => setLayoutPreset(e.target.value)}
                      options={layoutOptions.map((k) => ({ value: k, label: LAYOUT_FRIENDLY[k] ?? k }))}
                    />
                    <p className="mt-1 text-[11px] text-white/45">
                      {FIELD_LABELS["layoutPreset"].descriptionTr}
                      {layoutLocked ? " (bu görünüm için kilitli)" : ""}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* SAĞ: önizleme */}
              <div>
                <div className="sticky top-14">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white/85">Önizleme</p>
                    <div className="ml-auto flex gap-1">
                      {VIEWPORTS.map((v) => (
                        <Button
                          key={v.key}
                          size="sm"
                          variant={viewport === v.key ? "secondary" : "ghost"}
                          onClick={() => setViewport(v.key)}
                        >
                          {v.label}
                        </Button>
                      ))}
                    </div>
                    <Button size="sm" onClick={openLivePreview} disabled={busy || !STOREFRONT_BASE_URL}>
                      Vitrini yükle
                    </Button>
                  </div>

                  {iframeUrl ? (
                    <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-2">
                      <iframe
                        ref={iframeRef}
                        key={`${iframeUrl}-${viewport}`}
                        src={iframeUrl}
                        title="Vitrin önizleme"
                        className="mx-auto block rounded border border-white/10 bg-white"
                        style={{
                          width: VIEWPORTS.find((v) => v.key === viewport)!.width,
                          maxWidth: "100%",
                          height: 640,
                        }}
                      />
                      <p className="mt-1 text-center text-[10px] text-white/40">
                        {VIEWPORTS.find((v) => v.key === viewport)!.label} · taslak (yayın değişmedi)
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-white/15 p-6 text-center">
                      <p className="text-sm text-white/60">Vitrin önizlemesini yükleyin</p>
                      <p className="mt-1 text-[11px] text-white/40">
                        “Vitrini yükle” ile renk, yazı tipi ve düzen değişikliklerinizi gerçek vitrinde görün.
                        Bir ayarın nereyi etkilediğini görmek için renk kartlarındaki “Önizlemede göster”i kullanın.
                      </p>
                      {!STOREFRONT_BASE_URL ? (
                        <p className="mt-2 text-[10px] text-amber-300/70">
                          Önizleme adresi yapılandırılmadı (NEXT_PUBLIC_STOREFRONT_URL).
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

/** Küçük yardımcı: tipografi alan açıklaması (locked notu dahil). */
function getFieldLabelSafe(path: CanonicalFieldPath) {
  const label = FIELD_LABELS[path];
  return <p className="mt-1 text-[11px] text-white/45">{label.descriptionTr}</p>;
}
