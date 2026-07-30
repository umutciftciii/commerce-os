"use client";

import { useEffect, useMemo, useState } from "react";
import {
  generateThemeStylesheet,
  validateThemeDocument,
  validateColor,
  validateLength,
  listSlotBuilderMenu,
  listStartingPoints,
  type ThemeDocument,
} from "@commerce-os/theme";
import type {
  ThemeSummary,
  ThemeDetail,
  ThemePresetSummary,
} from "@commerce-os/api-client";
import type { Locale } from "@commerce-os/i18n";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  SectionCard,
  Select,
  Spinner,
  useLocale,
} from "../../../components/ui";

// H-1 — Radius alanları için izinli uzunluk politikası (registry ile hizalı).
const RADIUS_LENGTH_POLICY = { units: ["px", "rem", "em", "%"] as const, allowZeroUnitless: true };

// TODO-164 — Layout preset seçenekleri (registry LAYOUT_PRESET key'leriyle hizalı;
// sunucu yine allowlist'e karşı doğrular). Ham/serbest değer kabul edilmez.
const LAYOUT_PRESET_OPTIONS = [
  { value: "BASE_COMMERCE", label: "Temel Ticaret (varsayılan)" },
  { value: "FASHION_MINIMAL", label: "Moda — Sade" },
  { value: "FASHION_EDITORIAL", label: "Moda — Editoryal" },
  { value: "MARKETPLACE_DENSE", label: "Pazaryeri — Yoğun" },
  { value: "PREMIUM_BOUTIQUE", label: "Premium Butik" },
];

// Font preset seçenekleri: ham font-family artık kabul edilmez (typed policy).
const FONT_PRESET_OPTIONS = [
  { value: "system", label: "Sistem (sans-serif)" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Monospace" },
];

/** Depolanmış font değerini (preset id veya legacy stack) seçili preset id'sine indirger. */
function fontSelectValue(current: string): string {
  const c = (current ?? "").toLowerCase();
  if (c === "system" || c === "sans" || c === "inter") return "system";
  if (c === "serif" || c === "playfair") return "serif";
  if (c === "mono" || c === "monospace") return "mono";
  // Legacy tam-stack: aile ipucuna göre eşle.
  if (c.includes("serif") && !c.includes("sans-serif")) return "serif";
  if (c.includes("mono")) return "mono";
  return "system";
}

// ── Düzenlenebilir token alanları (mimari tümünü destekler; UI çekirdeği kapsar) ──
type Group = "brand" | "surface" | "text" | "border" | "feedback";
const COLOR_FIELDS: { group: Group; label: string; keys: [string, string][] }[] = [
  {
    group: "brand",
    label: "Marka",
    keys: [
      ["primary", "Birincil"],
      ["secondary", "İkincil"],
      ["accent", "Aksan"],
      ["tertiary", "Üçüncül"],
    ],
  },
  {
    group: "surface",
    label: "Yüzeyler",
    keys: [
      ["background", "Sayfa zemini"],
      ["surface", "Yüzey"],
      ["surfaceMuted", "Sessiz yüzey"],
      ["surfaceElevated", "Yükseltilmiş"],
    ],
  },
  {
    group: "text",
    label: "Metin",
    keys: [
      ["primary", "Birincil"],
      ["secondary", "İkincil"],
      ["muted", "Sönük"],
      ["inverse", "Ters"],
      ["link", "Bağlantı"],
    ],
  },
  {
    group: "border",
    label: "Çizgi",
    keys: [
      ["default", "Varsayılan"],
      ["subtle", "İnce"],
      ["strong", "Belirgin"],
      ["focus", "Odak"],
    ],
  },
  {
    group: "feedback",
    label: "Durum",
    keys: [
      ["success", "Başarılı"],
      ["warning", "Uyarı"],
      ["error", "Hata"],
      ["info", "Bilgi"],
    ],
  },
];

function statusTone(status: string): "success" | "neutral" | "warning" {
  if (status === "PUBLISHED") return "success";
  if (status === "ARCHIVED") return "neutral";
  return "warning";
}

// ── TODO-164A — Custom Theme Builder yapısal seçenekler ──────────────────────
// Slot variant menüsü + başlangıç noktaları @commerce-os/theme'den (tek otorite;
// sunucu yine allowlist'e karşı doğrular). Yapısal enum'lar builder config'e yazılır.
const SLOT_MENU = listSlotBuilderMenu();
const STARTING_POINTS = listStartingPoints();
const HERO_HEIGHT_OPTIONS = [
  { value: "", label: "Varsayılan" },
  { value: "compact", label: "Kompakt" },
  { value: "standard", label: "Standart" },
  { value: "tall", label: "Uzun" },
  { value: "full", label: "Tam" },
];
const RADIUS_SCALE_OPTIONS = [
  { value: "", label: "Varsayılan" },
  { value: "sharp", label: "Keskin" },
  { value: "soft", label: "Yumuşak" },
  { value: "rounded", label: "Yuvarlak" },
];
const CONTAINER_GUTTER_OPTIONS = [
  { value: "", label: "Varsayılan" },
  { value: "tight", label: "Dar" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Geniş" },
];
const IMAGE_RATIO_OPTIONS = [
  { value: "", label: "Varsayılan" },
  { value: "square", label: "Kare (1:1)" },
  { value: "portrait", label: "Dikey (3:4)" },
  { value: "landscape", label: "Yatay (4:3)" },
];
const VIEWPORTS = [
  { key: "desktop", label: "Masaüstü", width: 1280 },
  { key: "tablet", label: "Tablet", width: 768 },
  { key: "mobile", label: "Mobil", width: 390 },
] as const;

/** Builder yapısal config (token belgesinden AYRI; slot + yapısal seçimler). */
interface BuilderConfig {
  slotVariants: Record<string, string>;
  listing?: { columnsDesktop?: number };
  hero?: { height?: string };
  radius?: { scale?: string };
  container?: { gutter?: string };
  productCard?: { imageRatio?: string };
}

// Vitrin base URL (iframe önizleme). Yoksa gerçek vitrin önizlemesi devre dışı
// (client-side mock her zaman çalışır). NEXT_PUBLIC_* → tarayıcıda okunur.
const STOREFRONT_BASE_URL =
  (process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "").replace(/\/+$/, "") || null;

export function ThemeStudio() {
  const locale = useLocale() as Locale;
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [presets, setPresets] = useState<ThemePresetSummary[]>([]);
  const [detail, setDetail] = useState<ThemeDetail | null>(null);
  const [doc, setDoc] = useState<ThemeDocument | null>(null);
  // TODO-164 — seçili layout preset (BASE_COMMERCE + 4 preset). config ile birlikte kaydedilir.
  const [layoutPreset, setLayoutPreset] = useState<string>("BASE_COMMERCE");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Yeni tema formu
  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState("");
  // TODO-164A — başlangıç noktası (preset kopyası) + builder yapısal config + preview.
  const [startingPoint, setStartingPoint] = useState("");
  const [builderConfig, setBuilderConfig] = useState<BuilderConfig>({ slotVariants: {} });
  const [viewport, setViewport] = useState<(typeof VIEWPORTS)[number]["key"]>("desktop");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

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
      // H-1 — kodu lokalize mesaja çevir (ham gateway mesajı/kodu gösterilmez).
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  const hydrateBuilder = (config: unknown): BuilderConfig => {
    const c = (config ?? {}) as Record<string, unknown>;
    const slots = (c.slotVariants ?? c.slots ?? {}) as Record<string, string>;
    return {
      slotVariants: { ...slots },
      listing: (c.listing as BuilderConfig["listing"]) ?? {},
      hero: (c.hero as BuilderConfig["hero"]) ?? {},
      radius: (c.radius as BuilderConfig["radius"]) ?? {},
      container: (c.container as BuilderConfig["container"]) ?? {},
      productCard: (c.productCard as BuilderConfig["productCard"]) ?? {},
    };
  };

  const openEditor = (themeId: string) =>
    run(async () => {
      const d = await storeApi.getTheme(themeId);
      setDetail(d);
      setLayoutPreset(d.layoutPreset ?? "BASE_COMMERCE");
      setBuilderConfig(hydrateBuilder(d.draft?.config ?? d.published?.config));
      setIframeUrl(null);
      const source = d.draft?.document ?? d.published?.document;
      const valid = validateThemeDocument(source);
      setDoc(valid.ok ? valid.document : null);
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
        // TODO-164A — başlangıç noktası seçiliyse preset kopyalanır; yoksa eski preset akışı.
        ...(startingPoint ? { startingPoint } : newPreset ? { presetId: newPreset } : {}),
      });
      setNewName("");
      setNewPreset("");
      setStartingPoint("");
      await refreshList();
      setDetail(d);
      setLayoutPreset(d.layoutPreset ?? "BASE_COMMERCE");
      setBuilderConfig(hydrateBuilder(d.draft?.config));
      const valid = validateThemeDocument(d.draft?.document);
      setDoc(valid.ok ? valid.document : null);
    }, "Tema oluşturuldu.");

  // TODO-164A — slot variant / yapısal grup güncelleyicileri.
  const setSlotVariant = (slot: string, variant: string) =>
    setBuilderConfig((prev) => {
      const next = { ...prev.slotVariants };
      if (variant) next[slot] = variant;
      else delete next[slot];
      return { ...prev, slotVariants: next };
    });
  const setBuilderGroup = <K extends keyof BuilderConfig>(group: K, value: BuilderConfig[K]) =>
    setBuilderConfig((prev) => ({ ...prev, [group]: value }));

  const setColor = (group: Group, key: string, value: string) => {
    setDoc((prev) => {
      if (!prev) return prev;
      return { ...prev, tokens: { ...prev.tokens, [group]: { ...prev.tokens[group], [key]: value } } };
    });
  };

  const setRadius = (key: string, value: string) =>
    setDoc((prev) =>
      prev ? { ...prev, tokens: { ...prev.tokens, radius: { ...prev.tokens.radius, [key]: value } } } : prev,
    );

  const setFont = (key: "headingFont" | "bodyFont", value: string) =>
    setDoc((prev) =>
      prev
        ? { ...prev, tokens: { ...prev.tokens, typography: { ...prev.tokens.typography, [key]: value } } }
        : prev,
    );

  // TODO-164/164A — layout preset + BUILDER yapısal config. themeKey = BASE_COMMERCE
  // (builder teması = ortak engine + özel config). slotVariants + yapısal gruplar
  // eklenir; sunucu allowlist/bounded doğrular. Boş yapısal alanlar ATLANIR (temiz config).
  const themeConfig = () => {
    const bc = builderConfig;
    const clean = <T extends Record<string, unknown>>(o: T): Partial<T> => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "" && v !== null) out[k] = v;
      return out as Partial<T>;
    };
    const listing = clean({ columnsDesktop: bc.listing?.columnsDesktop });
    const hero = clean({ height: bc.hero?.height });
    const radius = clean({ scale: bc.radius?.scale });
    const container = clean({ gutter: bc.container?.gutter });
    const productCard = clean({ imageRatio: bc.productCard?.imageRatio });
    return {
      themeKey: "BASE_COMMERCE",
      layoutPreset,
      slots: {},
      slotVariants: bc.slotVariants,
      ...(Object.keys(listing).length ? { listing } : {}),
      ...(Object.keys(hero).length ? { hero } : {}),
      ...(Object.keys(radius).length ? { radius } : {}),
      ...(Object.keys(container).length ? { container } : {}),
      ...(Object.keys(productCard).length ? { productCard } : {}),
    };
  };

  // TODO-164A — Kopyala / Arşivle / gerçek vitrin önizleme (imzalı token → iframe).
  const duplicateTheme = () =>
    run(async () => {
      if (!detail) return;
      const copy = await storeApi.duplicateTheme(detail.id, { name: `${detail.name} (kopya)` });
      await refreshList();
      setDetail(copy);
      setBuilderConfig(hydrateBuilder(copy.draft?.config));
      const valid = validateThemeDocument(copy.draft?.document);
      setDoc(valid.ok ? valid.document : null);
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
      // Önce güncel draft'ı kaydet (önizleme draft'ı yansıtır), sonra token al.
      if (doc) await storeApi.saveThemeDraft(detail.id, { document: doc as unknown as Record<string, unknown>, config: themeConfig() });
      const { token } = await storeApi.themePreviewToken(detail.id);
      setIframeUrl(`${STOREFRONT_BASE_URL}/?themePreview=${encodeURIComponent(token)}`);
    });

  const saveDraft = () =>
    run(async () => {
      if (!detail || !doc) return;
      const d = await storeApi.saveThemeDraft(detail.id, {
        document: doc as unknown as Record<string, unknown>,
        config: themeConfig(),
      });
      setDetail(d);
      setLayoutPreset(d.layoutPreset ?? "BASE_COMMERCE");
      await refreshList();
    }, "Taslak kaydedildi.");

  const publish = () =>
    run(async () => {
      if (!detail) return;
      // Önce mevcut düzenlemeleri + config'i taslağa yaz, sonra yayınla.
      if (doc) {
        await storeApi.saveThemeDraft(detail.id, {
          document: doc as unknown as Record<string, unknown>,
          config: themeConfig(),
        });
      }
      const d = await storeApi.publishTheme(detail.id, {});
      setDetail(d);
      setLayoutPreset(d.layoutPreset ?? "BASE_COMMERCE");
      await refreshList();
    }, "Tema yayınlandı — vitrinde yayında.");

  const rollback = (version: number) =>
    run(async () => {
      if (!detail) return;
      const d = await storeApi.rollbackTheme(detail.id, { version });
      setDetail(d);
      const valid = validateThemeDocument(d.draft?.document);
      setDoc(valid.ok ? valid.document : null);
      await refreshList();
    }, "Versiyon taslağa geri yüklendi.");

  const exportTheme = () =>
    run(async () => {
      if (!detail) return;
      const { json } = await storeApi.exportTheme(detail.id);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${detail.name || "theme"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const importTheme = (file: File) =>
    run(async () => {
      const text = await file.text();
      const data = JSON.parse(text);
      const d = await storeApi.importTheme({ data });
      await refreshList();
      setDetail(d);
      const valid = validateThemeDocument(d.draft?.document);
      setDoc(valid.ok ? valid.document : null);
    }, "Tema içe aktarıldı.");

  const removeTheme = (themeId: string) =>
    run(async () => {
      await storeApi.deleteTheme(themeId);
      await refreshList();
    }, "Tema silindi.");

  // H-1 — Alan-seviyesi doğrulama: geçersiz token'lar kaydetmeden ÖNCE işaretlenir
  // (kaydetme/yayınlama engellenir; sunucu ikinci savunmadır). Renk + radius alanları.
  const invalidFields = useMemo(() => {
    const set = new Set<string>();
    if (!doc) return set;
    for (const section of COLOR_FIELDS) {
      for (const [key] of section.keys) {
        const value = String(doc.tokens[section.group]?.[key] ?? "");
        if (!validateColor(value).ok) set.add(`${section.group}.${key}`);
      }
    }
    for (const k of ["sm", "md", "lg"] as const) {
      const value = String(doc.tokens.radius?.[k] ?? "");
      if (!validateLength(value, RADIUS_LENGTH_POLICY).ok) set.add(`radius.${k}`);
    }
    return set;
  }, [doc]);
  const hasErrors = invalidFields.size > 0;

  // Canlı önizleme CSS'i (istemci tarafında @commerce-os/theme ile üretilir).
  const previewCss = useMemo(() => {
    if (!doc) return "";
    try {
      return generateThemeStylesheet(doc, { selector: "#tp-scope" });
    } catch {
      return "";
    }
  }, [doc]);

  if (loading) {
    return (
      <SectionCard title="Temalar">
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
            title="Yeni tema"
            description="Bir preset seçin (ya da boş bırakıp varsayılandan başlayın), ad verin."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-white/50">Tema adı</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Örn. Bahar Koleksiyonu" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-white/50">Başlangıç noktası</label>
                <Select
                  value={startingPoint}
                  onChange={(e) => {
                    setStartingPoint(e.target.value);
                    if (e.target.value) setNewPreset("");
                  }}
                  options={[
                    { value: "", label: "Preset paletinden seç →" },
                    ...STARTING_POINTS.map((s) => ({ value: s.key, label: s.nameTr })),
                  ]}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-white/50">Preset (palet)</label>
                <Select
                  value={newPreset}
                  onChange={(e) => setNewPreset(e.target.value)}
                  disabled={!!startingPoint}
                  options={[
                    { value: "", label: "Varsayılan" },
                    ...presets.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>
              <Button onClick={createTheme} disabled={busy}>
                Oluştur
              </Button>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06]">
                İçe aktar
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importTheme(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Temalar" description="Yalnız bir tema yayında olabilir.">
            {themes.length === 0 ? (
              <p className="text-sm text-white/50">Henüz tema yok.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {themes.map((t) => (
                  <Card key={t.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white/90">{t.name}</p>
                      <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-white/40">
                      Kaynak: {t.source ?? "—"} · v{t.publishedVersion ?? t.draftVersion ?? "—"} · {t.colorScheme}
                    </p>
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
          title={`Düzenle: ${detail.name}`}
          description={`Durum: ${detail.status} · Taslak v${detail.draft?.version ?? "—"} · Yayın v${detail.published?.version ?? "—"}`}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={closeEditor}>
              ← Listeye dön
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
            <Button variant="secondary" size="sm" onClick={exportTheme} disabled={busy}>
              Dışa aktar
            </Button>
          </div>

          {/* TODO-164 — Layout preset seçimi (başlık/kart/hero/liste düzeni). Kaydet/Yayınla
              ile birlikte config olarak gönderilir; sunucu variant'ları allowlist'e karşı doğrular. */}
          <div className="mb-5 max-w-md">
            <Select
              label="Düzen preset"
              value={layoutPreset}
              onChange={(e) => setLayoutPreset(e.target.value)}
              options={LAYOUT_PRESET_OPTIONS}
              disabled={busy}
            />
            <p className="mt-1 text-xs text-white/40">
              Ortak vitrin engine üzerinde başlık, ürün kartı, hero ve liste düzenini seçer.
              Tokenlar (renk/tipografi) ayrıca aşağıdan düzenlenir.
            </p>
          </div>

          {/* TODO-164A — YAPI (Builder): slot variant seçimi + yapısal ince ayar. Her
              seçim GÖRÜNÜR slot farkı üretir (sunucu allowlist/bounded doğrular). */}
          <div className="mb-6 rounded-lg border border-white/10 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/60">
              Yapı — Slot düzenleri
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SLOT_MENU.map((slot) => (
                <div key={slot.key}>
                  <label className="mb-1 block text-[11px] text-white/45">{slot.nameTr}</label>
                  <Select
                    value={builderConfig.slotVariants[slot.key] ?? ""}
                    onChange={(e) => setSlotVariant(slot.key, e.target.value)}
                    disabled={busy}
                    className="text-xs"
                    options={[
                      { value: "", label: `Varsayılan (${slot.defaultVariant})` },
                      ...slot.variants.map((v) => ({ value: v.key, label: v.nameTr })),
                    ]}
                  />
                </div>
              ))}
            </div>
            <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-white/60">
              Yapı — Ölçü & yoğunluk
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-[11px] text-white/45">Liste kolonu (masaüstü)</label>
                <Select
                  value={String(builderConfig.listing?.columnsDesktop ?? "")}
                  onChange={(e) =>
                    setBuilderGroup("listing", {
                      columnsDesktop: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  disabled={busy}
                  className="text-xs"
                  options={[
                    { value: "", label: "Varsayılan" },
                    ...[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} kolon` })),
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-white/45">Hero yüksekliği</label>
                <Select
                  value={builderConfig.hero?.height ?? ""}
                  onChange={(e) => setBuilderGroup("hero", { height: e.target.value || undefined })}
                  disabled={busy}
                  className="text-xs"
                  options={HERO_HEIGHT_OPTIONS}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-white/45">Köşe ölçeği</label>
                <Select
                  value={builderConfig.radius?.scale ?? ""}
                  onChange={(e) => setBuilderGroup("radius", { scale: e.target.value || undefined })}
                  disabled={busy}
                  className="text-xs"
                  options={RADIUS_SCALE_OPTIONS}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-white/45">Kenar boşluğu</label>
                <Select
                  value={builderConfig.container?.gutter ?? ""}
                  onChange={(e) => setBuilderGroup("container", { gutter: e.target.value || undefined })}
                  disabled={busy}
                  className="text-xs"
                  options={CONTAINER_GUTTER_OPTIONS}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-white/45">Kart görsel oranı</label>
                <Select
                  value={builderConfig.productCard?.imageRatio ?? ""}
                  onChange={(e) => setBuilderGroup("productCard", { imageRatio: e.target.value || undefined })}
                  disabled={busy}
                  className="text-xs"
                  options={IMAGE_RATIO_OPTIONS}
                />
              </div>
            </div>
          </div>

          {!doc ? (
            <Alert tone="warning" title="Belge çözümlenemedi">
              Bu tema versiyonu düzenlenemiyor.
            </Alert>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {hasErrors ? (
                <div className="lg:col-span-2">
                  <Alert tone="error" title="Geçersiz token değeri">
                    Bazı alanlar geçerli bir değer içermiyor (kırmızı ile
                    işaretli). Kaydetme ve yayınlama, düzeltilene kadar
                    engellenir.
                  </Alert>
                </div>
              ) : null}
              {/* Editör */}
              <div className="space-y-5">
                {COLOR_FIELDS.map((section) => (
                  <div key={section.group}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                      {section.label}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {section.keys.map(([key, label]) => {
                        const value = String(doc.tokens[section.group][key] ?? "");
                        const invalid = invalidFields.has(`${section.group}.${key}`);
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span
                              className="h-7 w-7 shrink-0 rounded border border-white/15"
                              style={{ background: invalid ? "transparent" : value }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <label className="block truncate text-[11px] text-white/45">{label}</label>
                              <Input
                                value={value}
                                onChange={(e) => setColor(section.group, key, e.target.value)}
                                className={`text-xs ${invalid ? "border-red-500/70" : ""}`}
                                aria-invalid={invalid}
                              />
                              {invalid ? (
                                <span className="mt-0.5 block text-[10px] text-red-400">
                                  Geçerli bir renk girin (ör. #735389, rgb(...)).
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                    Köşe yarıçapı
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["sm", "md", "lg"] as const).map((k) => {
                      const invalid = invalidFields.has(`radius.${k}`);
                      return (
                        <div key={k}>
                          <label className="block text-[11px] text-white/45">{k}</label>
                          <Input
                            value={String(doc.tokens.radius[k] ?? "")}
                            onChange={(e) => setRadius(k, e.target.value)}
                            className={`text-xs ${invalid ? "border-red-500/70" : ""}`}
                            aria-invalid={invalid}
                          />
                          {invalid ? (
                            <span className="mt-0.5 block text-[10px] text-red-400">
                              px/rem/em/% (ör. 8px)
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                    Tipografi
                  </p>
                  <label className="block text-[11px] text-white/45">Başlık ailesi</label>
                  <Select
                    value={fontSelectValue(doc.tokens.typography.headingFont)}
                    onChange={(e) => setFont("headingFont", e.target.value)}
                    options={FONT_PRESET_OPTIONS}
                    className="mb-2 text-xs"
                  />
                  <label className="block text-[11px] text-white/45">Gövde ailesi</label>
                  <Select
                    value={fontSelectValue(doc.tokens.typography.bodyFont)}
                    onChange={(e) => setFont("bodyFont", e.target.value)}
                    options={FONT_PRESET_OPTIONS}
                    className="text-xs"
                  />
                </div>

                {detail.versions.length > 1 ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                      Versiyonlar (rollback)
                    </p>
                    <div className="space-y-1">
                      {detail.versions.map((v) => (
                        <div key={v.id} className="flex items-center justify-between text-xs text-white/60">
                          <span>
                            v{v.version} · {v.status}
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => rollback(v.version)} disabled={busy}>
                            Geri yükle
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Önizleme: gerçek vitrin (iframe, imzalı token) + hızlı token mock. */}
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    Önizleme
                  </p>
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
                    Gerçek vitrin
                  </Button>
                </div>

                {/* Gerçek storefront önizlemesi — draft config+document uygulanır
                    (Home/PLP/PDP/Cart/Checkout gezilebilir). Token store+theme scoped. */}
                {iframeUrl ? (
                  <div className="mb-4 overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-2">
                    <iframe
                      key={`${iframeUrl}-${viewport}`}
                      src={iframeUrl}
                      title="Vitrin önizleme"
                      className="mx-auto block rounded border border-white/10 bg-white"
                      style={{
                        width: VIEWPORTS.find((v) => v.key === viewport)!.width,
                        maxWidth: "100%",
                        height: 620,
                      }}
                    />
                    <p className="mt-1 text-center text-[10px] text-white/40">
                      {VIEWPORTS.find((v) => v.key === viewport)!.label} · taslak (yayın değişmedi)
                    </p>
                  </div>
                ) : STOREFRONT_BASE_URL ? (
                  <p className="mb-3 text-[11px] text-white/40">
                    “Gerçek vitrin” ile taslağı gezilebilir bir vitrin önizlemesinde açın.
                  </p>
                ) : null}

                <p className="mb-2 text-[11px] uppercase tracking-wide text-white/40">
                  Hızlı token önizleme
                </p>
                <style dangerouslySetInnerHTML={{ __html: previewCss }} />
                <div
                  id="tp-scope"
                  className="overflow-hidden rounded-lg border border-white/10"
                  style={{ background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-sans)" }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}
                  >
                    <span style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}>Mağaza</span>
                    <span
                      style={{
                        background: "var(--accent)",
                        color: "var(--accent-contrast)",
                        borderRadius: "var(--radius-md)",
                        padding: "6px 12px",
                        fontSize: 12,
                      }}
                    >
                      Sepet
                    </span>
                  </div>
                  <div className="px-4 py-5">
                    <p style={{ color: "var(--ink-subtle)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Yeni sezon
                    </p>
                    <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 22, margin: "4px 0 8px" }}>
                      Öne çıkan ürünler
                    </h3>
                    <p style={{ color: "var(--ink-muted)", fontSize: 13, marginBottom: 12 }}>
                      Bu panel taslak token'larınızla anlık render edilir.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--line)",
                            borderRadius: "var(--radius-md)",
                            boxShadow: "var(--shadow-sm)",
                            padding: 12,
                          }}
                        >
                          <div style={{ height: 56, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }} />
                          <p style={{ fontSize: 12, marginTop: 8 }}>Ürün {i}</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>₺ 199,90</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <span
                        style={{
                          background: "var(--accent)",
                          color: "var(--accent-contrast)",
                          borderRadius: "var(--radius-md)",
                          padding: "8px 16px",
                          fontSize: 13,
                        }}
                      >
                        Alışverişe başla
                      </span>
                      <span
                        style={{
                          border: "1px solid var(--line-strong)",
                          borderRadius: "var(--radius-full, 9999px)",
                          padding: "6px 12px",
                          fontSize: 12,
                          color: "var(--ink-muted)",
                        }}
                      >
                        Filtre
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
