"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
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
  SkeletonRows,
  Textarea,
  useLocale,
  type DataTableColumn,
} from "../../../components/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type { HeroSlide, HeroSlideCreateRequest } from "@commerce-os/api-client";
import { HomeIcon } from "../../../components/icons";
import { MediaUpload, type MediaItem } from "../../../components/media-upload";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type HeroStatus = HeroSlide["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; slides: HeroSlide[] };
type Editor = { mode: "create" } | { mode: "edit"; slide: HeroSlide } | null;

// Bu checkpoint'te slide'lar hep DRAFT ile olusur; yayin gecisi ayri checkpoint.
// Rozet yine de iki durumu da temsil eder (ileriye donuk).
const STATUS_TONES: Record<HeroStatus, "success" | "neutral"> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
};

// Bos metin alanlarini null'a indirger (backend null = temizle). trim'li.
function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function HeroPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.hero;
  const c = dict.common;
  const statusLabels = t.statusLabels as Record<HeroStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listHeroSlides();
      setState({ status: "ready", slides: result.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const slides = state.status === "ready" ? state.slides : [];

  async function handleDelete(slide: HeroSlide) {
    // R5: yalniz slide kaydi silinir; gorselin kendisi silinmez (uyari kopyada).
    if (!window.confirm(t.deleteConfirm)) return;
    setDeletingId(slide.id);
    try {
      await storeApi.deleteHeroSlide(slide.id);
      setNotice(t.deletedToast);
      await load();
    } catch (error) {
      setNotice(messageForError(error, locale));
    } finally {
      setDeletingId(null);
    }
  }

  // Checkpoint B — komsu slide ile yer degistirip tam sirali id listesini gonderir;
  // sunucu position=index yazar. F4C dersi: finally'de reordering=false.
  async function handleMove(slide: HeroSlide, direction: -1 | 1) {
    const index = slides.findIndex((item) => item.id === slide.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[index], next[target]] = [next[target], next[index]];
    setReordering(true);
    try {
      await storeApi.reorderHeroSlides({ orderedIds: next.map((item) => item.id) });
      await load();
    } catch (error) {
      setNotice(messageForError(error, locale));
    } finally {
      setReordering(false);
    }
  }

  // Checkpoint C — yayin durumunu tersine cevirir (DRAFT<->PUBLISHED).
  async function handleToggleStatus(slide: HeroSlide) {
    setStatusChangingId(slide.id);
    try {
      if (slide.status === "PUBLISHED") {
        await storeApi.unpublishHeroSlide(slide.id);
      } else {
        await storeApi.publishHeroSlide(slide.id);
      }
      await load();
    } catch (error) {
      setNotice(messageForError(error, locale));
    } finally {
      setStatusChangingId(null);
    }
  }

  const columns: DataTableColumn<HeroSlide>[] = [
    {
      header: t.table.image,
      cell: (slide) => (
        // Duz <img>: mediaUrl gateway'den turetilir (goreli /media/* web app'te
        // Next rewrite ile proxy'lenir). Kucuk onizleme.
        <img
          src={slide.mediaUrl}
          alt={slide.headline ?? ""}
          className="h-10 w-16 rounded-md object-cover ring-1 ring-white/10"
        />
      ),
    },
    {
      header: t.table.headline,
      cell: (slide) =>
        slide.headline ? (
          <span className="font-medium text-white/90">{slide.headline}</span>
        ) : (
          <span className="text-white/35">{t.noHeadline}</span>
        ),
    },
    {
      header: t.table.status,
      cell: (slide) => <Badge tone={STATUS_TONES[slide.status]}>{statusLabels[slide.status]}</Badge>,
    },
    {
      header: t.table.order,
      cell: (slide) => {
        const index = slides.findIndex((item) => item.id === slide.id);
        return (
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              aria-label={t.moveUp}
              disabled={reordering || index <= 0}
              onClick={() => void handleMove(slide, -1)}
            >
              ↑
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={t.moveDown}
              disabled={reordering || index === slides.length - 1}
              onClick={() => void handleMove(slide, 1)}
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
      cell: (slide) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={statusChangingId === slide.id}
            onClick={() => void handleToggleStatus(slide)}
          >
            {slide.status === "PUBLISHED" ? t.unpublishAction : t.publishAction}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", slide })}>
            {t.editAction}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleDelete(slide)}
            disabled={deletingId === slide.id}
          >
            {t.deleteAction}
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
        actions={<Button onClick={() => setEditor({ mode: "create" })}>{t.newSlide}</Button>}
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button
                type="button"
                className="text-emerald-300 underline"
                onClick={() => setNotice(null)}
              >
                {c.actions.dismiss}
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
          state.status === "ready" ? format(t.countLabel, { count: slides.length }) : t.cardDescription
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
                {c.actions.retry}
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}

        {state.status === "ready" && slides.length === 0 ? (
          <EmptyState
            tag={t.emptyTag}
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

        {state.status === "ready" && slides.length > 0 ? (
          <DataTable
            columns={columns}
            rows={slides}
            rowKey={(slide) => slide.id}
            caption={t.cardTitle}
          />
        ) : null}
      </SectionCard>

      {editor ? (
        <HeroEditor editor={editor} onClose={() => setEditor(null)} onSaved={onSaved} />
      ) : null}
    </>
  );
}

function HeroEditor({
  editor,
  onClose,
  onSaved,
}: {
  editor: NonNullable<Editor>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.hero;
  const c = dict.common;
  const f = t.form;
  const isEdit = editor.mode === "edit";

  // ADR-065 (Faz 2/Dilim 5) — MediaUpload single mode value[] bekler; edit'te mevcut
  // gorsel (mediaId+mediaUrl) ile baslar, create'te bos. R6: gorsel ZORUNLU.
  const [image, setImage] = useState<MediaItem[]>(
    isEdit ? [{ id: editor.slide.mediaId, url: editor.slide.mediaUrl, altText: null }] : [],
  );
  const [headline, setHeadline] = useState(isEdit ? (editor.slide.headline ?? "") : "");
  const [subtext, setSubtext] = useState(isEdit ? (editor.slide.subtext ?? "") : "");
  const [ctaLabel, setCtaLabel] = useState(isEdit ? (editor.slide.ctaLabel ?? "") : "");
  const [ctaHref, setCtaHref] = useState(isEdit ? (editor.slide.ctaHref ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const mediaId = image[0]?.id;
    if (!mediaId) {
      // R6: hero gorselsiz var olamaz.
      setError(f.imageRequired);
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        // status/startsAt/endsAt bu checkpoint'te UI'dan yonetilmez (Faz 4).
        await storeApi.updateHeroSlide(editor.slide.id, {
          mediaId,
          headline: toNullable(headline),
          subtext: toNullable(subtext),
          ctaLabel: toNullable(ctaLabel),
          ctaHref: toNullable(ctaHref),
        });
        onSaved(t.updatedToast);
      } else {
        // status gonderilmez → sunucu default DRAFT.
        const payload: HeroSlideCreateRequest = {
          mediaId,
          headline: toNullable(headline),
          subtext: toNullable(subtext),
          ctaLabel: toNullable(ctaLabel),
          ctaHref: toNullable(ctaHref),
        };
        await storeApi.createHeroSlide(payload);
        onSaved(t.createdToast);
      }
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? f.editTitle : f.createTitle}
      description={isEdit ? f.editSubtitle : f.createSubtitle}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {c.actions.cancel}
          </Button>
          <Button type="submit" form="hero-form" disabled={saving}>
            {saving ? c.states.saving : isEdit ? f.submitEdit : f.submitCreate}
          </Button>
        </>
      }
    >
      <form id="hero-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-white/70">{f.imageLabel}</span>
          <MediaUpload
            context="HERO"
            mode="single"
            value={image}
            onAttach={(asset) => setImage([{ id: asset.id, url: asset.url, altText: asset.altText }])}
            onRemove={() => setImage([])}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-white/30">{f.imageHint}</p>
        </div>
        <Input
          id="hero-headline"
          label={f.headlineLabel}
          placeholder={f.headlinePlaceholder}
          value={headline}
          onChange={(event) => setHeadline(event.target.value)}
          disabled={saving}
        />
        <Textarea
          id="hero-subtext"
          label={f.subtextLabel}
          placeholder={f.subtextPlaceholder}
          value={subtext}
          onChange={(event) => setSubtext(event.target.value)}
          disabled={saving}
          rows={2}
        />
        <Input
          id="hero-cta-label"
          label={f.ctaLabelLabel}
          placeholder={f.ctaLabelPlaceholder}
          value={ctaLabel}
          onChange={(event) => setCtaLabel(event.target.value)}
          disabled={saving}
        />
        <Input
          id="hero-cta-href"
          label={f.ctaHrefLabel}
          placeholder={f.ctaHrefPlaceholder}
          value={ctaHref}
          onChange={(event) => setCtaHref(event.target.value)}
          disabled={saving}
        />
      </form>
    </Modal>
  );
}
