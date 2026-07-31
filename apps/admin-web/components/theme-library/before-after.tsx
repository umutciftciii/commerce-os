"use client";

import type { ThemeChangeSummary } from "@commerce-os/api-client";

/**
 * TODO-164B Dilim 2 — Before/After değişiklik özeti (kullanıcı-dostu; RAW JSON YOK).
 * Kategori sayaçları + alan bazlı önce/sonra. Renk değerleri swatch ile gösterilir.
 */

const CATEGORY_LABEL: Record<string, string> = {
  color: "Renkler",
  typography: "Tipografi",
  layout: "Düzen",
  slot: "Bileşenler",
  media: "Medya",
  policy: "Yetkiler",
};

function isColor(value: string | null): boolean {
  return !!value && /^#[0-9a-fA-F]{3,8}$|^rgb/.test(value);
}

function Swatch({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  if (isColor(value)) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm border border-slate-300" style={{ background: value }} aria-hidden />
        <span className="font-mono text-[11px]">{value}</span>
      </span>
    );
  }
  return <span className="font-mono text-[11px]">{value}</span>;
}

export function BeforeAfter({ summary }: { summary: ThemeChangeSummary }) {
  if (!summary.hasChanges) {
    return <p className="text-sm text-slate-500">Değişiklik yok — iki sürüm aynı görünümü üretir.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {Object.entries(summary.counts)
          .filter(([, n]) => n > 0)
          .map(([cat, n]) => (
            <span key={cat} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              {CATEGORY_LABEL[cat] ?? cat}: {n}
            </span>
          ))}
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          Toplam {summary.total} değişiklik
        </span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {summary.changes.map((c) => (
          <li key={c.path} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2 text-sm">
            <span className="truncate text-slate-700" title={c.labelTr}>
              {c.labelTr}
            </span>
            <Swatch value={c.before} />
            <span aria-hidden className="text-slate-400">
              →
            </span>
            <Swatch value={c.after} />
          </li>
        ))}
      </ul>
    </div>
  );
}
