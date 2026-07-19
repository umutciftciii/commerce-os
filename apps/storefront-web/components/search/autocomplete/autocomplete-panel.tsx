"use client";

import type { ReactNode } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { format } from "@commerce-os/i18n";
import { highlightSegments } from "../../../lib/autocomplete/highlight";
import type { PopupGroupKey, PopupMode, PopupOption } from "../../../lib/autocomplete/flatten";

/**
 * TODO-156E — Autocomplete DROPDOWN (presentational; listbox). Grupları başlıklarla render eder (grup değişince
 * başlık). Her satır role="option" + benzersiz id → aria-activedescendant. Eşleşen kısım XSS-güvenli vurgulanır
 * (highlightSegments; dangerouslySetInnerHTML YOK). Tek-accent DS korunur (accent yalnız aktif/focus halkasında).
 */

type ACLabels = StorefrontDictionary["autocomplete"];

const GROUP_LABEL: Record<PopupGroupKey, keyof ACLabels> = {
  recent: "groupRecent",
  popular: "groupPopular",
  suggestions: "groupSuggestions",
  products: "groupProducts",
  categories: "groupCategories",
  brands: "groupBrands",
};

export function AutocompletePanel({
  options,
  activeIndex,
  listboxId,
  labels,
  query,
  mode,
  loading,
  recentsCount,
  onSelect,
  onHover,
  onClearRecent,
}: {
  options: PopupOption[];
  activeIndex: number;
  listboxId: string;
  labels: ACLabels;
  query: string;
  mode: PopupMode;
  loading: boolean;
  recentsCount: number;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
  onClearRecent?: () => void;
}) {
  let lastGroup: PopupGroupKey | null = null;

  return (
    <ul id={listboxId} role="listbox" aria-label={labels.listboxLabel} className="max-h-[70vh] overflow-y-auto py-1">
      {mode === "zero" ? (
        <li role="presentation" className="px-4 pb-2 pt-3">
          <p className="text-sm font-medium text-ink">{labels.zeroTitle}</p>
          <p className="mt-1 text-xs text-ink-subtle">{labels.zeroHint}</p>
        </li>
      ) : null}

      {options.map((option, index) => {
        const showHeader = option.groupKey !== lastGroup;
        lastGroup = option.groupKey;
        const active = index === activeIndex;
        return (
          <li key={option.id} role="presentation">
            {showHeader ? <GroupHeader groupKey={option.groupKey} labels={labels} recentsCount={recentsCount} onClearRecent={onClearRecent} /> : null}
            <div
              id={option.id}
              role="option"
              aria-selected={active}
              // Mouse ile hover → aktif indeks senkron (klavye/touch ile BİREBİR görsel dil).
              onMouseEnter={() => onHover(index)}
              onMouseDown={(e) => {
                // mousedown (blur'dan önce) → seçim; input focus kaybı navigasyonu iptal etmesin.
                e.preventDefault();
                onSelect(index);
              }}
              // Aktif satır BELİRGİN: yüzey + sol ink çubuğu (tek-accent kuralı korunur; accent=focus halkası).
              style={active ? { boxShadow: "inset 3px 0 0 0 var(--ink)" } : undefined}
              className={`flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5 ${active ? "bg-surface-muted" : ""}`}
            >
              <OptionBody option={option} query={query} labels={labels} />
            </div>
          </li>
        );
      })}

      {loading && options.length === 0 ? (
        <li role="presentation" className="px-4 py-3 text-xs text-ink-subtle">
          {labels.loading}
        </li>
      ) : null}
    </ul>
  );
}

function GroupHeader({
  groupKey,
  labels,
  recentsCount,
  onClearRecent,
}: {
  groupKey: PopupGroupKey;
  labels: ACLabels;
  recentsCount: number;
  onClearRecent?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 pb-1 pt-3">
      <span className="text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
        {labels[GROUP_LABEL[groupKey]] as string}
      </span>
      {groupKey === "recent" && recentsCount > 0 && onClearRecent ? (
        <button
          type="button"
          // mousedown ile: input blur navigasyonu tetiklemesin.
          onMouseDown={(e) => {
            e.preventDefault();
            onClearRecent();
          }}
          className="text-[11px] font-medium text-ink-subtle underline-offset-2 hover:text-ink hover:underline"
        >
          {labels.clearRecent}
        </button>
      ) : null}
    </div>
  );
}

function OptionBody({ option, query, labels }: { option: PopupOption; query: string; labels: ACLabels }) {
  const { action } = option;
  if (action.kind === "product") {
    const p = action.product;
    // TODO-156E UX: FİYAT YOK (keşif ekranı). Hiyerarşi: ad → marka → kategori. Rozetler: Yeni + Kampanya (tutarsız).
    const meta = [p.brand, p.categoryLabel].filter((v): v is string => !!v);
    return (
      <>
        <span className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden border border-line bg-surface-muted">
          {p.image ? (
            <img src={p.image.url} alt={p.image.altText ?? ""} loading="lazy" className="h-full w-full object-cover" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-sm text-ink">
              <Highlighted text={p.title} query={query} />
            </span>
            {p.isNew ? <Pill>{labels.newBadge}</Pill> : null}
            {p.hasCampaign ? <Pill>{p.campaignLabel ?? labels.campaignGeneric}</Pill> : null}
          </span>
          {meta.length > 0 ? (
            <span className="mt-0.5 block truncate text-xs text-ink-subtle">
              {meta.map((m, i) => (
                <span key={i}>
                  {i > 0 ? <span aria-hidden> · </span> : null}
                  {m}
                </span>
              ))}
            </span>
          ) : null}
          {!p.inStock ? <span className="mt-0.5 block text-xs text-ink-subtle">{labels.outOfStock}</span> : null}
        </span>
      </>
    );
  }
  if (action.kind === "category") {
    const c = action.category;
    const trail = c.path.slice(0, -1).map((n) => n.name).join(" / ");
    return (
      <>
        <CategoryIcon />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">
            <Highlighted text={c.name} query={query} />
          </span>
          {trail ? <span className="block truncate text-xs text-ink-subtle">{trail}</span> : null}
        </span>
      </>
    );
  }
  if (action.kind === "brand") {
    const b = action.brand;
    return (
      <>
        <TagIcon />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          <Highlighted text={b.brand} query={query} />
        </span>
        <span className="shrink-0 text-xs text-ink-subtle">{format(labels.brandCount, { count: b.productCount })}</span>
      </>
    );
  }
  // suggestion (results / recent / popular)
  return (
    <>
      {option.groupKey === "recent" ? <ClockIcon /> : <SearchIcon />}
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        <Highlighted text={action.value} query={query} />
      </span>
    </>
  );
}

/** Nötr rozet (tek-accent DS: renk taşımaz; ince hairline + subtle yüzey). SR metni okunur. */
function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-none border border-line bg-surface-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wideish text-ink-muted">
      {children}
    </span>
  );
}

/** XSS-güvenli vurgulama: segment dizisini text node olarak render eder. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const segments = highlightSegments(text, query);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <strong key={i} className="font-semibold text-ink">
            {seg.text}
          </strong>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden className="shrink-0 text-ink-subtle">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden className="shrink-0 text-ink-subtle">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 5.5V9l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function CategoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden className="shrink-0 text-ink-subtle">
      <path d="M2.5 4.5h13M4.5 9h9M6.5 13.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden className="shrink-0 text-ink-subtle">
      <path d="M8.5 2.5H15V9l-6 6-6.5-6.5L8.5 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="11.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}
