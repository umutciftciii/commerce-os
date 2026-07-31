"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Input,
  PageHeader,
  SectionCard,
  Spinner,
  Textarea,
  useLocale,
} from "@commerce-os/ui";
import {
  validateThemeDocument,
  applyPaletteToDocument,
  listColorPalettes,
  FONT_PRESETS,
  listSlotBuilderMenu,
  LAYOUT_PRESET_KEYS,
  getLayoutPreset,
  FIELD_LABELS,
  defaultOverridePolicy,
  contrastRatio,
  type ThemeDocument,
  type CanonicalFieldPath,
} from "@commerce-os/theme";
import type { ThemeDetail, StoreOverridePolicyContract } from "@commerce-os/api-client";
import { Tabs, TabPanel, type TabItem } from "../../../../components/theme-library/tabs";
import { ColorField } from "../../../../components/theme-library/color-field";
import { PolicyMatrix } from "../../../../components/theme-library/policy-matrix";
import { PreviewFrame, type PreviewMode } from "../../../../components/theme-library/preview-frame";
import { BeforeAfter } from "../../../../components/theme-library/before-after";
import { NativeSelect } from "../../../../components/theme-library/native-select";
import { AssignmentDialog } from "../../../../components/theme-library/assignment-dialog";
import { adminApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";

const STOREFRONT_BASE_URL = (process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "").replace(/\/+$/, "") || null;

const TABS: TabItem[] = [
  { id: "template", label: "Şablon" },
  { id: "brand", label: "Marka" },
  { id: "colors", label: "Renk Paleti" },
  { id: "typography", label: "Tipografi" },
  { id: "components", label: "Bileşenler" },
  { id: "layouts", label: "Sayfa Düzenleri" },
  { id: "mobile", label: "Mobil" },
  { id: "preview", label: "Önizleme" },
  { id: "publish", label: "Yayınlama" },
];

type Grp = "brand" | "surface" | "text" | "border" | "feedback";
interface ColorUi {
  path: CanonicalFieldPath;
  group: Grp;
  key: string;
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

type BuilderConfig = {
  themeKey?: string;
  layoutPreset?: string;
  slots?: Record<string, string>;
  slotVariants?: Record<string, string>;
  typography?: { headingScale?: number; baseSize?: string; lineHeight?: number; letterSpacing?: string };
  responsiveOverrides?: { mobile?: Record<string, unknown>; tablet?: Record<string, unknown> };
  colorScheme?: string;
  [k: string]: unknown;
};

function readToken(doc: ThemeDocument, group: string, key: string): string {
  const bag = (doc.tokens as unknown as Record<string, Record<string, unknown>>)[group];
  return String(bag?.[key] ?? "");
}
function writeToken(doc: ThemeDocument, group: string, key: string, value: string): ThemeDocument {
  return {
    ...doc,
    tokens: {
      ...doc.tokens,
      [group]: { ...(doc.tokens as unknown as Record<string, Record<string, unknown>>)[group], [key]: value },
    },
  } as ThemeDocument;
}
function readAsset(doc: ThemeDocument, key: string): string {
  return String((doc.assets as unknown as Record<string, unknown>)?.[key] ?? "");
}
function writeAsset(doc: ThemeDocument, key: string, value: string): ThemeDocument {
  return { ...doc, assets: { ...(doc.assets ?? {}), [key]: value || undefined } } as ThemeDocument;
}
function currentFontPresetId(doc: ThemeDocument): string {
  const h = readToken(doc, "typography", "headingFont");
  const b = readToken(doc, "typography", "bodyFont");
  return FONT_PRESETS.find((p) => p.headingFamily === h && p.bodyFamily === b)?.id ?? "";
}

export default function ThemeDesignerPage() {
  const params = useParams<{ id: string }>();
  const templateId = params.id;
  const router = useRouter();
  const locale = useLocale();

  const [detail, setDetail] = useState<ThemeDetail | null>(null);
  const [doc, setDoc] = useState<ThemeDocument | null>(null);
  const [config, setConfig] = useState<BuilderConfig>({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [policy, setPolicy] = useState<StoreOverridePolicyContract>(() => defaultOverridePolicy());
  const [active, setActive] = useState("template");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [diffSummary, setDiffSummary] = useState<import("@commerce-os/api-client").ThemeChangeSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await adminApi.getTemplate(templateId);
      setDetail(d);
      setName(d.name);
      setDescription(d.description ?? "");
      setPolicy(d.overridePolicy ?? defaultOverridePolicy());
      const source = d.draft?.document ?? d.published?.document;
      const v = validateThemeDocument(source);
      if (v.ok) setDoc(v.document);
      const cfg = (d.draft?.config ?? d.published?.config ?? {}) as BuilderConfig;
      setConfig(cfg);
      setDirty(false);
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setLoading(false);
    }
  }, [templateId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  function mutateDoc(next: ThemeDocument) {
    setDoc(next);
    setDirty(true);
  }
  function mutateConfig(next: BuilderConfig) {
    setConfig(next);
    setDirty(true);
  }

  async function saveDraft(): Promise<boolean> {
    if (!doc) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await adminApi.saveTemplateDraft(templateId, {
        document: doc as unknown as Record<string, unknown>,
        config: config as unknown as Record<string, unknown>,
      });
      setDetail(updated);
      setDirty(false);
      setNotice("Taslak kaydedildi.");
      return true;
    } catch (e) {
      setError(messageForError(e, locale));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveMeta() {
    setBusy(true);
    setError(null);
    try {
      const updated = await adminApi.updateTemplateMeta(templateId, { name, description: description || null });
      setDetail(updated);
      setNotice("Bilgiler güncellendi.");
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  async function savePolicy() {
    setBusy(true);
    setError(null);
    try {
      const updated = await adminApi.setTemplatePolicy(templateId, { overridePolicy: policy });
      setDetail(updated);
      setPolicy(updated.overridePolicy ?? policy);
      setNotice("Override policy kaydedildi.");
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (dirty && !(await saveDraft())) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await adminApi.publishTemplate(templateId, {});
      setDetail(updated);
      setNotice("Şablon yayınlandı.");
      void load();
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      await adminApi.archiveTemplate(templateId);
      router.push("/theme-library");
    } catch (e) {
      setError(messageForError(e, locale));
      setBusy(false);
    }
  }

  async function duplicate() {
    setBusy(true);
    try {
      const copy = await adminApi.duplicateTemplate(templateId, { name: `${name} (kopya)` });
      router.push(`/theme-library/${copy.id}`);
    } catch (e) {
      setError(messageForError(e, locale));
      setBusy(false);
    }
  }

  async function stageAssets() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      const logo = readAsset(doc, "logoMediaId");
      const favicon = readAsset(doc, "faviconMediaId");
      await adminApi.stageTemplateAssets(templateId, {
        logoMediaId: logo || null,
        faviconMediaId: favicon || null,
      });
      setNotice("Logo/favicon taslağa sahnelendi — yayınlandığında mağaza ayarlarına atomik uygulanır.");
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  async function rollback(version: number) {
    setBusy(true);
    try {
      await adminApi.rollbackTemplate(templateId, { version });
      setNotice(`v${version} sürümüne geri dönüldü (yeni taslak).`);
      void load();
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  const fetchToken = useCallback(
    async (mode: PreviewMode): Promise<string | null> => {
      // Draft ilk kaydedilmeli ki önizleme güncel taslağı göstersin.
      if (mode === "draft" && dirty) await saveDraft();
      const version = mode === "published" ? (detail?.published?.version ?? undefined) : undefined;
      const res = await adminApi.templatePreviewToken(templateId, version ? { version } : {});
      return res.token;
    },
    [templateId, dirty, detail?.published?.version],
  );

  async function loadDiff() {
    try {
      const summary = await adminApi.templateDiff(templateId, { from: "published", to: "draft" });
      setDiffSummary(summary);
    } catch (e) {
      setError(messageForError(e, locale));
    }
  }

  const fontPresetId = doc ? currentFontPresetId(doc) : "";
  const versions = detail?.versions ?? [];

  const tabsWithBadges = useMemo<TabItem[]>(
    () =>
      TABS.map((t) =>
        t.id === "publish" && detail && detail.overridePolicy == null
          ? { ...t, badge: <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">!</span> }
          : t,
      ),
    [detail],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500">
        <Spinner /> Yükleniyor…
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Tema Kütüphanesi · Designer"
        title={name || "Tema şablonu"}
        description={detail ? `${detail.themeKey} · sürüm şeması ${detail.themeApiVersion}` : ""}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/theme-library")}>
              Geri
            </Button>
            <Button variant="secondary" onClick={() => void duplicate()} disabled={busy}>
              Kopyala
            </Button>
            <Button variant="secondary" onClick={() => void saveDraft()} disabled={busy || !dirty}>
              Taslağı kaydet
            </Button>
            <Button onClick={() => void publish()} disabled={busy}>
              Yayınla
            </Button>
          </div>
        }
      />

      {error ? (
        <Alert tone="error" title="Hata">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="success" title="Tamam">
          {notice}
        </Alert>
      ) : null}

      <SectionCard title="Tema tasarımcısı" description="9 adımda platform tema şablonu.">
        <Tabs tabs={tabsWithBadges} active={active} onChange={setActive} ariaLabel="Tema tasarımcısı sekmeleri" />

        {/* ŞABLON */}
        <TabPanel id="template" active={active}>
          <div className="max-w-xl space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Tema adı</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Açıklama</span>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} />
            </label>
            <Button variant="secondary" size="sm" onClick={() => void saveMeta()} disabled={busy}>
              Bilgileri kaydet
            </Button>
            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3 text-sm">
              <Info label="Theme key" value={detail?.themeKey ?? "—"} mono />
              <Info label="Durum" value={detail?.status ?? "—"} />
              <Info label="Kaynak" value={detail?.source ?? "—"} />
              <Info label="Sürüm şeması" value={String(detail?.themeApiVersion ?? "—")} />
              <Info label="Yayın sürümü" value={String(detail?.published?.version ?? "—")} />
              <Info label="Taslak sürümü" value={String(detail?.draft?.version ?? "—")} />
            </dl>
          </div>
        </TabPanel>

        {/* MARKA */}
        <TabPanel id="brand" active={active}>
          {doc ? (
            <div className="max-w-xl space-y-3">
              <p className="text-sm text-slate-500">
                Marka görselleri (medya kimliği). Mağaza logosunun kalıcı otoritesi StoreSettings&apos;tir; buradaki
                değerler şablonun önerdiği varsayılanlardır ve atama/publish akışında sahnelenir.
              </p>
              {[
                { key: "logoMediaId", label: "Logo" },
                { key: "darkLogoMediaId", label: "Koyu logo" },
                { key: "faviconMediaId", label: "Favicon" },
                { key: "ogImageMediaId", label: "Sosyal paylaşım görseli" },
              ].map((a) => (
                <label key={a.key} className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">{a.label} (medya ID)</span>
                  <Input
                    value={readAsset(doc, a.key)}
                    onChange={(e) => mutateDoc(writeAsset(doc, a.key, e.target.value))}
                    placeholder="med_…"
                  />
                </label>
              ))}
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void stageAssets()} disabled={busy}>
                  Logo/favicon&apos;u sahnele
                </Button>
                <span className="text-xs text-slate-400">
                  Yayınlandığında StoreSettings&apos;e atomik uygulanır; rollback ile geri döner (TD-162).
                </span>
              </div>
            </div>
          ) : null}
        </TabPanel>

        {/* RENK PALETİ */}
        <TabPanel id="colors" active={active}>
          {doc ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Hazır paletler</p>
                <div className="flex flex-wrap gap-2">
                  {listColorPalettes().map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => mutateDoc(applyPaletteToDocument(doc, p.id))}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {p.nameTr}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {COLOR_UI.map((c) => {
                  const label = FIELD_LABELS[c.path];
                  const value = readToken(doc, c.group, c.key);
                  const against = c.contrast ? readToken(doc, c.contrast.group, c.contrast.key) : undefined;
                  const invalid = value !== "" && contrastRatio(value, "#ffffff") == null;
                  return (
                    <ColorField
                      key={c.path}
                      label={label.labelTr}
                      description={label.descriptionTr}
                      usage={label.usageTr}
                      value={value}
                      invalid={invalid}
                      contrastAgainst={against}
                      contrastThreshold={c.contrast?.threshold}
                      onChange={(v) => mutateDoc(writeToken(doc, c.group, c.key, v))}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
        </TabPanel>

        {/* TİPOGRAFİ */}
        <TabPanel id="typography" active={active}>
          {doc ? (
            <div className="max-w-xl space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Yazı tipi seti</span>
                <NativeSelect
                  value={fontPresetId}
                  onChange={(e) => {
                    const preset = FONT_PRESETS.find((p) => p.id === e.target.value);
                    if (!preset) return;
                    let next = writeToken(doc, "typography", "headingFont", preset.headingFamily);
                    next = writeToken(next, "typography", "bodyFont", preset.bodyFamily);
                    mutateDoc(next);
                  }}
                >
                  <option value="">Özel / seçilmedi</option>
                  {FONT_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nameTr} — {p.category}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Başlık ölçeği</span>
                  <Input
                    type="number"
                    step="0.05"
                    min="1"
                    max="2"
                    value={String(config.typography?.headingScale ?? 1.25)}
                    onChange={(e) =>
                      mutateConfig({ ...config, typography: { ...config.typography, headingScale: Number(e.target.value) } })
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Satır yüksekliği</span>
                  <Input
                    type="number"
                    step="0.05"
                    min="1"
                    max="2.5"
                    value={String(config.typography?.lineHeight ?? 1.5)}
                    onChange={(e) =>
                      mutateConfig({ ...config, typography: { ...config.typography, lineHeight: Number(e.target.value) } })
                    }
                  />
                </label>
              </div>
              <p className="text-xs text-slate-400">
                Yalnız izin listesindeki güvenli yazı tipleri kullanılabilir (serbest font-family girilemez). Türkçe
                karakter desteği garanti edilir.
              </p>
            </div>
          ) : null}
        </TabPanel>

        {/* BİLEŞENLER */}
        <TabPanel id="components" active={active}>
          <SlotSelectors
            config={config}
            onChange={mutateConfig}
            slots={["header", "footer", "mobileNavigation", "productCard", "hero", "homeSectionFrame"]}
          />
        </TabPanel>

        {/* SAYFA DÜZENLERİ */}
        <TabPanel id="layouts" active={active}>
          <div className="max-w-xl space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Hazır düzen (tüm sayfalar)</span>
              <NativeSelect
                value={config.layoutPreset ?? "BASE_COMMERCE"}
                onChange={(e) => mutateConfig({ ...config, layoutPreset: e.target.value })}
              >
                {LAYOUT_PRESET_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {getLayoutPreset(k)?.nameTr ?? k}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <SlotSelectors config={config} onChange={mutateConfig} slots={["productListingLayout", "productDetailLayout"]} />
            <p className="text-xs text-slate-400">
              Sepet, Ödeme ve Hesabım sayfaları seçili hazır düzeni ve token&apos;ları kullanır.
            </p>
          </div>
        </TabPanel>

        {/* MOBİL */}
        <TabPanel id="mobile" active={active}>
          <MobileControls config={config} onChange={mutateConfig} />
        </TabPanel>

        {/* ÖNİZLEME */}
        <TabPanel id="preview" active={active}>
          <div className="space-y-4">
            <PreviewFrame
              storefrontBaseUrl={STOREFRONT_BASE_URL}
              fetchToken={fetchToken}
              draftAvailable={!!detail?.draft}
              publishedAvailable={!!detail?.published}
            />
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Yayın → Taslak değişiklik özeti</span>
                <Button variant="secondary" size="sm" onClick={() => void loadDiff()}>
                  Karşılaştır
                </Button>
              </div>
              {diffSummary ? <BeforeAfter summary={diffSummary} /> : <p className="text-sm text-slate-500">Karşılaştırmak için tıklayın.</p>}
            </div>
          </div>
        </TabPanel>

        {/* YAYINLAMA */}
        <TabPanel id="publish" active={active}>
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Override policy (mağaza yetkileri)</h3>
                <Button variant="secondary" size="sm" onClick={() => void savePolicy()} disabled={busy}>
                  Policy&apos;yi kaydet
                </Button>
              </div>
              {detail?.overridePolicy == null ? (
                <Alert tone="warning" title="Policy tanımlı değil">
                  Platform şablonu yayınlanmadan önce override policy açıkça tanımlanmalıdır (aksi halde publish
                  reddedilir).
                </Alert>
              ) : null}
              <PolicyMatrix policy={policy} onChange={(p) => setPolicy(p)} disabled={busy} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Sürümler</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-mono">v{v.version}</span>
                      <Badge tone={v.status === "PUBLISHED" ? "success" : v.status === "DRAFT" ? "warning" : "neutral"}>
                        {v.status}
                      </Badge>
                      {v.label ? <span className="text-xs text-slate-400">{v.label}</span> : null}
                    </span>
                    {v.status === "ARCHIVED" ? (
                      <Button variant="secondary" size="sm" onClick={() => void rollback(v.version)} disabled={busy}>
                        Bu sürüme dön
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void publish()} disabled={busy}>
                Yayınla
              </Button>
              <Button
                variant="secondary"
                onClick={() => setAssignOpen(true)}
                disabled={detail?.status !== "PUBLISHED"}
                title={detail?.status !== "PUBLISHED" ? "Önce yayınlayın" : undefined}
              >
                Mağazalara ata
              </Button>
              {detail?.status !== "PUBLISHED" && detail?.status !== "ARCHIVED" ? (
                <Button variant="secondary" onClick={() => void archive()} disabled={busy}>
                  Arşivle
                </Button>
              ) : null}
            </div>
          </div>
        </TabPanel>
      </SectionCard>

      {assignOpen && detail ? (
        <AssignmentDialog
          templateId={templateId}
          templateName={detail.name}
          onClose={() => setAssignOpen(false)}
          onApplied={() => void load()}
        />
      ) : null}
    </>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function SlotSelectors({
  config,
  onChange,
  slots,
}: {
  config: BuilderConfig;
  onChange: (next: BuilderConfig) => void;
  slots: string[];
}) {
  const menu = listSlotBuilderMenu();
  const entries = menu.filter((m) => slots.includes(m.key));
  function setSlot(key: string, variant: string) {
    onChange({ ...config, slotVariants: { ...(config.slotVariants ?? {}), [key]: variant } });
  }
  return (
    <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
      {entries.map((entry) => (
        <label key={entry.key} className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">{entry.nameTr}</span>
          <NativeSelect
            value={config.slotVariants?.[entry.key] ?? entry.defaultVariant}
            onChange={(e) => setSlot(entry.key, e.target.value)}
          >
            {entry.variants.map((v) => (
              <option key={v.key} value={v.key}>
                {v.nameTr}
              </option>
            ))}
          </NativeSelect>
        </label>
      ))}
    </div>
  );
}

function MobileControls({ config, onChange }: { config: BuilderConfig; onChange: (next: BuilderConfig) => void }) {
  const mobile = (config.responsiveOverrides?.mobile ?? {}) as Record<string, unknown>;
  function setMobile(key: string, value: unknown) {
    onChange({
      ...config,
      responsiveOverrides: { ...config.responsiveOverrides, mobile: { ...mobile, [key]: value } },
    });
  }
  return (
    <div className="grid max-w-xl gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Izgara sütunu (mobil)</span>
        <NativeSelect value={String(mobile.columns ?? 2)} onChange={(e) => setMobile("columns", Number(e.target.value))}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Vitrin yüksekliği</span>
        <NativeSelect value={String(mobile.heroHeight ?? "compact")} onChange={(e) => setMobile("heroHeight", e.target.value)}>
          {["compact", "medium", "tall"].map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Mobil menü</span>
        <NativeSelect
          value={String(mobile.navigationVariant ?? "drawer")}
          onChange={(e) => setMobile("navigationVariant", e.target.value)}
        >
          {["drawer", "bottomBar"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Kart yoğunluğu</span>
        <NativeSelect
          value={String(mobile.productCardDensity ?? "comfortable")}
          onChange={(e) => setMobile("productCardDensity", e.target.value)}
        >
          {["compact", "comfortable"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </NativeSelect>
      </label>
    </div>
  );
}
