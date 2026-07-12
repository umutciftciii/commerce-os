"use client";

/**
 * ADR-065 Faz 2 (Dilim 1) — Media yükleme + kütüphane bileşeni.
 *
 * store-admin'e özel; paylaşılan @commerce-os/ui'ye DOKUNMAZ. Sunum katmanı
 * (Alert/Spinner/Button/Modal/Badge) ui kit'ten gelir, upload/list mantığı burada.
 *
 * İki eylem sunar:
 *  - "Görsel yükle": native input[type=file] → storeApi.uploadMedia (multipart).
 *  - "Kütüphaneden seç": storeApi.listMedia(context) → var olan görseli TEKRAR
 *    yüklemeden bağlar (Zippo Siyah → Zippo Gümüş senaryosu).
 *
 * Kalıcılık bileşene ait DEĞİLDİR: yüklenen/seçilen görsel `onAttach` ile, kaldırma
 * `onRemove` ile, sıralama `onReorder` ile çağırana bildirilir. Böylece her ekran
 * kendi entity binding'ini (ProductImage/HeroSlide/StoreSettings/category) bağlar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaContext, MediaListResponse } from "@commerce-os/api-client";
import { getDictionary } from "@commerce-os/i18n";
import { Alert, Badge, Button, EmptyState, Modal, Spinner, cn, useLocale } from "./ui";
import { storeApi } from "../lib/client/api";
import { messageForError } from "../lib/client/messages";

/** Kütüphane/yükleme öğesinin sunumsal biçimi (mediaAssetSchema ile aynı). */
type MediaAsset = MediaListResponse["data"][number];

/** Çağıranın bağlı görselleri controlled olarak verdiği minimal biçim. */
export interface MediaItem {
  id: string;
  url: string;
  altText: string | null;
}

export interface MediaUploadProps {
  context: MediaContext;
  mode: "single" | "multiple";
  value: MediaItem[];
  /** Yeni yüklenen VEYA kütüphaneden seçilen görsel(ler) — ikisi de buradan gelir. */
  onAttach: (asset: MediaAsset) => void;
  /** Bir görselin bağını kopar (silme DEĞİL; kalıcılık çağırana ait). */
  onRemove: (id: string) => void;
  /** Yalnız `multiple`: yeni sıralama (görsel id'leri, kapak ilk). */
  onReorder?: (orderedIds: string[]) => void;
  disabled?: boolean;
  /**
   * ADR-065 (Faz 2/Dilim 4) — "Kütüphaneden seç" akışını aç/kapat (varsayılan açık).
   * `false` iken kütüphane butonu render EDİLMEZ ve modal hiç açılmaz; yalnız yükleme
   * kalır. Marka (logo/favicon) gibi tek `BRANDING` context'i paylaşan iki slotta,
   * bir slotun kütüphanesinde diğerinin görselinin görünmesini önlemek için kullanılır.
   */
  libraryEnabled?: boolean;
}

// Girdi whitelist'i backend ile aynı; çıktı sunucuda webp'e normalize edilir.
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// config.MEDIA_MAX_UPLOAD_BYTES varsayılanı (5 MB). Sunucu nihai otorite; bu yalnız
// erken/ucuz client-side elemedir.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function MediaUpload({
  context,
  mode,
  value,
  onAttach,
  onRemove,
  onReorder,
  disabled,
  libraryEnabled = true,
}: MediaUploadProps) {
  const locale = useLocale();
  const t = getDictionary(locale).storeAdmin.media;

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const isSingle = mode === "single";
  const busy = disabled || uploading;

  async function uploadOne(file: File): Promise<boolean> {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t.invalidTypeClient);
      return false;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t.tooLargeClient);
      return false;
    }
    try {
      const result = await storeApi.uploadMedia({ file, context });
      onAttach(result.data);
      return true;
    } catch (caught) {
      setError(messageForError(caught, locale));
      return false;
    }
  }

  async function onFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      // `single` modda yalnız ilki; `multiple` modda ardışık (backend files:1) yükleme.
      const chosen = isSingle ? [files[0]] : Array.from(files);
      for (const file of chosen) {
        const ok = await uploadOne(file);
        if (!ok) break;
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function move(index: number, direction: -1 | 1) {
    if (!onReorder) return;
    const next = [...value];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next.map((item) => item.id));
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert tone="error" action={
          <button type="button" className="text-red-300 underline" onClick={() => setError(null)}>
            {t.retry}
          </button>
        }>
          {error}
        </Alert>
      ) : null}

      {value.length > 0 ? (
        <ul className={cn("grid gap-3", isSingle ? "grid-cols-1 sm:max-w-xs" : "grid-cols-2 sm:grid-cols-3")}>
          {value.map((item, index) => (
            <li
              key={item.id}
              className="group relative overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.04]"
            >
              <img
                src={item.url}
                alt={item.altText ?? ""}
                className="aspect-square w-full object-cover"
              />
              {!isSingle && index === 0 ? (
                <span className="absolute left-1.5 top-1.5">
                  <Badge tone="brand">{t.coverBadge}</Badge>
                </span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/45 px-1.5 py-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                <div className="flex items-center gap-1">
                  {!isSingle && onReorder ? (
                    <>
                      <IconButton
                        label={t.moveUp}
                        disabled={busy || index === 0}
                        onClick={() => move(index, -1)}
                        d="M10 15V5M6 9l4-4 4 4"
                      />
                      <IconButton
                        label={t.moveDown}
                        disabled={busy || index === value.length - 1}
                        onClick={() => move(index, 1)}
                        d="M10 5v10M6 11l4 4 4-4"
                      />
                    </>
                  ) : null}
                </div>
                <IconButton
                  label={t.remove}
                  disabled={busy}
                  onClick={() => onRemove(item.id)}
                  d="M5 5l10 10M15 5L5 15"
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-white/30">{t.emptyHint}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || (isSingle && value.length > 0)}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Spinner size="sm" /> : null}
          {uploading ? t.uploading : t.uploadCta}
        </Button>
        {libraryEnabled ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || (isSingle && value.length > 0)}
            onClick={() => {
              setError(null);
              setLibraryOpen(true);
            }}
          >
            {t.libraryCta}
          </Button>
        ) : null}
        <span className="text-[11px] text-white/25">{t.maxSizeHint}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple={!isSingle}
        className="hidden"
        onChange={(event) => void onFilesChosen(event.target.files)}
      />

      {libraryEnabled && libraryOpen ? (
        <MediaLibraryModal
          context={context}
          attachedIds={new Set(value.map((item) => item.id))}
          labels={t}
          locale={locale}
          onClose={() => setLibraryOpen(false)}
          onSelect={(asset) => {
            onAttach(asset);
            if (isSingle) setLibraryOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  d,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  d: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/20 disabled:pointer-events-none disabled:opacity-40"
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
        <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function MediaLibraryModal({
  context,
  attachedIds,
  labels,
  locale,
  onClose,
  onSelect,
}: {
  context: MediaContext;
  attachedIds: Set<string>;
  labels: ReturnType<typeof getDictionary>["storeAdmin"]["media"];
  locale: ReturnType<typeof useLocale>;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; items: MediaAsset[] }
  >({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listMedia(context);
      setState({ status: "ready", items: result.data });
    } catch (caught) {
      setState({ status: "error", message: messageForError(caught, locale) });
    }
  }, [context, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Modal
      open
      onClose={onClose}
      title={labels.libraryTitle}
      description={labels.libraryDescription}
      closeLabel={labels.remove}
      className="max-w-2xl"
    >
      {state.status === "loading" ? <Spinner label={labels.libraryLoading} /> : null}

      {state.status === "error" ? (
        <Alert
          tone="error"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {labels.retry}
            </Button>
          }
        >
          {state.message}
        </Alert>
      ) : null}

      {state.status === "ready" && state.items.length === 0 ? (
        <EmptyState title={labels.libraryEmpty} />
      ) : null}

      {state.status === "ready" && state.items.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {state.items.map((item) => {
            const added = attachedIds.has(item.id);
            return (
              <li
                key={item.id}
                className="relative overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.04]"
              >
                <img src={item.url} alt={item.altText ?? ""} className="aspect-square w-full object-cover" />
                {added ? (
                  <span className="absolute left-1.5 top-1.5">
                    <Badge tone="neutral">{labels.alreadyAddedBadge}</Badge>
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={added}
                  onClick={() => onSelect(item)}
                  className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity hover:opacity-100 disabled:cursor-not-allowed"
                >
                  {!added ? (
                    <span className="rounded-md bg-indigo-500 px-2 py-1 text-[11px] font-semibold text-white">
                      {labels.selectAction}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Modal>
  );
}
