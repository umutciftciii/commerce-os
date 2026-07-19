"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { format } from "@commerce-os/i18n";
import {
  buildPopupOptions,
  countAutocompleteItems,
  nextActiveIndex,
  type PopupMode,
  type PopupOption,
} from "../../../lib/autocomplete/flatten";
import { suggestionHref } from "../../../lib/autocomplete/href";
import { addRecent, clearRecent, readRecent } from "../../../lib/autocomplete/recent";
import { useAutocomplete } from "./use-autocomplete";
import { AutocompletePanel } from "./autocomplete-panel";

/**
 * TODO-156E (ADR-084) — Enterprise autocomplete COMBOBOX (istemci). Header (inline) + mobil drawer'da paylaşılır.
 *
 * ARIA combobox (listbox popup): input role=combobox + aria-expanded/controls/activedescendant/autocomplete.
 * Tam klavye: ↑↓ (wrap) · Enter (aktif seçim VEYA tam arama) · ESC (temizle/kapat) · Home/End · Tab kapatır.
 * Hover ↔ aktif indeks senkron. Modlar: empty (son+popüler aramalar) · results (4 grup) · zero (kurtarma).
 * Debounce + AbortController + race guard + client cache hook'ta (use-autocomplete). No-JS fallback: native
 * `<form action="/products">` (JS kapalıyken submit çalışır). Tek-accent DS korunur.
 */

const MIN_CHARS = 2;

export function SearchCombobox({
  t,
  variant = "header",
  autoFocus = false,
  onNavigate,
  inputClassName,
}: {
  t: StorefrontDictionary;
  variant?: "header" | "drawer";
  autoFocus?: boolean;
  /** Navigasyon sonrası çağrılır (mobil drawer'ı kapatmak için). */
  onNavigate?: () => void;
  inputClassName?: string;
}) {
  const labels = t.autocomplete;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recents, setRecents] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;

  const { data, loading } = useAutocomplete(q, { minChars: MIN_CHARS });
  const popular = labels.popularTerms;

  // Son aramaları client'ta yükle (SSR'de window yok → effect).
  const refreshRecents = () => {
    if (typeof window === "undefined") return;
    setRecents(readRecent(window.localStorage));
  };
  useEffect(() => {
    refreshRecents();
    if (autoFocus) inputRef.current?.focus();
  }, []);

  const trimmed = q.trim();
  const isTyping = trimmed.length >= MIN_CHARS;
  const mode: PopupMode = !isTyping
    ? "empty"
    : data && countAutocompleteItems(data) === 0 && !loading
      ? "zero"
      : "results";

  const options = useMemo<PopupOption[]>(
    () =>
      buildPopupOptions({
        mode,
        data: mode === "results" ? data : null,
        recents,
        popular,
        idBase: baseId,
      }),
    [mode, data, recents, popular, baseId],
  );

  // q/mod değişince aktif seçim sıfırlanır; option küçülünce clamp.
  useEffect(() => {
    setActiveIndex(-1);
  }, [q, mode]);

  const open = focused && (options.length > 0 || loading || mode === "zero" || mode === "empty");
  const activeId = activeIndex >= 0 && activeIndex < options.length ? options[activeIndex].id : null;
  const resultCount = mode === "results" && data ? countAutocompleteItems(data) : 0;
  const totalProducts = mode === "results" && data ? data.total : 0;

  const go = (href: string, recentTerm?: string) => {
    if (recentTerm && typeof window !== "undefined") {
      setRecents(addRecent(window.localStorage, recentTerm));
    }
    setFocused(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
    onNavigate?.();
    router.push(href);
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    const term =
      option.action.kind === "suggestion"
        ? option.action.value
        : option.action.kind === "brand"
          ? option.action.brand.brand
          : undefined;
    go(option.action.href, term);
  };

  /** Enter (aktif seçim yoksa): tam aramaya git (/products?q=). */
  const submitFullSearch = () => {
    if (!trimmed) return;
    go(suggestionHref(trimmed), trimmed);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (options.length > 0) setActiveIndex((i) => nextActiveIndex(i, "down", options.length));
        return;
      case "ArrowUp":
        event.preventDefault();
        if (options.length > 0) setActiveIndex((i) => nextActiveIndex(i, "up", options.length));
        return;
      case "Home":
        if (options.length > 0) {
          event.preventDefault();
          setActiveIndex(nextActiveIndex(activeIndex, "home", options.length));
        }
        return;
      case "End":
        if (options.length > 0) {
          event.preventDefault();
          setActiveIndex(nextActiveIndex(activeIndex, "end", options.length));
        }
        return;
      case "Enter":
        event.preventDefault();
        if (activeIndex >= 0) selectOption(activeIndex);
        else submitFullSearch();
        return;
      case "Escape":
        if (activeIndex >= 0) {
          setActiveIndex(-1);
        } else if (q.length > 0) {
          setQ("");
        } else {
          setFocused(false);
          inputRef.current?.blur();
        }
        return;
      case "Tab":
        setFocused(false);
        return;
      default:
    }
  };

  // Dışarı tıklama → kapat.
  useEffect(() => {
    if (!focused) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [focused]);

  const panelWrapClass =
    variant === "drawer"
      ? "mt-2 border-t border-line"
      : "absolute right-0 top-full z-40 mt-2 w-[min(28rem,90vw)] border border-line bg-surface shadow-md";

  return (
    <div ref={containerRef} className={variant === "drawer" ? "relative w-full" : "relative"}>
      <form
        action="/products"
        method="get"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (activeIndex >= 0) selectOption(activeIndex);
          else submitFullSearch();
        }}
        className={variant === "drawer" ? "flex items-center gap-2" : "flex items-center"}
      >
        <label htmlFor={inputId} className="sr-only">
          {labels.label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          name="q"
          type="search"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeId ?? undefined}
          aria-autocomplete="list"
          aria-label={labels.label}
          autoComplete="off"
          value={q}
          placeholder={t.shell.searchPlaceholder}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            setFocused(true);
            refreshRecents();
          }}
          onKeyDown={onKeyDown}
          className={
            inputClassName ??
            "h-9 w-40 rounded-none border-b border-line bg-transparent px-1 text-sm text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none lg:w-52"
          }
        />
        <button type="submit" aria-label={t.shell.searchSubmit} className="ml-1 text-ink-muted hover:text-ink">
          <SearchIcon />
        </button>
      </form>

      {/* Ekran okuyucu için sonuç sayısı duyurusu (görsel gizli). */}
      <div aria-live="polite" role="status" className="sr-only">
        {mode === "results" && !loading ? format(labels.resultsAnnounce, { count: totalProducts }) : ""}
      </div>

      {open ? (
        <div className={panelWrapClass}>
          <AutocompletePanel
            options={options}
            activeIndex={activeIndex}
            listboxId={listboxId}
            labels={labels}
            query={trimmed}
            mode={mode}
            loading={loading}
            recentsCount={recents.length}
            onSelect={selectOption}
            onHover={setActiveIndex}
            onClearRecent={() => {
              if (typeof window !== "undefined") clearRecent(window.localStorage);
              setRecents([]);
            }}
          />

          {/* Sonuç modunda "tüm sonuçları görüntüle (N)" — anlamlı copy + toplam ürün sayısı (varsa). */}
          {mode === "results" && resultCount > 0 ? (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                submitFullSearch();
              }}
              className="block w-full border-t border-line px-4 py-2.5 text-left text-xs font-medium text-ink hover:bg-surface-muted"
            >
              {totalProducts > 0
                ? format(labels.viewAllResultsCount, { q: trimmed, count: totalProducts })
                : format(labels.viewAllResults, { q: trimmed })}
            </button>
          ) : null}

          {/* Empty modunda: "tüm ürünleri görüntüle" (çıkmaz hissi oluşturma). */}
          {mode === "empty" ? (
            <div className="border-t border-line px-4 py-3">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  go("/products");
                }}
                className="text-xs font-medium text-ink underline-offset-2 hover:underline"
              >
                {labels.browseAll}
              </button>
            </div>
          ) : null}

          {mode === "zero" ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQ("");
                  inputRef.current?.focus();
                }}
                className="text-xs font-medium text-ink underline-offset-2 hover:underline"
              >
                {labels.clearQuery}
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  go("/products");
                }}
                className="text-xs font-medium text-ink underline-offset-2 hover:underline"
              >
                {labels.browseAll}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
