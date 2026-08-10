"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@commerce-os/ui";

/**
 * TODO-177 (ADR-289) — Basit debounced arama seçici (product/category). Devasa client-side
 * liste YÜKLEMEZ; her tuşta store-scoped `/api/admin/support/stores/:storeId/(products|categories)`
 * çağrısı yapar (min 2 karakter). ADR-090 selector uçlarını reuse eder.
 */
export interface TypeaheadItem {
  id: string;
  label: string;
  sublabel?: string;
}

export function EntityTypeahead({
  placeholder,
  fetcher,
  onSelect,
  disabled,
}: {
  placeholder: string;
  fetcher: (search: string) => Promise<TypeaheadItem[]>;
  onSelect: (item: TypeaheadItem) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<TypeaheadItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(() => {
      setLoading(true);
      fetcher(query.trim())
        .then((r) => {
          setItems(r);
          setOpen(true);
        })
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, fetcher]);

  return (
    <div className="relative">
      <Input
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
      />
      {open && items.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onSelect(item);
                  setQuery("");
                  setItems([]);
                  setOpen(false);
                }}
              >
                <span>{item.label}</span>
                {item.sublabel ? <span className="text-xs text-slate-400">{item.sublabel}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {loading ? <span className="mt-1 block text-xs text-slate-400">…</span> : null}
    </div>
  );
}
