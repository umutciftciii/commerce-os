"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  Select,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "../../../components/ui";
import type {
  HomeSection,
  HomeSectionCreateRequest,
  HomeSectionType,
} from "@commerce-os/api-client";
import { HomeIcon } from "../../../components/icons";
import { MediaUpload, type MediaItem } from "../../../components/media-upload";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { homeLabels, type HomeLocale } from "./labels";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sections: HomeSection[] };
type Editor = { mode: "create" } | { mode: "edit"; section: HomeSection } | null;

// TODO-162 — Keşif (eligibility-driven) rail tipleri: içerik viewer-specific Katman B'de çözülür (ürün seçimi yok).
const DISCOVERY_RAIL_TYPES: HomeSectionType[] = [
  "CONTINUE_BROWSING",
  "CART_RECOMMENDATIONS",
  "PERSONALIZED_DEALS",
  "DAILY_DEALS",
  "REPURCHASE",
  "SIMILAR_TO_PURCHASED",
  "WISHLIST_DEALS",
  "SPONSORED_RAIL",
];
const DISCOVERY_TYPES: HomeSectionType[] = [...DISCOVERY_RAIL_TYPES, "DISCOVERY_GRID", "EDITORIAL_CAMPAIGN"];
const GRID_CARD_TYPES = [
  "CONTINUE_BROWSING",
  "CART_RECOMMENDATIONS",
  "PERSONALIZED_DEALS",
  "EDITORIAL_CAMPAIGN",
  "DAILY_DEALS",
] as const;

/**
 * SALT-GÖRÜNÜM iş-invariant aynası (gateway `SECTION_BOUNDS` = tek doğruluk kaynağı, ADR-199). Admin yalnız
 * max'ı DÜŞÜREBİLİR; min'i düşüremez ve fallback'i açamaz (motor kelepçeler). Burada yalnız ipucu göstermek için.
 */
const DISCOVERY_BOUNDS: Record<string, { min: number; max: number; requiresAuth: boolean; fallbackAllowed: boolean }> = {
  CONTINUE_BROWSING: { min: 2, max: 4, requiresAuth: false, fallbackAllowed: false },
  CART_RECOMMENDATIONS: { min: 3, max: 8, requiresAuth: false, fallbackAllowed: false },
  PERSONALIZED_DEALS: { min: 3, max: 8, requiresAuth: false, fallbackAllowed: false },
  REPURCHASE: { min: 2, max: 6, requiresAuth: true, fallbackAllowed: false },
  SIMILAR_TO_PURCHASED: { min: 3, max: 8, requiresAuth: true, fallbackAllowed: false },
  WISHLIST_DEALS: { min: 2, max: 6, requiresAuth: false, fallbackAllowed: false },
  DAILY_DEALS: { min: 4, max: 12, requiresAuth: false, fallbackAllowed: true },
  SPONSORED_RAIL: { min: 3, max: 8, requiresAuth: false, fallbackAllowed: true },
};

const SECTION_TYPES: HomeSectionType[] = [
  "HERO_SLIDER",
  "FEATURED_CATEGORIES",
  "PRODUCT_SHOWCASE",
  "SPONSORED_SHOWCASE",
  "RECENTLY_VIEWED",
  ...DISCOVERY_TYPES,
];

const isRailType = (type: HomeSectionType) => DISCOVERY_RAIL_TYPES.includes(type);
/** Başlık TR/EN config ile yönetilen tipler (base title/subtitle gizlenir). */
const usesLocalizedTitle = (type: HomeSectionType) =>
  type === "RECENTLY_VIEWED" || DISCOVERY_TYPES.includes(type);

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function HomeExperiencePage() {
  const locale = useLocale() as HomeLocale;
  const t = homeLabels(locale);
  const router = useRouter();

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listHomeSections();
      setState({ status: "ready", sections: result.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = state.status === "ready" ? state.sections : [];

  async function handleDelete(section: HomeSection) {
    if (!window.confirm(t.deleteConfirm)) return;
    setBusyId(section.id);
    try {
      await storeApi.deleteHomeSection(section.id);
      setNotice(t.deletedToast);
      await load();
    } catch (error) {
      setNotice(messageForError(error, locale));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(section: HomeSection) {
    setBusyId(section.id);
    try {
      await storeApi.updateHomeSection(section.id, { enabled: !section.enabled });
      await load();
    } catch (error) {
      setNotice(messageForError(error, locale));
    } finally {
      setBusyId(null);
    }
  }

  async function handleMove(section: HomeSection, direction: -1 | 1) {
    const index = sections.findIndex((item) => item.id === section.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setReordering(true);
    try {
      await storeApi.reorderHomeSections({ orderedIds: next.map((item) => item.id) });
      await load();
    } catch (error) {
      setNotice(messageForError(error, locale));
    } finally {
      setReordering(false);
    }
  }

  function visibilityLabel(section: HomeSection): string {
    if (section.desktopVisible && section.mobileVisible) return t.visibilityBoth;
    if (section.desktopVisible) return t.visibilityDesktop;
    if (section.mobileVisible) return t.visibilityMobile;
    return t.visibilityNone;
  }

  const columns: DataTableColumn<HomeSection>[] = [
    {
      header: t.table.type,
      cell: (section) => <Badge tone="neutral">{t.types[section.type] ?? section.type}</Badge>,
    },
    {
      header: t.table.title,
      cell: (section) =>
        section.title ? (
          <span className="font-medium text-white/90">{section.title}</span>
        ) : (
          <span className="text-white/35">{t.untitled}</span>
        ),
    },
    { header: t.table.visibility, cell: (section) => <span className="text-white/60">{visibilityLabel(section)}</span> },
    {
      header: t.table.status,
      cell: (section) => (
        <Badge tone={section.enabled ? "success" : "neutral"}>
          {section.enabled ? t.enabled : t.disabled}
        </Badge>
      ),
    },
    {
      header: t.table.order,
      cell: (section) => {
        const index = sections.findIndex((item) => item.id === section.id);
        return (
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              aria-label={t.moveUp}
              disabled={reordering || index <= 0}
              onClick={() => void handleMove(section, -1)}
            >
              ↑
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={t.moveDown}
              disabled={reordering || index === sections.length - 1}
              onClick={() => void handleMove(section, 1)}
            >
              ↓
            </Button>
          </div>
        );
      },
    },
    {
      header: t.table.actions,
      align: "right",
      cell: (section) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push(`/home/${section.id}`)}>
            {t.manage}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busyId === section.id}
            onClick={() => void handleToggle(section)}
          >
            {section.enabled ? t.toggleDisable : t.toggleEnable}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", section })}>
            {t.editSettings}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busyId === section.id}
            onClick={() => void handleDelete(section)}
          >
            {t.delete}
          </Button>
        </div>
      ),
    },
  ];

  function onSaved(message: string) {
    setEditor(null);
    setNotice(message);
    void load();
  }

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push("/home/preview")}>
              {t.preview.link}
            </Button>
            <Button variant="secondary" onClick={() => router.push("/home/insights")}>
              {t.insightsLink}
            </Button>
            <Button onClick={() => setEditor({ mode: "create" })}>{t.newSection}</Button>
          </div>
        }
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button type="button" className="text-emerald-300 underline" onClick={() => setNotice(null)}>
                {t.dismiss}
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}

      <SectionCard
        title={t.cardTitle}
        description={
          state.status === "ready" ? t.countLabel.replace("{count}", String(sections.length)) : undefined
        }
        icon={<HomeIcon />}
      >
        {state.status === "loading" ? <SkeletonRows rows={4} /> : null}
        {state.status === "error" ? (
          <Alert
            tone="error"
            title={t.loadError}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {t.retry}
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}
        {state.status === "ready" && sections.length === 0 ? (
          <EmptyState
            tag={t.eyebrow}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<HomeIcon />}
            action={
              <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
                {t.emptyAction}
              </Button>
            }
          />
        ) : null}
        {state.status === "ready" && sections.length > 0 ? (
          <DataTable columns={columns} rows={sections} rowKey={(s) => s.id} caption={t.cardTitle} />
        ) : null}
      </SectionCard>

      {editor ? (
        <SectionEditor
          editor={editor}
          locale={locale}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}

function SectionEditor({
  editor,
  locale,
  onClose,
  onSaved,
}: {
  editor: NonNullable<Editor>;
  locale: HomeLocale;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const t = homeLabels(locale);
  const f = t.form;
  const isEdit = editor.mode === "edit";
  const section = isEdit ? editor.section : null;
  const [type, setType] = useState<HomeSectionType>(section?.type ?? "HERO_SLIDER");

  const cfg = (section?.config ?? {}) as Record<string, unknown>;
  const cfgSource = (cfg.source ?? {}) as Record<string, unknown>;
  const cfgParams = (cfgSource.params ?? {}) as Record<string, unknown>;

  const [title, setTitle] = useState(section?.title ?? "");
  const [subtitle, setSubtitle] = useState(section?.subtitle ?? "");
  const [enabled, setEnabled] = useState(section?.enabled ?? true);
  const [desktopVisible, setDesktopVisible] = useState(section?.desktopVisible ?? true);
  const [mobileVisible, setMobileVisible] = useState(section?.mobileVisible ?? true);
  const [autoplayMs, setAutoplayMs] = useState(cfg.autoplayMs != null ? String(cfg.autoplayMs) : "");
  const [layout, setLayout] = useState<string>((cfg.layout as string) ?? "CAROUSEL");
  const [maxItems, setMaxItems] = useState(cfg.maxItems != null ? String(cfg.maxItems) : "12");
  // TD-129 — RECENTLY_VIEWED TR/EN başlık (config'te; /home locale-agnostic kalsın diye storefront'ta seçilir).
  const [titleTr, setTitleTr] = useState((cfg.titleTr as string) ?? "");
  const [titleEn, setTitleEn] = useState((cfg.titleEn as string) ?? "");
  const [sourceKind, setSourceKind] = useState<string>((cfgSource.kind as string) ?? "MANUAL");
  const [rule, setRule] = useState<string>((cfgSource.rule as string) ?? "NEW_PRODUCTS");
  const [categorySlug, setCategorySlug] = useState((cfgParams.categorySlug as string) ?? "");
  const [brand, setBrand] = useState((cfgParams.brand as string) ?? "");
  const [attributeCode, setAttributeCode] = useState((cfgParams.attributeCode as string) ?? "");
  const [attributeValue, setAttributeValue] = useState((cfgParams.attributeValue as string) ?? "");
  // TODO-162 — Keşif config alanları. guest/authSupported varsayılan AÇIK (yalnız açıkça false ise kapalı).
  const [guestSupported, setGuestSupported] = useState(cfg.guestSupported !== false);
  const [authSupported, setAuthSupported] = useState(cfg.authSupported !== false);
  const [fallbackDisabled, setFallbackDisabled] = useState(cfg.fallbackDisabled === true);
  // EDITORIAL görsel: mediaId OTORİTATİF (kaydedilen), mediaItems yalnız önizleme (url). Böylece edit'te url
  // çözülemese bile mediaId korunur → mevcut görsel yanlışlıkla SİLİNMEZ. onAttach/onRemove ikisini de günceller.
  const [mediaId, setMediaId] = useState((cfg.mediaId as string) ?? "");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [bodyTr, setBodyTr] = useState((cfg.bodyTr as string) ?? "");
  const [bodyEn, setBodyEn] = useState((cfg.bodyEn as string) ?? "");
  const [ctaLabelTr, setCtaLabelTr] = useState((cfg.ctaLabelTr as string) ?? "");
  const [ctaLabelEn, setCtaLabelEn] = useState((cfg.ctaLabelEn as string) ?? "");
  const [ctaHref, setCtaHref] = useState((cfg.ctaHref as string) ?? "");
  const [linkedCampaignId, setLinkedCampaignId] = useState((cfg.linkedCampaignId as string) ?? "");
  const [gridCards, setGridCards] = useState<string[]>(
    Array.isArray(cfg.cards)
      ? (cfg.cards as Array<{ type?: unknown }>)
          .map((c) => c.type)
          .filter((value): value is string => typeof value === "string")
      : ["CONTINUE_BROWSING", "CART_RECOMMENDATIONS", "PERSONALIZED_DEALS", "DAILY_DEALS"],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit + EDITORIAL + mevcut mediaId → görselin url'ini `ids` çözüm moduyla getir (önizleme). Bir kez.
  useEffect(() => {
    if (type !== "EDITORIAL_CAMPAIGN" || !mediaId || mediaItems.length > 0) return;
    let active = true;
    void storeApi
      .listMedia({ ids: mediaId })
      .then((result) => {
        const asset = result.data.find((item) => item.id === mediaId);
        if (active && asset) setMediaItems([{ id: asset.id, url: asset.url, altText: asset.altText }]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // Yalnız açılışta (mediaId ilk değeri) çözülür; sonraki değişimler onAttach/onRemove ile yönetilir.
  }, []);

  function buildConfig(): Record<string, unknown> {
    if (type === "HERO_SLIDER") {
      const ms = Number.parseInt(autoplayMs, 10);
      return Number.isFinite(ms) && ms > 0 ? { autoplayMs: ms } : {};
    }
    if (type === "FEATURED_CATEGORIES") return {};
    if (type === "SPONSORED_SHOWCASE") {
      // İçerik AKTİF sponsorlu kampanyalardan (HOME_SHOWCASE) gelir; section yalnız sunum + slot tavanı.
      const maxS = Number.parseInt(maxItems, 10);
      return { layout, maxItems: Number.isFinite(maxS) ? Math.min(maxS, 12) : 8 };
    }
    if (type === "RECENTLY_VIEWED") {
      // TD-129 — İçerik ziyaretçi geçmişinden; section yalnız sunum (TR/EN başlık + maxItems + düzen).
      const maxR = Number.parseInt(maxItems, 10);
      return {
        layout,
        maxItems: Number.isFinite(maxR) ? Math.min(Math.max(maxR, 1), 50) : 12,
        titleTr: titleTr.trim() || null,
        titleEn: titleEn.trim() || null,
      };
    }
    // TODO-162 — Keşif rail'leri (içerik viewer-specific Katman B'de; yalnız sunum + görünürlük sınırları).
    if (isRailType(type)) {
      const maxD = Number.parseInt(maxItems, 10);
      return {
        layout,
        ...(Number.isFinite(maxD) ? { maxItems: Math.min(Math.max(maxD, 1), 12) } : {}),
        titleTr: titleTr.trim() || null,
        titleEn: titleEn.trim() || null,
        guestSupported,
        authSupported,
        fallbackDisabled,
      };
    }
    if (type === "DISCOVERY_GRID") {
      // Admin kartları SIRALAR; motor yalnız uygun olanları (max 4) gösterir. order = dizideki konum.
      return {
        titleTr: titleTr.trim() || null,
        titleEn: titleEn.trim() || null,
        guestSupported,
        authSupported,
        cards: gridCards.map((cardType, index) => ({ type: cardType, order: index })),
      };
    }
    if (type === "EDITORIAL_CAMPAIGN") {
      // İçerik tamamen config'ten; başlık + ctaHref zorunlu (eksikse gateway kartı gizler).
      return {
        mediaId: mediaId.trim() || null,
        titleTr: titleTr.trim() || null,
        titleEn: titleEn.trim() || null,
        bodyTr: bodyTr.trim() || null,
        bodyEn: bodyEn.trim() || null,
        ctaLabelTr: ctaLabelTr.trim() || null,
        ctaLabelEn: ctaLabelEn.trim() || null,
        ctaHref: ctaHref.trim() || null,
        linkedCampaignId: linkedCampaignId.trim() || null,
        guestSupported,
        authSupported,
      };
    }
    // PRODUCT_SHOWCASE
    const source =
      sourceKind === "MANUAL"
        ? { kind: "MANUAL" }
        : {
            kind: "DYNAMIC",
            rule,
            params: {
              ...(categorySlug ? { categorySlug } : {}),
              ...(brand ? { brand } : {}),
              ...(attributeCode ? { attributeCode } : {}),
              ...(attributeValue ? { attributeValue } : {}),
            },
          };
    const max = Number.parseInt(maxItems, 10);
    return { layout, maxItems: Number.isFinite(max) ? max : 12, source };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const config = buildConfig();
      if (isEdit && section) {
        await storeApi.updateHomeSection(section.id, {
          title: toNullable(title),
          subtitle: toNullable(subtitle),
          enabled,
          desktopVisible,
          mobileVisible,
          config,
        });
        onSaved(t.updatedToast);
      } else {
        const payload: HomeSectionCreateRequest = {
          type,
          title: toNullable(title),
          subtitle: toNullable(subtitle),
          enabled,
          desktopVisible,
          mobileVisible,
          config,
        };
        await storeApi.createHomeSection(payload);
        onSaved(t.createdToast);
      }
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  // TODO-162 — DISCOVERY_GRID kart sırası düzenleyici yardımcıları.
  const moveGridCard = (index: number, direction: -1 | 1) => {
    setGridCards((cards) => {
      const target = index + direction;
      if (target < 0 || target >= cards.length) return cards;
      const next = [...cards];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const removeGridCard = (index: number) => setGridCards((cards) => cards.filter((_, i) => i !== index));
  const addGridCard = (cardType: string) => setGridCards((cards) => (cards.length >= 5 ? cards : [...cards, cardType]));
  const availableGridCards = GRID_CARD_TYPES.filter((t) => !gridCards.includes(t));
  const bounds = DISCOVERY_BOUNDS[type];

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? f.editTitle : f.createTitle}
      closeLabel={t.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button type="submit" form="home-section-form" disabled={saving}>
            {saving ? t.saving : isEdit ? t.save : t.create}
          </Button>
        </>
      }
    >
      <form id="home-section-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}

        {isEdit ? (
          <p className="text-sm text-white/60">
            {f.typeLabel}: <span className="font-medium text-white/90">{t.types[type]}</span>
          </p>
        ) : (
          <Select
            id="home-type"
            label={f.typeLabel}
            value={type}
            onChange={(event) => setType(event.target.value as HomeSectionType)}
            disabled={saving}
            options={SECTION_TYPES.map((value) => ({ value, label: t.types[value] }))}
          />
        )}

        {/* TD-129/TODO-162 — RECENTLY_VIEWED + keşif tiplerinde başlık TR/EN config ile yönetilir (aşağıda);
            tek-dilli genel başlık/alt başlık bu tiplerde gizlenir. */}
        {!usesLocalizedTitle(type) ? (
          <>
            <Input
              id="home-title"
              label={f.titleLabel}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
            />
            <Input
              id="home-subtitle"
              label={f.subtitleLabel}
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              disabled={saving}
            />
          </>
        ) : null}

        <div className="flex flex-wrap gap-4">
          <Checkbox label={f.enabledLabel} checked={enabled} onChange={setEnabled} disabled={saving} />
          <Checkbox label={f.desktopVisibleLabel} checked={desktopVisible} onChange={setDesktopVisible} disabled={saving} />
          <Checkbox label={f.mobileVisibleLabel} checked={mobileVisible} onChange={setMobileVisible} disabled={saving} />
        </div>

        {type === "HERO_SLIDER" ? (
          <Input
            id="home-autoplay"
            type="number"
            label={f.autoplayLabel}
            value={autoplayMs}
            onChange={(event) => setAutoplayMs(event.target.value)}
            disabled={saving}
          />
        ) : null}

        {type === "SPONSORED_SHOWCASE" ? (
          <>
            <Alert tone="info">{f.sponsoredHint}</Alert>
            <Select
              id="home-layout-sp"
              label={f.layoutLabel}
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              disabled={saving}
              options={[
                { value: "GRID", label: f.layoutGrid },
                { value: "CAROUSEL", label: f.layoutCarousel },
              ]}
            />
            <Input
              id="home-max-sp"
              type="number"
              label={f.maxItemsLabel}
              value={maxItems}
              onChange={(event) => setMaxItems(event.target.value)}
              disabled={saving}
            />
          </>
        ) : null}

        {type === "RECENTLY_VIEWED" ? (
          <>
            <Alert tone="info">{f.recentlyViewedHint}</Alert>
            <Input
              id="home-rv-title-tr"
              label={f.titleTrLabel}
              value={titleTr}
              onChange={(event) => setTitleTr(event.target.value)}
              disabled={saving}
            />
            <Input
              id="home-rv-title-en"
              label={f.titleEnLabel}
              value={titleEn}
              onChange={(event) => setTitleEn(event.target.value)}
              disabled={saving}
            />
            <Select
              id="home-layout-rv"
              label={f.layoutLabel}
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              disabled={saving}
              options={[
                { value: "CAROUSEL", label: f.layoutCarousel },
                { value: "GRID", label: f.layoutGrid },
              ]}
            />
            <Input
              id="home-max-rv"
              type="number"
              label={f.maxItemsLabel}
              value={maxItems}
              onChange={(event) => setMaxItems(event.target.value)}
              disabled={saving}
            />
          </>
        ) : null}

        {type === "PRODUCT_SHOWCASE" ? (
          <>
            <Select
              id="home-layout"
              label={f.layoutLabel}
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              disabled={saving}
              options={[
                { value: "CAROUSEL", label: f.layoutCarousel },
                { value: "GRID", label: f.layoutGrid },
              ]}
            />
            <Input
              id="home-max"
              type="number"
              label={f.maxItemsLabel}
              value={maxItems}
              onChange={(event) => setMaxItems(event.target.value)}
              disabled={saving}
            />
            <Select
              id="home-source"
              label={f.sourceLabel}
              value={sourceKind}
              onChange={(e) => setSourceKind(e.target.value)}
              disabled={saving}
              options={[
                { value: "MANUAL", label: f.sourceManual },
                { value: "DYNAMIC", label: f.sourceDynamic },
              ]}
            />
            {sourceKind === "DYNAMIC" ? (
              <>
                <Select
                  id="home-rule"
                  label={f.ruleLabel}
                  value={rule}
                  onChange={(e) => setRule(e.target.value)}
                  disabled={saving}
                  options={Object.entries(f.rules).map(([value, label]) => ({ value, label }))}
                />
                {rule === "CATEGORY" ? (
                  <Input id="home-catslug" label={f.categorySlugLabel} value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} disabled={saving} />
                ) : null}
                {rule === "BRAND" ? (
                  <Input id="home-brand" label={f.brandLabel} value={brand} onChange={(e) => setBrand(e.target.value)} disabled={saving} />
                ) : null}
                {rule === "ATTRIBUTE" ? (
                  <>
                    <Input id="home-attrcode" label={f.attributeCodeLabel} value={attributeCode} onChange={(e) => setAttributeCode(e.target.value)} disabled={saving} />
                    <Input id="home-attrval" label={f.attributeValueLabel} value={attributeValue} onChange={(e) => setAttributeValue(e.target.value)} disabled={saving} />
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {/* TODO-162 — Keşif rail'leri: TR/EN başlık + düzen + tavan + görünürlük (içerik viewer-specific). */}
        {isRailType(type) ? (
          <>
            <Alert tone="info">{f.discoveryRailHint}</Alert>
            {bounds ? (
              <p className="text-xs text-white/50">
                {f.boundsHint.replace("{min}", String(bounds.min)).replace("{max}", String(bounds.max))}
                {bounds.requiresAuth ? ` ${f.boundsAuthOnly}` : ""}
                {bounds.fallbackAllowed ? ` ${f.boundsFallback}` : ""}
              </p>
            ) : null}
            <Input id="home-d-title-tr" label={f.titleTrLabel} value={titleTr} onChange={(e) => setTitleTr(e.target.value)} disabled={saving} />
            <Input id="home-d-title-en" label={f.titleEnLabel} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} disabled={saving} />
            <Select
              id="home-d-layout"
              label={f.layoutLabel}
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              disabled={saving}
              options={[
                { value: "CAROUSEL", label: f.layoutCarousel },
                { value: "GRID", label: f.layoutGrid },
              ]}
            />
            <Input id="home-d-max" type="number" label={f.maxItemsLabel} value={maxItems} onChange={(e) => setMaxItems(e.target.value)} disabled={saving} />
            <div className="flex flex-wrap gap-4">
              <Checkbox
                label={f.guestSupportedLabel}
                checked={guestSupported}
                onChange={setGuestSupported}
                disabled={saving || Boolean(bounds?.requiresAuth)}
              />
              <Checkbox label={f.authSupportedLabel} checked={authSupported} onChange={setAuthSupported} disabled={saving} />
            </div>
            {bounds?.fallbackAllowed ? (
              <Checkbox label={f.fallbackDisabledLabel} checked={fallbackDisabled} onChange={setFallbackDisabled} disabled={saving} />
            ) : null}
          </>
        ) : null}

        {/* TODO-162 — DISCOVERY_GRID: TR/EN başlık + kart sırası + görünürlük. Motor uygun 2-4 kartı gösterir. */}
        {type === "DISCOVERY_GRID" ? (
          <>
            <Alert tone="info">{f.discoveryGridHint}</Alert>
            <Input id="home-g-title-tr" label={f.titleTrLabel} value={titleTr} onChange={(e) => setTitleTr(e.target.value)} disabled={saving} />
            <Input id="home-g-title-en" label={f.titleEnLabel} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} disabled={saving} />
            <div className="space-y-2">
              <p className="text-sm text-white/70">{f.gridCardsLabel}</p>
              <p className="text-xs text-white/50">{f.gridCardsHint}</p>
              {gridCards.length === 0 ? (
                <p className="text-xs text-white/40">—</p>
              ) : (
                <ul className="space-y-1">
                  {gridCards.map((cardType, index) => (
                    <li key={`${cardType}-${index}`} className="flex items-center gap-2 rounded border border-white/10 px-3 py-2">
                      <span className="flex-1 text-sm text-white/80">
                        {index + 1}. {f.gridCardTypes[cardType] ?? cardType}
                      </span>
                      <Button variant="secondary" size="sm" type="button" aria-label={t.moveUp} disabled={saving || index === 0} onClick={() => moveGridCard(index, -1)}>
                        ↑
                      </Button>
                      <Button variant="secondary" size="sm" type="button" aria-label={t.moveDown} disabled={saving || index === gridCards.length - 1} onClick={() => moveGridCard(index, 1)}>
                        ↓
                      </Button>
                      <Button variant="secondary" size="sm" type="button" disabled={saving} onClick={() => removeGridCard(index)}>
                        {f.gridRemoveCard}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {availableGridCards.length > 0 && gridCards.length < 5 ? (
                <Select
                  id="home-g-add"
                  label={f.gridAddCard}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addGridCard(e.target.value);
                  }}
                  disabled={saving}
                  options={[{ value: "", label: "—" }, ...availableGridCards.map((c) => ({ value: c, label: f.gridCardTypes[c] ?? c }))]}
                />
              ) : null}
            </div>
            <div className="flex flex-wrap gap-4">
              <Checkbox label={f.guestSupportedLabel} checked={guestSupported} onChange={setGuestSupported} disabled={saving} />
              <Checkbox label={f.authSupportedLabel} checked={authSupported} onChange={setAuthSupported} disabled={saving} />
            </div>
          </>
        ) : null}

        {/* TODO-162 — EDITORIAL_CAMPAIGN: içerik tamamen config'ten (başlık + CTA zorunlu; eksikse gizlenir). */}
        {type === "EDITORIAL_CAMPAIGN" ? (
          <>
            <Alert tone="info">{f.editorialHint}</Alert>
            <Input id="home-e-title-tr" label={f.titleTrLabel} value={titleTr} onChange={(e) => setTitleTr(e.target.value)} disabled={saving} />
            <Input id="home-e-title-en" label={f.titleEnLabel} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} disabled={saving} />
            <Input id="home-e-body-tr" label={f.bodyTrLabel} value={bodyTr} onChange={(e) => setBodyTr(e.target.value)} disabled={saving} />
            <Input id="home-e-body-en" label={f.bodyEnLabel} value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} disabled={saving} />
            <Input id="home-e-cta-tr" label={f.ctaLabelTrLabel} value={ctaLabelTr} onChange={(e) => setCtaLabelTr(e.target.value)} disabled={saving} />
            <Input id="home-e-cta-en" label={f.ctaLabelEnLabel} value={ctaLabelEn} onChange={(e) => setCtaLabelEn(e.target.value)} disabled={saving} />
            <Input id="home-e-href" label={f.editorialCtaHrefLabel} value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} disabled={saving} placeholder="/products?category=..." />
            <div>
              <p className="mb-2 text-sm text-white/70">{f.editorialMediaIdLabel}</p>
              <MediaUpload
                context="HERO"
                mode="single"
                value={mediaItems}
                onAttach={(asset) => {
                  setMediaId(asset.id);
                  setMediaItems([{ id: asset.id, url: asset.url, altText: asset.altText }]);
                }}
                onRemove={() => {
                  setMediaId("");
                  setMediaItems([]);
                }}
                disabled={saving}
              />
            </div>
            <Input id="home-e-campaign" label={f.linkedCampaignIdLabel} value={linkedCampaignId} onChange={(e) => setLinkedCampaignId(e.target.value)} disabled={saving} />
            <div className="flex flex-wrap gap-4">
              <Checkbox label={f.guestSupportedLabel} checked={guestSupported} onChange={setGuestSupported} disabled={saving} />
              <Checkbox label={f.authSupportedLabel} checked={authSupported} onChange={setAuthSupported} disabled={saving} />
            </div>
          </>
        ) : null}
      </form>
    </Modal>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-white/70">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-emerald-400"
      />
      {label}
    </label>
  );
}
