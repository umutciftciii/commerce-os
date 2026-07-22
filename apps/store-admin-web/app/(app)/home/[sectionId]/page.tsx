"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  SkeletonRows,
  Textarea,
  useLocale,
  type DataTableColumn,
} from "../../../../components/ui";
import type {
  HomeFeaturedCategory,
  HomeHeroSlide,
  HomeSection,
} from "@commerce-os/api-client";
import { HomeIcon } from "../../../../components/icons";
// TODO-159B (ADR-090) — Ürün/kategori seçimi ortak aranabilir seçiciye taşındı;
// bu ekran artık kataloğu belleğe ÇEKMEZ (eski hâlde yalnız ilk 25 kayıt görünüyordu).
import {
  EntitySelectorField,
  useCategorySelectorBinding,
  useProductSelectorBinding,
} from "../../../../components/selector";
import { MediaUpload, type MediaItem } from "../../../../components/media-upload";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { homeLabels, type HomeLocale } from "../labels";

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function HomeSectionDetailPage() {
  const locale = useLocale() as HomeLocale;
  const t = homeLabels(locale);
  const router = useRouter();
  const params = useParams<{ sectionId: string }>();
  const sectionId = params.sectionId;

  const [section, setSection] = useState<HomeSection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSection = useCallback(async () => {
    try {
      setSection(await storeApi.getHomeSection(sectionId));
    } catch (caught) {
      setError(messageForError(caught, locale));
    }
  }, [sectionId, locale]);

  useEffect(() => {
    void loadSection();
  }, [loadSection]);

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={section?.title ?? t.types[section?.type ?? ""] ?? t.title}
        description={section ? t.types[section.type] : undefined}
        actions={
          <Button variant="secondary" onClick={() => router.push("/home")}>
            {t.detail.back}
          </Button>
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

      {error ? <Alert tone="error">{error}</Alert> : null}

      {section?.type === "HERO_SLIDER" ? (
        <HeroSlidesManager sectionId={sectionId} locale={locale} onNotice={setNotice} />
      ) : null}
      {section?.type === "FEATURED_CATEGORIES" ? (
        <FeaturedCategoriesManager sectionId={sectionId} locale={locale} onNotice={setNotice} />
      ) : null}
      {section?.type === "PRODUCT_SHOWCASE" ? (
        <ShowcaseManager section={section} locale={locale} onNotice={setNotice} />
      ) : null}
    </>
  );
}

/* ─────────────────────────── HERO_SLIDER ─────────────────────────── */

type HeroEditor = { mode: "create" } | { mode: "edit"; slide: HomeHeroSlide } | null;

function HeroSlidesManager({
  sectionId,
  locale,
  onNotice,
}: {
  sectionId: string;
  locale: HomeLocale;
  onNotice: (message: string) => void;
}) {
  const t = homeLabels(locale);
  const d = t.detail;
  const [slides, setSlides] = useState<HomeHeroSlide[] | null>(null);
  const [editor, setEditor] = useState<HeroEditor>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await storeApi.listHomeHeroSlides(sectionId);
      setSlides(result.data);
    } catch (error) {
      onNotice(messageForError(error, locale));
    }
  }, [sectionId, locale, onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(slide: HomeHeroSlide, direction: -1 | 1) {
    if (!slides) return;
    const index = slides.findIndex((s) => s.id === slide.id);
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[index], next[target]] = [next[target], next[index]];
    setReordering(true);
    try {
      await storeApi.reorderHomeHeroSlides(sectionId, { orderedIds: next.map((s) => s.id) });
      await load();
    } catch (error) {
      onNotice(messageForError(error, locale));
    } finally {
      setReordering(false);
    }
  }

  async function remove(slide: HomeHeroSlide) {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await storeApi.deleteHomeHeroSlide(sectionId, slide.id);
      onNotice(d.removedToast);
      await load();
    } catch (error) {
      onNotice(messageForError(error, locale));
    }
  }

  const columns: DataTableColumn<HomeHeroSlide>[] = [
    {
      header: d.image,
      cell: (slide) => (
        <img src={slide.mediaUrl} alt={slide.headline ?? ""} className="h-10 w-16 rounded-md object-cover ring-1 ring-white/10" />
      ),
    },
    {
      header: d.headline,
      cell: (slide) =>
        slide.headline ? <span className="text-white/90">{slide.headline}</span> : <span className="text-white/35">—</span>,
    },
    {
      header: d.order,
      cell: (slide) => {
        const index = slides?.findIndex((s) => s.id === slide.id) ?? 0;
        return (
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" aria-label={t.moveUp} disabled={reordering || index <= 0} onClick={() => void move(slide, -1)}>↑</Button>
            <Button variant="secondary" size="sm" aria-label={t.moveDown} disabled={reordering || !slides || index === slides.length - 1} onClick={() => void move(slide, 1)}>↓</Button>
          </div>
        );
      },
    },
    {
      header: d.actions,
      align: "right",
      cell: (slide) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", slide })}>{d.edit}</Button>
          <Button variant="secondary" size="sm" onClick={() => void remove(slide)}>{d.remove}</Button>
        </div>
      ),
    },
  ];

  return (
    <SectionCard
      title={d.heroTitle}
      icon={<HomeIcon />}
      actions={<Button size="sm" onClick={() => setEditor({ mode: "create" })}>{d.heroAdd}</Button>}
    >
      {slides === null ? <SkeletonRows rows={3} /> : null}
      {slides !== null && slides.length === 0 ? (
        <EmptyState tag={d.heroTitle} title={d.heroEmpty} icon={<HomeIcon />} action={<Button size="sm" onClick={() => setEditor({ mode: "create" })}>{d.heroAdd}</Button>} />
      ) : null}
      {slides !== null && slides.length > 0 ? (
        <DataTable columns={columns} rows={slides} rowKey={(s) => s.id} caption={d.heroTitle} />
      ) : null}
      {editor ? (
        <HeroSlideEditor
          sectionId={sectionId}
          editor={editor}
          locale={locale}
          onClose={() => setEditor(null)}
          onSaved={(m) => {
            setEditor(null);
            onNotice(m);
            void load();
          }}
        />
      ) : null}
    </SectionCard>
  );
}

function HeroSlideEditor({
  sectionId,
  editor,
  locale,
  onClose,
  onSaved,
}: {
  sectionId: string;
  editor: NonNullable<HeroEditor>;
  locale: HomeLocale;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const t = homeLabels(locale);
  const d = t.detail;
  const isEdit = editor.mode === "edit";
  const slide = isEdit ? editor.slide : null;
  const [image, setImage] = useState<MediaItem[]>(
    slide ? [{ id: slide.mediaId, url: slide.mediaUrl, altText: null }] : [],
  );
  const [mobileImage, setMobileImage] = useState<MediaItem[]>(
    slide?.mobileMediaId && slide.mobileMediaUrl
      ? [{ id: slide.mobileMediaId, url: slide.mobileMediaUrl, altText: null }]
      : [],
  );
  const [headline, setHeadline] = useState(slide?.headline ?? "");
  const [subtext, setSubtext] = useState(slide?.subtext ?? "");
  const [ctaLabel, setCtaLabel] = useState(slide?.ctaLabel ?? "");
  const [ctaHref, setCtaHref] = useState(slide?.ctaHref ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const mediaId = image[0]?.id;
    if (!mediaId) {
      setError(d.imageRequired);
      return;
    }
    setSaving(true);
    const payload = {
      mediaId,
      mobileMediaId: mobileImage[0]?.id ?? null,
      headline: toNullable(headline),
      subtext: toNullable(subtext),
      ctaLabel: toNullable(ctaLabel),
      ctaHref: toNullable(ctaHref),
    };
    try {
      if (isEdit && slide) {
        await storeApi.updateHomeHeroSlide(sectionId, slide.id, payload);
      } else {
        await storeApi.createHomeHeroSlide(sectionId, payload);
      }
      onSaved(d.savedToast);
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? d.editSlideTitle : d.addSlideTitle}
      closeLabel={t.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{t.cancel}</Button>
          <Button type="submit" form="hero-slide-form" disabled={saving}>{saving ? t.saving : t.save}</Button>
        </>
      }
    >
      <form id="hero-slide-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-white/70">{d.imageLabel}</span>
          <MediaUpload context="HERO" mode="single" value={image} onAttach={(a) => setImage([{ id: a.id, url: a.url, altText: a.altText }])} onRemove={() => setImage([])} disabled={saving} />
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-white/70">{d.mobileImageLabel}</span>
          <MediaUpload context="HERO" mode="single" value={mobileImage} onAttach={(a) => setMobileImage([{ id: a.id, url: a.url, altText: a.altText }])} onRemove={() => setMobileImage([])} disabled={saving} />
        </div>
        <Input id="slide-headline" label={d.headlineLabel} value={headline} onChange={(e) => setHeadline(e.target.value)} disabled={saving} />
        <Textarea id="slide-subtext" label={d.subtextLabel} value={subtext} onChange={(e) => setSubtext(e.target.value)} disabled={saving} rows={2} />
        <Input id="slide-cta-label" label={d.ctaLabelLabel} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} disabled={saving} />
        <Input id="slide-cta-href" label={d.ctaHrefLabel} value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} disabled={saving} />
      </form>
    </Modal>
  );
}

/* ─────────────────────────── FEATURED_CATEGORIES ─────────────────────────── */

type FeatEditor = { mode: "create" } | { mode: "edit"; entry: HomeFeaturedCategory } | null;

function FeaturedCategoriesManager({
  sectionId,
  locale,
  onNotice,
}: {
  sectionId: string;
  locale: HomeLocale;
  onNotice: (message: string) => void;
}) {
  const t = homeLabels(locale);
  const d = t.detail;
  const [entries, setEntries] = useState<HomeFeaturedCategory[] | null>(null);
  const [editor, setEditor] = useState<FeatEditor>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await storeApi.listHomeFeaturedCategories(sectionId);
      setEntries(list.data);
    } catch (error) {
      onNotice(messageForError(error, locale));
    }
  }, [sectionId, locale, onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(entry: HomeFeaturedCategory, direction: -1 | 1) {
    if (!entries) return;
    const index = entries.findIndex((e) => e.id === entry.id);
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[index], next[target]] = [next[target], next[index]];
    setReordering(true);
    try {
      await storeApi.reorderHomeFeaturedCategories(sectionId, { orderedIds: next.map((e) => e.id) });
      await load();
    } catch (error) {
      onNotice(messageForError(error, locale));
    } finally {
      setReordering(false);
    }
  }

  async function remove(entry: HomeFeaturedCategory) {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await storeApi.deleteHomeFeaturedCategory(sectionId, entry.id);
      onNotice(d.removedToast);
      await load();
    } catch (error) {
      onNotice(messageForError(error, locale));
    }
  }

  const columns: DataTableColumn<HomeFeaturedCategory>[] = [
    { header: d.categoryLabel, cell: (e) => <span className="text-white/90">{e.titleOverride ?? e.categoryName}</span> },
    {
      header: d.order,
      cell: (entry) => {
        const index = entries?.findIndex((e) => e.id === entry.id) ?? 0;
        return (
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" aria-label={t.moveUp} disabled={reordering || index <= 0} onClick={() => void move(entry, -1)}>↑</Button>
            <Button variant="secondary" size="sm" aria-label={t.moveDown} disabled={reordering || !entries || index === entries.length - 1} onClick={() => void move(entry, 1)}>↓</Button>
          </div>
        );
      },
    },
    {
      header: d.actions,
      align: "right",
      cell: (entry) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", entry })}>{d.edit}</Button>
          <Button variant="secondary" size="sm" onClick={() => void remove(entry)}>{d.remove}</Button>
        </div>
      ),
    },
  ];

  return (
    <SectionCard
      title={d.featuredTitle}
      icon={<HomeIcon />}
      actions={<Button size="sm" onClick={() => setEditor({ mode: "create" })}>{d.featuredAdd}</Button>}
    >
      {entries === null ? <SkeletonRows rows={3} /> : null}
      {entries !== null && entries.length === 0 ? (
        <EmptyState tag={d.featuredTitle} title={d.featuredEmpty} icon={<HomeIcon />} action={<Button size="sm" onClick={() => setEditor({ mode: "create" })}>{d.featuredAdd}</Button>} />
      ) : null}
      {entries !== null && entries.length > 0 ? (
        <DataTable columns={columns} rows={entries} rowKey={(e) => e.id} caption={d.featuredTitle} />
      ) : null}
      {editor ? (
        <FeaturedCategoryEditor
          sectionId={sectionId}
          editor={editor}
          locale={locale}
          onClose={() => setEditor(null)}
          onSaved={(m) => {
            setEditor(null);
            onNotice(m);
            void load();
          }}
        />
      ) : null}
    </SectionCard>
  );
}

function FeaturedCategoryEditor({
  sectionId,
  editor,
  locale,
  onClose,
  onSaved,
}: {
  sectionId: string;
  editor: NonNullable<FeatEditor>;
  locale: HomeLocale;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const t = homeLabels(locale);
  const d = t.detail;
  const isEdit = editor.mode === "edit";
  const entry = isEdit ? editor.entry : null;
  // TODO-159B (ADR-090) — Tekli seçici: değer dizi olarak tutulur (tek kod yolu).
  const categorySelector = useCategorySelectorBinding(locale);
  const toMessage = useCallback((error: unknown) => messageForError(error, locale), [locale]);
  const [categoryIds, setCategoryIds] = useState<string[]>(entry ? [entry.categoryId] : []);
  const categoryId = categoryIds[0] ?? "";
  const [image, setImage] = useState<MediaItem[]>(
    entry?.imageMediaId && entry.imageUrl ? [{ id: entry.imageMediaId, url: entry.imageUrl, altText: null }] : [],
  );
  const [titleOverride, setTitleOverride] = useState(entry?.titleOverride ?? "");
  const [descOverride, setDescOverride] = useState(entry?.descriptionOverride ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && entry) {
        await storeApi.updateHomeFeaturedCategory(sectionId, entry.id, {
          imageMediaId: image[0]?.id ?? null,
          titleOverride: toNullable(titleOverride),
          descriptionOverride: toNullable(descOverride),
        });
      } else {
        if (!categoryId) {
          setError(d.categoryRequired);
          setSaving(false);
          return;
        }
        await storeApi.createHomeFeaturedCategory(sectionId, {
          categoryId,
          imageMediaId: image[0]?.id ?? null,
          titleOverride: toNullable(titleOverride),
          descriptionOverride: toNullable(descOverride),
        });
      }
      onSaved(d.savedToast);
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? d.editCategoryTitle : d.addCategoryTitle}
      closeLabel={t.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{t.cancel}</Button>
          <Button type="submit" form="featured-form" disabled={saving}>{saving ? t.saving : t.save}</Button>
        </>
      }
    >
      <form id="featured-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {isEdit ? (
          <p className="text-sm text-white/60">{d.categoryLabel}: <span className="font-medium text-white/90">{entry?.categoryName}</span></p>
        ) : (
          <EntitySelectorField
            label={d.categoryLabel}
            multiple={false}
            value={categoryIds}
            onChange={setCategoryIds}
            source={categorySelector.source}
            presenter={categorySelector.presenter}
            labels={categorySelector.labels}
            toMessage={toMessage}
            modalTitle={categorySelector.title}
            modalDescription={categorySelector.description}
            disabled={saving}
          />
        )}
        <Input id="featured-title" label={d.titleOverrideLabel} value={titleOverride} onChange={(e) => setTitleOverride(e.target.value)} disabled={saving} />
        <Textarea id="featured-desc" label={d.descriptionOverrideLabel} value={descOverride} onChange={(e) => setDescOverride(e.target.value)} disabled={saving} rows={2} />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-white/70">{d.imageLabel}</span>
          <MediaUpload context="CATEGORY" mode="single" value={image} onAttach={(a) => setImage([{ id: a.id, url: a.url, altText: a.altText }])} onRemove={() => setImage([])} disabled={saving} />
        </div>
      </form>
    </Modal>
  );
}

/* ─────────────────────────── PRODUCT_SHOWCASE (manuel) ─────────────────────────── */

function ShowcaseManager({
  section,
  locale,
  onNotice,
}: {
  section: HomeSection;
  locale: HomeLocale;
  onNotice: (message: string) => void;
}) {
  const t = homeLabels(locale);
  const d = t.detail;
  const source = ((section.config as Record<string, unknown>).source ?? {}) as Record<string, unknown>;
  const isManual = source.kind !== "DYNAMIC";

  const [selected, setSelected] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  // TODO-159B (ADR-090) — Katalog artık belleğe alınmaz. Pinler `ids` çözüm
  // moduyla ayrıca getirildiği için 25/100 sınırının ötesindeki ürün de görünür
  // ve KALDIRILABİLİR (eskiden görünmüyor, dolayısıyla kaldırılamıyordu).
  const productSelector = useProductSelectorBinding(locale);
  const toMessage = useCallback((error: unknown) => messageForError(error, locale), [locale]);

  const load = useCallback(async () => {
    try {
      const current = await storeApi.listHomeShowcaseProducts(section.id);
      setSelected(current.data.map((p) => p.productId));
      setReady(true);
    } catch (error) {
      onNotice(messageForError(error, locale));
    }
  }, [section.id, locale, onNotice]);

  useEffect(() => {
    if (isManual) void load();
    else setReady(true);
  }, [isManual, load]);

  async function save() {
    setSaving(true);
    try {
      await storeApi.setHomeShowcaseProducts(section.id, { productIds: selected });
      onNotice(d.savedToast);
    } catch (error) {
      onNotice(messageForError(error, locale));
    } finally {
      setSaving(false);
    }
  }

  if (!isManual) {
    return (
      <SectionCard title={d.showcaseTitle} icon={<HomeIcon />}>
        <Alert tone="info">{d.showcaseDynamicInfo}</Alert>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={d.showcaseTitle}
      description={`${selected.length} ${d.selected}`}
      icon={<HomeIcon />}
      actions={<Button size="sm" onClick={() => void save()} disabled={saving || !ready}>{saving ? t.saving : d.showcaseSave}</Button>}
    >
      {!ready ? <SkeletonRows rows={4} /> : null}
      {ready ? (
        <EntitySelectorField
          label={d.productPickerLabel}
          hint={d.showcaseOrderHint}
          multiple
          value={selected}
          onChange={setSelected}
          source={productSelector.source}
          presenter={productSelector.presenter}
          labels={productSelector.labels}
          toMessage={toMessage}
          modalTitle={productSelector.title}
          modalDescription={productSelector.description}
          disabled={saving}
        />
      ) : null}
    </SectionCard>
  );
}
