"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@commerce-os/ui";

/**
 * TODO-169 — İade fotoğrafı yükleme kontrolü (editoryel kit, istemci).
 *
 * Akış (ADR-269 §8): seçilen File hemen `URL.createObjectURL` ile YEREL önizlenir;
 * `onUpload(file)` sunucu action'ı yalnız `{ mediaId }` döner (attachment PRIVATE'tır,
 * geri fetch EDİLMEZ). Yüklenen mediaId'ler `onChange` ile yukarı bildirilir; iade
 * talebi gövdesinde `attachmentMediaIds` olarak taşınır.
 *
 * Erişilebilirlik (§18): görünür etiketli tetikleyici buton (native input gizli ama
 * klavye/label ile ulaşılır), her önizlemede erişilebilir "kaldır" düğmesi, hata metni
 * `role`'süz ama görünür + renk-dışı; "kişisel veri eklemeyin" uyarısı daima görünür.
 * Yükleme durumu metinle (yükleniyor/başarısız) taşınır, salt renkle değil.
 */
export type PhotoUploadResult = { ok: true; mediaId: string } | { ok: false };

interface PhotoItem {
  key: string;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  mediaId?: string;
}

export interface PhotoUploadLabels {
  addPhoto: string;
  uploading: string;
  failed: string;
  remove: string;
  privacyWarning: string;
  limitReached: string;
  invalidType: string;
  tooLarge: string;
}

// Gateway yalnız JPEG/PNG/WebP kabul eder (ADR-269 §8 pipeline); istemci de aynı sınırı uygular.
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5_242_880; // 5 MB — gateway MAX_ATTACHMENT_BYTES ile bire bir.

export function PhotoUpload({
  onUpload,
  onChange,
  labels,
  max = 6,
  disabled = false,
  describedById,
}: {
  onUpload: (file: File) => Promise<PhotoUploadResult>;
  /** Başarıyla yüklenmiş mediaId listesi değiştikçe çağrılır. */
  onChange: (mediaIds: string[]) => void;
  labels: PhotoUploadLabels;
  max?: number;
  disabled?: boolean;
  /** Tetikleyiciye bağlanacak yardım metni id'si (aria-describedby). */
  describedById?: string;
}) {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const warnId = useId();

  // Kaydırılan/kaldırılan önizleme URL'lerini serbest bırak (bellek sızıntısı yok).
  useEffect(() => {
    return () => {
      setItems((current) => {
        for (const item of current) URL.revokeObjectURL(item.previewUrl);
        return current;
      });
    };
  }, []);

  function publish(next: PhotoItem[]) {
    onChange(next.filter((i) => i.status === "done" && i.mediaId).map((i) => i.mediaId as string));
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    const remaining = max - items.length;
    const files = Array.from(fileList).slice(0, Math.max(0, remaining));
    if (Array.from(fileList).length > remaining) setError(labels.limitReached);

    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) {
        setError(labels.invalidType);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(labels.tooLarge);
        continue;
      }
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);
      const pending: PhotoItem = { key, previewUrl, status: "uploading" };
      setItems((prev) => [...prev, pending]);

      const result = await onUpload(file);
      setItems((prev) => {
        const next = prev.map((item) =>
          item.key === key
            ? result.ok
              ? { ...item, status: "done" as const, mediaId: result.mediaId }
              : { ...item, status: "error" as const }
            : item,
        );
        publish(next);
        return next;
      });
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const target = prev.find((i) => i.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((i) => i.key !== key);
      publish(next);
      return next;
    });
  }

  const atLimit = items.length >= max;

  return (
    <div className="space-y-2">
      <p id={warnId} className="text-[11px] leading-relaxed text-ink-subtle">
        {labels.privacyWarning}
      </p>

      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.key} className="relative h-20 w-20 border border-line bg-surface-muted">
              {/* Yerel önizleme (blob) — private attachment geri fetch EDİLMEZ. */}
              <img
                src={item.previewUrl}
                alt=""
                className={cn(
                  "h-full w-full object-cover",
                  item.status !== "done" && "opacity-50",
                )}
              />
              {item.status === "uploading" ? (
                <span className="absolute inset-0 flex items-center justify-center bg-surface/70 text-[10px] uppercase tracking-wideish text-ink-muted">
                  {labels.uploading}
                </span>
              ) : null}
              {item.status === "error" ? (
                <span className="absolute inset-0 flex items-center justify-center bg-red-50/80 px-1 text-center text-[10px] uppercase tracking-wideish text-red-700">
                  {labels.failed}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => removeItem(item.key)}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center border border-ink bg-surface text-xs leading-none text-ink hover:bg-ink hover:text-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={labels.remove}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="sr-only"
          disabled={disabled || atLimit}
          onChange={(event) => void handleFiles(event.target.files)}
          aria-describedby={[warnId, describedById].filter(Boolean).join(" ") || undefined}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex h-9 cursor-pointer items-center border border-ink px-4 text-[11px] font-medium uppercase tracking-wideish text-ink transition-colors hover:bg-ink hover:text-surface",
            (disabled || atLimit) && "pointer-events-none opacity-40",
          )}
        >
          {labels.addPhoto}
        </label>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
