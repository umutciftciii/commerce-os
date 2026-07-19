import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { SearchState } from "../../lib/search/url-state";
import { SortControl } from "./sort-control";

/**
 * TODO-156B (brief §9) — Araç çubuğu (RSC + SortControl client island). Sonuç sayısı `aria-live="polite"`
 * ile duyurulur; sıralama backend'in desteklediği 6 anahtar. Bu fazda mobil FİLTRE butonu YOK (facet UI 156C;
 * işlevsiz buton gösterilmez). Sticky (header altında) tüm boyutlarda.
 */
export function SearchToolbar({
  state,
  totalItems,
  t,
}: {
  state: SearchState;
  totalItems: number;
  t: StorefrontDictionary;
}) {
  const s = t.search;
  return (
    <div
      role="group"
      aria-label={s.toolbarRegion}
      className="sticky top-16 z-10 flex flex-col gap-4 border-b border-line bg-paper/95 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
    >
      <p aria-live="polite" className="text-xs uppercase tracking-wideish text-ink-subtle">
        {format(s.resultCount, { count: totalItems })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SortControl state={state} t={t} />
      </div>
    </div>
  );
}
