"use client";

/**
 * TD-146 — Günlük analytics zaman serisi grafiği. Repoda hazır chart framework YOK →
 * bağımlılıksız inline SVG çoklu-seri çizgi grafiği (theme-aware, tooltip, legend, metrik
 * sekmeleri, empty state, responsive, erişilebilir). Para birimi farklı gelirler TEK çizgide
 * birleştirilmez (ADR-176/179) → currency başına ayrı seri. Değerler minor; ciro çizgisinde
 * tooltip para formatı gösterir.
 */

import { useId, useMemo, useState } from "react";
import type { AttributionDailyPoint } from "@commerce-os/api-client";
import { formatMoneyMinor } from "./attribution";

type Locale = "tr" | "en";
type Metric = "clicks" | "orders" | "revenue";

export interface ChartLabels {
  clicks: string;
  uniqueVisitors: string;
  orders: string;
  revenue: string;
  empty: string;
}

interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
  /** true → tooltip'te para formatı (currency ile). */
  money?: string;
}

const SERIES_COLORS = ["#7c8cff", "#34d399", "#fbbf24", "#f472b6", "#22d3ee", "#a78bfa"];

const W = 720;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

function buildSeries(daily: AttributionDailyPoint[], metric: Metric, labels: ChartLabels): Series[] {
  if (metric === "clicks") {
    return [
      { key: "clicks", label: labels.clicks, color: SERIES_COLORS[0], values: daily.map((d) => d.clicks) },
      { key: "unique", label: labels.uniqueVisitors, color: SERIES_COLORS[4], values: daily.map((d) => d.uniqueVisitors) },
    ];
  }
  if (metric === "orders") {
    return [{ key: "orders", label: labels.orders, color: SERIES_COLORS[1], values: daily.map((d) => d.orders) }];
  }
  // revenue: currency başına ayrı seri (net gelir).
  const currencies = Array.from(new Set(daily.flatMap((d) => d.revenues.map((r) => r.currency)))).sort();
  return currencies.map((currency, i) => ({
    key: `rev-${currency}`,
    label: `${labels.revenue} · ${currency}`,
    color: SERIES_COLORS[(i + 2) % SERIES_COLORS.length],
    values: daily.map((d) => (d.revenues.find((r) => r.currency === currency)?.netRevenueMinor ?? 0) / 100),
    money: currency,
  }));
}

export function AnalyticsChart({
  daily,
  locale,
  labels,
}: {
  daily: AttributionDailyPoint[];
  locale: Locale;
  labels: ChartLabels;
}) {
  const [metric, setMetric] = useState<Metric>("clicks");
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const series = useMemo(() => buildSeries(daily, metric, labels), [daily, metric, labels]);
  const maxVal = useMemo(() => Math.max(1, ...series.flatMap((s) => s.values)), [series]);
  const n = daily.length;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / maxVal) * plotH;

  const nf = (v: number) => v.toLocaleString(locale === "tr" ? "tr-TR" : "en-US");
  const hasData = n > 0 && series.some((s) => s.values.some((v) => v > 0));

  const tabs: { key: Metric; label: string }[] = [
    { key: "clicks", label: labels.clicks },
    { key: "orders", label: labels.orders },
    { key: "revenue", label: labels.revenue },
  ];

  // X ekseni: ilk/orta/son gün etiketi.
  const xTicks = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label={labels.revenue}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={metric === tab.key}
            onClick={() => setMetric(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              metric === tab.key ? "bg-white/[0.10] text-white" : "text-white/55 hover:bg-white/[0.05]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!hasData ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] text-sm text-white/45">
          {labels.empty}
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            role="img"
            aria-label={`${tabs.find((t) => t.key === metric)?.label}: ${series
              .map((s) => `${s.label} ${nf(s.values.reduce((a, b) => a + b, 0))}`)
              .join(", ")}`}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
              </clipPath>
            </defs>
            {/* Y grid + 0/max etiketleri */}
            {[0, 0.5, 1].map((f) => {
              const gy = PAD.top + plotH - f * plotH;
              return (
                <g key={f}>
                  <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} stroke="currentColor" strokeOpacity={0.08} />
                  <text x={PAD.left - 6} y={gy + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.4}>
                    {metric === "revenue" ? nf(Math.round(f * maxVal)) : nf(Math.round(f * maxVal))}
                  </text>
                </g>
              );
            })}
            {/* X etiketleri */}
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.4}>
                {daily[i]?.date.slice(5)}
              </text>
            ))}
            {/* Seriler */}
            <g clipPath={`url(#${clipId})`}>
              {series.map((s) => (
                <polyline
                  key={s.key}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                />
              ))}
              {hover != null &&
                series.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={3} fill={s.color} />
                ))}
            </g>
            {hover != null ? <line x1={x(hover)} y1={PAD.top} x2={x(hover)} y2={PAD.top + plotH} stroke="currentColor" strokeOpacity={0.15} /> : null}
            {/* Hover yakalama şeritleri */}
            {daily.map((_, i) => (
              <rect
                key={i}
                x={x(i) - (n <= 1 ? plotW / 2 : plotW / (n - 1) / 2)}
                y={PAD.top}
                width={n <= 1 ? plotW : plotW / (n - 1)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>

          {/* Legend */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-white/60">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>

          {/* Tooltip */}
          {hover != null && daily[hover] ? (
            <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-xs backdrop-blur">
              <p className="mb-1 font-medium text-white/85">{daily[hover].date}</p>
              {series.map((s) => (
                <p key={s.key} className="flex items-center justify-between gap-3 text-white/70">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </span>
                  <span className="tabular-nums text-white/90">
                    {s.money ? formatMoneyMinor(Math.round((s.values[hover] ?? 0) * 100), s.money, locale) : nf(s.values[hover] ?? 0)}
                  </span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
