"use client";

// Faz 2B (TODO-146) — Tek attribute alanının render'ı. Switch-case cehenneminden
// kaçınmak için dataType → "widget kind" → bileşen registry deseni kullanılır
// (TODO-146 md.5). Her widget YALNIZ kontrolü döndürür; etiket + zorunlu işareti +
// yardım metni + hata AttributeField sarmalayıcısında tek yerde yönetilir.

import { useEffect, useState, type ReactNode } from "react";
import { Input, Select, Textarea } from "../../../../components/ui";
import { MediaUpload, type MediaItem } from "../../../../components/media-upload";
import { storeApi } from "../../../../lib/client/api";
import type { AttributeDataType, MediaContext } from "@commerce-os/api-client";
import { isMediaType, type AttributeInputValue, type ResolvedAttribute } from "./types";

type WidgetKind =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "color"
  | "multiselect"
  | "media";

const WIDGET_BY_TYPE: Record<AttributeDataType, WidgetKind> = {
  TEXT: "text",
  URL: "text",
  TEXTAREA: "textarea",
  RICH_TEXT: "textarea", // Faz 2B: zengin editör YOK; düz textarea (TECH_DEBT).
  INTEGER: "number",
  DECIMAL: "number",
  BOOLEAN: "boolean",
  DATE: "date",
  SELECT: "select",
  COLOR: "color",
  MULTI_SELECT: "multiselect",
  IMAGE: "media",
  FILE: "media",
};

export interface WidgetProps {
  attr: ResolvedAttribute;
  value: AttributeInputValue;
  onChange: (value: AttributeInputValue) => void;
  disabled?: boolean;
  invalid: boolean;
  fieldId: string;
  placeholder?: string;
  chooseFromLibraryLabel?: string;
  uploadLabel?: string;
}

export interface AttributeFieldProps {
  attr: ResolvedAttribute;
  value: AttributeInputValue;
  onChange: (value: AttributeInputValue) => void;
  disabled?: boolean;
  error?: string;
  requiredHint: string;
  optionalHint: string;
}

/** Etiket + zorunlu/opsiyonel işareti + kontrol + yardım/hata sarmalayıcı. */
export function AttributeField({
  attr,
  value,
  onChange,
  disabled,
  error,
  requiredHint,
  optionalHint,
}: AttributeFieldProps) {
  const kind = WIDGET_BY_TYPE[attr.dataType];
  const Widget = WIDGETS[kind];
  const fieldId = `attribute-${attr.attributeDefinitionId}`;
  const invalid = Boolean(error);
  const placeholder = attr.rules.placeholder;
  const helper = attr.rules.helperText ?? attr.description ?? undefined;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <label
          htmlFor={fieldId}
          className="text-[11px] font-semibold uppercase tracking-wide text-white/35"
        >
          {attr.name}
          {attr.unit ? <span className="ml-1 normal-case text-white/25">({attr.unit})</span> : null}
        </label>
        <span
          className={`text-[10px] font-medium ${attr.required ? "text-rose-300/80" : "text-white/25"}`}
        >
          {attr.required ? requiredHint : optionalHint}
        </span>
      </div>
      <Widget
        attr={attr}
        value={value}
        onChange={onChange}
        disabled={disabled}
        invalid={invalid}
        fieldId={fieldId}
        placeholder={placeholder}
      />
      {error ? (
        <p role="alert" className="mt-1 text-xs text-rose-300">
          {error}
        </p>
      ) : helper ? (
        <p className="mt-1 text-xs text-white/30">{helper}</p>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Widgets ─────────────────────────── */

function invalidClass(invalid: boolean): string {
  return invalid ? "border-rose-400/60 focus:border-rose-400/60 focus:ring-rose-400/20" : "";
}

function TextWidget({ attr, value, onChange, disabled, invalid, fieldId, placeholder }: WidgetProps) {
  return (
    <Input
      id={fieldId}
      type={attr.dataType === "URL" ? "url" : "text"}
      value={typeof value === "string" ? value : ""}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      maxLength={attr.rules.maxLength}
      className={invalidClass(invalid)}
      aria-invalid={invalid || undefined}
    />
  );
}

function TextareaWidget({ attr, value, onChange, disabled, invalid, fieldId, placeholder }: WidgetProps) {
  return (
    <Textarea
      id={fieldId}
      rows={3}
      value={typeof value === "string" ? value : ""}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      maxLength={attr.rules.maxLength}
      className={invalidClass(invalid)}
      aria-invalid={invalid || undefined}
    />
  );
}

function NumberWidget({ attr, value, onChange, disabled, invalid, fieldId, placeholder }: WidgetProps) {
  const step = attr.dataType === "INTEGER" ? 1 : (attr.rules.step ?? "any");
  return (
    <Input
      id={fieldId}
      type="number"
      inputMode={attr.dataType === "INTEGER" ? "numeric" : "decimal"}
      value={typeof value === "string" ? value : ""}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      min={attr.rules.min}
      max={attr.rules.max}
      step={step}
      className={invalidClass(invalid)}
      aria-invalid={invalid || undefined}
    />
  );
}

function DateWidget({ value, onChange, disabled, invalid, fieldId }: WidgetProps) {
  return (
    <Input
      id={fieldId}
      type="date"
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={invalidClass(invalid)}
      aria-invalid={invalid || undefined}
    />
  );
}

function BooleanWidget({ value, onChange, disabled, fieldId }: WidgetProps) {
  // Ad, AttributeField'ın üst etiketinde (htmlFor=fieldId) gösterilir; burada tekrar
  // edilmez. Üst etikete tıklamak da onay-kutusunu değiştirir.
  const checked = value === true;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        checked ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200" : "border-white/10 text-white/50"
      }`}
    >
      <input
        id={fieldId}
        type="checkbox"
        className="h-3.5 w-3.5 accent-indigo-500"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
    </span>
  );
}

function SelectWidget({ attr, value, onChange, disabled, invalid, fieldId, placeholder }: WidgetProps) {
  const options = [
    { value: "", label: placeholder ?? "—" },
    ...attr.options.map((option) => ({ value: option.id, label: option.label })),
  ];
  return (
    <Select
      id={fieldId}
      options={options}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={invalidClass(invalid)}
      aria-invalid={invalid || undefined}
    />
  );
}

function ColorWidget({ attr, value, onChange, disabled }: WidgetProps) {
  const selected = typeof value === "string" ? value : "";
  return (
    <div className="flex flex-wrap gap-2">
      {attr.options.map((option) => {
        const isSelected = option.id === selected;
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            title={option.label}
            onClick={() => onChange(isSelected ? "" : option.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              isSelected
                ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-100"
                : "border-white/10 text-white/60"
            }`}
          >
            <span
              aria-hidden
              className="h-3.5 w-3.5 rounded-full border border-white/20"
              style={{ backgroundColor: option.colorHex ?? "transparent" }}
            />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiSelectWidget({ attr, value, onChange, disabled }: WidgetProps) {
  const selected = new Set(Array.isArray(value) ? value : []);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {attr.options.map((option) => {
        const checked = selected.has(option.id);
        return (
          <label
            key={option.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              checked ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200" : "border-white/10 text-white/60"
            }`}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-indigo-500"
              checked={checked}
              onChange={() => toggle(option.id)}
              disabled={disabled}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

// IMAGE/FILE medya asset id'sini (mediaId) saklar. Düzenlemede yalnız mediaId gelir;
// önizleme URL'si buradan çözülür.
//
// TODO-159B (ADR-090) — Eski çözüm "kütüphanenin ilk 100 kaydını modül cache'ine
// al, içinden ara" idi: 100'den eski bir görsel seçilmişse önizleme BOŞ kalıyordu
// (değer korunuyor ama kullanıcı ne seçtiğini göremiyordu). Artık `ids` çözüm
// modu kullanılır — kayıt kaçıncı sayfada olursa olsun çözülür. Süreç boyunca
// çözülenler id bazında cache'lenir (aynı görsel için tek istek).
const mediaCache = new Map<string, Promise<MediaItem | null>>();
async function resolveMediaItem(mediaId: string): Promise<MediaItem | null> {
  const cached = mediaCache.get(mediaId);
  if (cached) return cached;
  const pending = storeApi
    .listMedia({ ids: mediaId })
    .then((response) => {
      const asset = response.data[0];
      return asset ? { id: asset.id, url: asset.url, altText: asset.altText } : null;
    })
    .catch(() => {
      // Ağ hatası kalıcı "yok" sayılmaz: sonraki denemede tekrar sorulabilsin.
      mediaCache.delete(mediaId);
      return null;
    });
  mediaCache.set(mediaId, pending);
  return pending;
}

function MediaWidget({ value, onChange, disabled }: WidgetProps) {
  const mediaId = typeof value === "string" ? value : "";
  const [items, setItems] = useState<MediaItem[]>(
    mediaId ? [{ id: mediaId, url: "", altText: null }] : [],
  );

  // Düzenleme hydration'ı: mevcut mediaId için önizleme URL'sini çöz.
  useEffect(() => {
    let cancelled = false;
    if (mediaId && (items.length === 0 || items[0]!.url === "")) {
      void resolveMediaItem(mediaId).then((resolved) => {
        if (cancelled || !resolved) return;
        setItems([resolved]);
      });
    }
    if (!mediaId && items.length > 0) setItems([]);
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  const context: MediaContext = "PRODUCT";
  return (
    <MediaUpload
      context={context}
      mode="single"
      value={items}
      onAttach={(asset) => {
        setItems([{ id: asset.id, url: asset.url, altText: asset.altText }]);
        onChange(asset.id);
      }}
      onRemove={() => {
        setItems([]);
        onChange("");
      }}
      disabled={disabled}
    />
  );
}

const WIDGETS: Record<WidgetKind, (props: WidgetProps) => ReactNode> = {
  text: TextWidget,
  textarea: TextareaWidget,
  number: NumberWidget,
  boolean: BooleanWidget,
  date: DateWidget,
  select: SelectWidget,
  color: ColorWidget,
  multiselect: MultiSelectWidget,
  media: MediaWidget,
};

/** Test/yardımcı: bir dataType'ın hangi widget türüne düştüğü. */
export function widgetKindForType(dataType: AttributeDataType): WidgetKind {
  return WIDGET_BY_TYPE[dataType];
}

export { isMediaType };
