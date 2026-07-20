"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicAutocompleteResponse } from "@commerce-os/api-client";
import { publicAutocompleteResponseSchema } from "@commerce-os/api-client";
import { createClientCache, type ClientCache } from "../../../lib/autocomplete/cache";

/**
 * TODO-156E — Autocomplete VERİ hook'u (istemci). q değişince:
 *   1) < minChars → veri temizlenir (empty-state gösterilir).
 *   2) client cache hit → anında (ağ YOK).
 *   3) debounce (istek yağmuru önlenir) → fetch `/api/autocomplete` (AbortController ile önceki iptal).
 *   4) RACE guard: yalnız EN SON isteğin sonucu uygulanır (out-of-order yanıt eski sonucu ezmez).
 * Ağ/parse hatası → error:true + data:null (dropdown kırılmaz; UI "yeniden dene" göstermez, boş gibi ele alır).
 */

export interface AutocompleteState {
  data: PublicAutocompleteResponse | null;
  loading: boolean;
  error: boolean;
}

export interface UseAutocompleteOptions {
  minChars?: number;
  debounceMs?: number;
  limit?: number;
}

const DEFAULT_MIN_CHARS = 2;
const DEFAULT_DEBOUNCE_MS = 180;

export function useAutocomplete(query: string, options: UseAutocompleteOptions = {}): AutocompleteState {
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const limit = options.limit;

  const [state, setState] = useState<AutocompleteState>({ data: null, loading: false, error: false });

  const cacheRef = useRef<ClientCache<PublicAutocompleteResponse> | null>(null);
  if (cacheRef.current === null) cacheRef.current = createClientCache<PublicAutocompleteResponse>();
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const cache = cacheRef.current!;

    // Yeni girişte önceki debounce + inflight iptal (race + yağmur guard'ı).
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (trimmed.length < minChars) {
      setState({ data: null, loading: false, error: false });
      return;
    }

    const key = `${trimmed.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ")}|${limit ?? ""}`;
    const cached = cache.get(key);
    if (cached) {
      setState({ data: cached, loading: false, error: false });
      return;
    }

    setState((prev) => ({ data: prev.data, loading: true, error: false }));
    const seq = ++seqRef.current;

    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      const params = new URLSearchParams({ q: trimmed });
      if (limit) params.set("limit", String(limit));

      fetch(`/api/autocomplete?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`autocomplete ${res.status}`);
          return res.json();
        })
        .then((json: unknown) => {
          if (seq !== seqRef.current) return; // RACE guard: eski istek → sonucu at
          const parsed = publicAutocompleteResponseSchema.safeParse(json);
          if (!parsed.success) {
            setState({ data: null, loading: false, error: true });
            return;
          }
          cache.set(key, parsed.data);
          setState({ data: parsed.data, loading: false, error: false });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return; // iptal edilen istek sessizce yok sayılır
          if (seq !== seqRef.current) return;
          setState({ data: null, loading: false, error: true });
          void err;
        });
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, minChars, debounceMs, limit]);

  // Unmount temizliği (inflight iptal).
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return state;
}
