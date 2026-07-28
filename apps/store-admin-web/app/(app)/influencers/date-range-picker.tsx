"use client";

/**
 * TD-146 — Analytics tarih aralığı seçici. Ön ayarlar (7/30/90 gün) + özel aralık.
 * Değer `{ dateFrom?, dateTo? }` olarak yukarı bildirilir (YYYY-MM-DD); boş = sunucu
 * varsayılanı (son 30 gün). Sunucu aralığı bounded'a kırpar (ADR-178).
 */

import { useState } from "react";

export interface DateRangeValue {
  dateFrom?: string;
  dateTo?: string;
}

export interface RangeLabels {
  last7: string;
  last30: string;
  last90: string;
  custom: string;
  from: string;
  to: string;
  apply: string;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

type Preset = "7" | "30" | "90" | "custom";

export function DateRangePicker({
  labels,
  onChange,
  initialPreset = "30",
}: {
  labels: RangeLabels;
  onChange: (value: DateRangeValue) => void;
  initialPreset?: Preset;
}) {
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoToday());

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === "7") onChange({ dateFrom: isoDaysAgo(6), dateTo: isoToday() });
    else if (p === "30") onChange({ dateFrom: isoDaysAgo(29), dateTo: isoToday() });
    else if (p === "90") onChange({ dateFrom: isoDaysAgo(89), dateTo: isoToday() });
    // custom → Uygula butonu ile
  };

  const presets: { key: Preset; label: string }[] = [
    { key: "7", label: labels.last7 },
    { key: "30", label: labels.last30 },
    { key: "90", label: labels.last90 },
    { key: "custom", label: labels.custom },
  ];

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            aria-pressed={preset === p.key}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              preset === p.key ? "bg-white/[0.10] text-white" : "text-white/55 hover:bg-white/[0.05]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-white/50">
            <span className="mr-1">{labels.from}</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white/85"
            />
          </label>
          <label className="text-xs text-white/50">
            <span className="mr-1">{labels.to}</span>
            <input
              type="date"
              value={to}
              max={isoToday()}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white/85"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange({ dateFrom: from, dateTo: to })}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/[0.06]"
          >
            {labels.apply}
          </button>
        </div>
      ) : null}
    </div>
  );
}
