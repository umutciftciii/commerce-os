"use client";

import { contrastRatio } from "@commerce-os/theme";
import { Input } from "@commerce-os/ui";

/**
 * TODO-164B Dilim 2 — Platform Designer semantic renk alanı (açık tema). Native color
 * picker + hex input + kullanım açıklaması + kontrast göstergesi. Teknik token adı
 * GÖSTERİLMEZ (field-labels kullanıcı-dostu etiket). Kilitli/gizli policy ile pasifleşir.
 */
export interface ColorFieldProps {
  label: string;
  description: string;
  usage: string;
  value: string;
  invalid: boolean;
  disabled?: boolean;
  locked?: boolean;
  contrastAgainst?: string;
  contrastThreshold?: number;
  onChange: (value: string) => void;
}

function toHexInput(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return ("#" + v.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  }
  return "#000000";
}

export function ColorField(props: ColorFieldProps) {
  const { label, description, usage, value, invalid, disabled, locked, contrastAgainst, contrastThreshold = 4.5, onChange } = props;
  const ratio = contrastAgainst && !invalid ? contrastRatio(value, contrastAgainst) : null;
  const contrastOk = ratio == null ? null : ratio >= contrastThreshold;
  const isDisabled = disabled || locked;

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start gap-3">
        <label
          className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-slate-300"
          style={{ background: invalid ? "transparent" : value }}
        >
          <input
            type="color"
            value={toHexInput(value)}
            disabled={isDisabled}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${label} renk seçici`}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-slate-800">{label}</span>
            {locked ? (
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                Kilitli
              </span>
            ) : null}
          </div>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={isDisabled}
            className={`mt-1 text-xs ${invalid ? "border-red-400" : ""}`}
            aria-invalid={invalid}
            aria-label={`${label} hex/rgb`}
          />
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">{description}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">Örnek: {usage}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {contrastOk !== null ? (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              contrastOk ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
            title={`Kontrast oranı ${ratio?.toFixed(1)}:1 (eşik ${contrastThreshold}:1)`}
          >
            {contrastOk ? `AA ✓ ${ratio?.toFixed(1)}:1` : `Düşük kontrast ${ratio?.toFixed(1)}:1`}
          </span>
        ) : null}
        {invalid ? <span className="text-[10px] text-red-600">Geçerli renk girin (ör. #735389).</span> : null}
      </div>
    </div>
  );
}
