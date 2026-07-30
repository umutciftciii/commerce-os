"use client";

import { contrastRatio } from "@commerce-os/theme";
import { Input } from "../../../components/ui";

/**
 * TODO-164B (ADR-236) — Semantic Color Field. Hex-only input KALDIRILDI. Her renk
 * alanı: renk seçici (native picker) + hex input + kullanım açıklaması + kontrast
 * göstergesi + "önizlemede göster" (preview highlight). Teknik token adı GÖSTERİLMEZ
 * — yalnız kullanıcı-dostu etiket (field-labels).
 */

export interface ColorFieldProps {
  label: string;
  description: string;
  usage: string;
  value: string;
  invalid: boolean;
  disabled?: boolean;
  locked?: boolean;
  /** Kontrast referansı (ör. bu metin rengini zeminle karşılaştır). */
  contrastAgainst?: string;
  /** Kontrast eşiği (metin 4.5, büyük/UI 3). */
  contrastThreshold?: number;
  recent?: string[];
  onChange: (value: string) => void;
  onHighlight?: () => void;
}

/** Native <input type=color> yalnız #rrggbb kabul eder; hex'e indirger (yoksa #000000). */
function toHexInput(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return (
      "#" +
      v
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
    ).toLowerCase();
  }
  return "#000000";
}

export function ColorField(props: ColorFieldProps) {
  const {
    label,
    description,
    usage,
    value,
    invalid,
    disabled,
    locked,
    contrastAgainst,
    contrastThreshold = 4.5,
    recent = [],
    onChange,
    onHighlight,
  } = props;

  const ratio = contrastAgainst && !invalid ? contrastRatio(value, contrastAgainst) : null;
  const contrastOk = ratio == null ? null : ratio >= contrastThreshold;

  return (
    <div className="rounded-lg border border-white/10 p-3">
      <div className="flex items-start gap-3">
        {/* Renk seçici (swatch = native color input) */}
        <label
          className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/15"
          style={{ background: invalid ? "transparent" : value }}
          aria-hidden
        >
          <input
            type="color"
            value={toHexInput(value)}
            disabled={disabled || locked}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${label} renk seçici`}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-white/85">{label}</span>
            {locked ? (
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
                Kilitli
              </span>
            ) : null}
          </div>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || locked}
            className={`mt-1 text-xs ${invalid ? "border-red-500/70" : ""}`}
            aria-invalid={invalid}
            aria-label={`${label} hex/rgb`}
          />
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-white/55">{description}</p>
      <p className="mt-0.5 text-[10px] text-white/35">Örnek: {usage}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {contrastOk !== null ? (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              contrastOk ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
            }`}
            title={`Kontrast oranı ${ratio?.toFixed(1)}:1 (eşik ${contrastThreshold}:1)`}
          >
            {contrastOk ? `AA ✓ ${ratio?.toFixed(1)}:1` : `Düşük kontrast ${ratio?.toFixed(1)}:1`}
          </span>
        ) : null}
        {invalid ? (
          <span className="text-[10px] text-red-400">Geçerli renk girin (ör. #735389, rgb(…)).</span>
        ) : null}
        {onHighlight ? (
          <button
            type="button"
            onClick={onHighlight}
            disabled={disabled}
            className="ml-auto rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/[0.06] disabled:opacity-40"
          >
            Önizlemede göster
          </button>
        ) : null}
      </div>

      {recent.length > 0 && !locked ? (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[10px] text-white/35">Son:</span>
          {recent.slice(0, 6).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              disabled={disabled}
              className="h-4 w-4 rounded-sm border border-white/20"
              style={{ background: c }}
              title={c}
              aria-label={`Son renk ${c}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
