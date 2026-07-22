"use client";

/**
 * TODO-159B (ADR-090) — Ortak seçici arama motoru.
 *
 * İki ayrı sorumluluk, iki ayrı hook:
 *
 *  1. `useSelectorSearch` — AÇIK modalın sayfası: debounce'lu arama, sayfa
 *     geçişi, yükleme / boş / filtreli-boş / hata + yeniden dene.
 *  2. `useSelectedItems` — SEÇİLİ kayıtların çözümü: sayfadan bağımsızdır ve
 *     `ids` uçlarıyla batched çalışır. Kritik nokta: seçili kayıt arama
 *     sonucunda ya da o sayfada OLMASA BİLE gösterilebilsin diye ayrı bir
 *     önbellekte yaşar. "Seçileni bulmak için tüm kataloğu çek" deseni
 *     tamamen ortadan kalkar.
 *
 * Her iki hook da yarış koşullarına karşı istek jetonu (request token) kullanır:
 * geç dönen eski yanıt yeni durumun üzerine YAZAMAZ.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
  ADMIN_SELECTOR_MAX_IDS,
} from "@commerce-os/api-client";

/** Sunucudan dönen ortak sayfalama meta'sı (ADR-089 ile birebir). */
export interface SelectorPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface SelectorPage<Item> {
  data: Item[];
  pagination: SelectorPagination;
}

export interface SelectorFetchParams {
  search: string;
  page: number;
  pageSize: number;
}

export interface SelectorSource<Item> {
  /** Sayfa çekimi (arama + sayfa + sayfa boyutu). */
  fetchPage: (params: SelectorFetchParams) => Promise<SelectorPage<Item>>;
  /** Seçili id kümesinin batched çözümü. Sıra korunmak zorunda DEĞİLDİR. */
  resolveByIds: (ids: string[]) => Promise<Item[]>;
  /** Kayıt kimliği (ADR-090 uçlarında daima `id`). */
  keyOf: (item: Item) => string;
}

export type SelectorStatus = "idle" | "loading" | "ready" | "error";

export interface SelectorSearchState<Item> {
  status: SelectorStatus;
  items: Item[];
  pagination: SelectorPagination;
  errorMessage: string | null;
  /** Ham arama kutusu değeri (debounce ÖNCESİ) — input controlled kalsın diye. */
  search: string;
  setSearch: (value: string) => void;
  /** Sunucuya gitmiş (debounce SONRASI) arama — "filtreli boş" ayrımı buna bakar. */
  appliedSearch: string;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (pageSize: number) => void;
  retry: () => void;
}

const EMPTY_PAGINATION: SelectorPagination = {
  page: 1,
  pageSize: ADMIN_LIST_DEFAULT_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

/** Arama yazarken her tuşta istek atılmaz; 300 ms yazma duraklaması beklenir. */
const SEARCH_DEBOUNCE_MS = 300;

export function useSelectorSearch<Item>(input: {
  source: SelectorSource<Item>;
  /** Modal kapalıyken hiç istek atılmaz (kapalı seçici ağ trafiği üretmez). */
  enabled: boolean;
  /**
   * Kaynağın kimliğini özetleyen serileştirilebilir anahtar (örn. sıralama ya da
   * bağlam filtresi). DEĞİŞİNCE sayfa 1'e döner ve veri yeniden çekilir.
   *
   * Neden gerekli: `source` nesnesi kasıtlı olarak ref'te tutulur (çağıran onu
   * inline tanımlasa bile sonsuz istek döngüsü olmasın diye). Bu, "kaynağın
   * davranışı değişti" bilgisinin efekte ULAŞMAMASI demektir — sıralama seçimi
   * sunucuya gitmezdi. `sourceKey` o bilgiyi taşıyan tek kanaldır.
   */
  sourceKey?: string;
  defaultPageSize?: number;
  /** Hata nesnesini kullanıcı diline çeviren fonksiyon (messageForError). */
  toMessage: (error: unknown) => string;
  /** Sayfa sonuçları geldiğinde seçili-önbelleğini beslemek için (opsiyonel). */
  onItemsLoaded?: (items: Item[]) => void;
}): SelectorSearchState<Item> {
  const { source, enabled, toMessage, onItemsLoaded } = input;
  const [search, setSearchRaw] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(input.defaultPageSize ?? ADMIN_LIST_DEFAULT_PAGE_SIZE);
  const [status, setStatus] = useState<SelectorStatus>("idle");
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<SelectorPagination>(EMPTY_PAGINATION);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const sourceKey = input.sourceKey ?? "";
  const [appliedSourceKey, setAppliedSourceKey] = useState(sourceKey);

  // Efekt bağımlılıklarını sabitlemek için: çağıran taraf `source`/`toMessage`'ı
  // inline tanımlasa bile (her render'da yeni kimlik) istek TEKRARLANMAZ.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const toMessageRef = useRef(toMessage);
  toMessageRef.current = toMessage;
  const onItemsLoadedRef = useRef(onItemsLoaded);
  onItemsLoadedRef.current = onItemsLoaded;

  // Arama yazımı debounce edilir; her değişimde sayfa 1'e döner (aksi halde
  // kullanıcı boş bir son sayfada kalırdı).
  useEffect(() => {
    if (search === appliedSearch) return;
    const timer = window.setTimeout(() => {
      setAppliedSearch(search);
      setPageRaw(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, appliedSearch]);

  // Kaynak kimliği değişti: sayfa başa döner (aksi halde yeni sıralamanın 3.
  // sayfasında, muhtemelen boş bir dilimde açılırdı).
  useEffect(() => {
    if (sourceKey === appliedSourceKey) return;
    setAppliedSourceKey(sourceKey);
    setPageRaw(1);
  }, [sourceKey, appliedSourceKey]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);
    void sourceRef.current
      .fetchPage({ search: appliedSearch.trim(), page, pageSize })
      .then((result) => {
        if (cancelled) return;
        setItems(result.data);
        setPagination(result.pagination);
        setStatus("ready");
        onItemsLoadedRef.current?.(result.data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(toMessageRef.current(error));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, appliedSearch, page, pageSize, reloadToken, appliedSourceKey]);

  const setSearch = useCallback((value: string) => setSearchRaw(value), []);
  const setPage = useCallback((next: number) => setPageRaw(Math.max(1, next)), []);
  const setPageSize = useCallback((next: number) => {
    setPageSizeRaw(next);
    setPageRaw(1);
  }, []);
  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    status,
    items,
    pagination,
    errorMessage,
    search,
    setSearch,
    appliedSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    retry,
  };
}

export interface SelectedItemsState<Item> {
  /** id → kayıt. Çözülemeyen id burada BULUNMAZ (çağıran ham id gösterir). */
  byId: Map<string, Item>;
  /** Seçim sırasına göre çözülmüş kayıtlar. */
  items: Item[];
  /** Henüz çözülemeyen (sunucudan silinmiş olabilecek) id'ler. */
  unresolvedIds: string[];
  resolving: boolean;
  /** Sayfa sonuçlarını önbelleğe ekler — seçim sonrası ek istek gerekmez. */
  remember: (items: Item[]) => void;
}

/**
 * Seçili id'leri `ids` uçlarıyla çözer. YALNIZ önbellekte olmayanlar istenir ve
 * istek `ADMIN_SELECTOR_MAX_IDS` boyutunda parçalara bölünür (sınırsız IN(...)
 * yok). Kullanıcı listeden seçtiğinde kayıt zaten `remember` ile önbellektedir;
 * yani seçim ek ağ turu üretmez — çözüm YALNIZ düzenleme ekranı ilk açıldığında
 * çalışır.
 */
export function useSelectedItems<Item>(input: {
  ids: readonly string[];
  source: Pick<SelectorSource<Item>, "resolveByIds" | "keyOf">;
  /** false iken çözüm ertelenir (örn. form henüz yüklenmemişken). */
  enabled?: boolean;
}): SelectedItemsState<Item> {
  const { ids, source } = input;
  const enabled = input.enabled ?? true;
  const [cache, setCache] = useState<Map<string, Item>>(() => new Map());
  const [resolving, setResolving] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());

  const sourceRef = useRef(source);
  sourceRef.current = source;

  const remember = useCallback((items: Item[]) => {
    if (items.length === 0) return;
    setCache((previous) => {
      let changed = false;
      const next = new Map(previous);
      for (const item of items) {
        const key = sourceRef.current.keyOf(item);
        if (!next.has(key)) {
          next.set(key, item);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, []);

  // Bağımlılık id DİZİSİNİN KENDİSİ değil, içeriği: çağıran her render'da yeni
  // dizi üretse bile gereksiz istek atılmaz.
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!enabled) return;
    const wanted = idsKey ? idsKey.split(",") : [];
    const missing = wanted.filter((id) => id && !cache.has(id) && !failedIds.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    setResolving(true);
    const chunks: string[][] = [];
    for (let index = 0; index < missing.length; index += ADMIN_SELECTOR_MAX_IDS) {
      chunks.push(missing.slice(index, index + ADMIN_SELECTOR_MAX_IDS));
    }
    void Promise.all(chunks.map((chunk) => sourceRef.current.resolveByIds(chunk)))
      .then((results) => {
        if (cancelled) return;
        const resolved = results.flat();
        remember(resolved);
        const resolvedKeys = new Set(resolved.map((item) => sourceRef.current.keyOf(item)));
        // Çözülemeyenler tekrar denenmez: kayıt gerçekten yoksa (silinmiş)
        // sonsuz istek döngüsüne girilmez.
        const stillMissing = missing.filter((id) => !resolvedKeys.has(id));
        if (stillMissing.length > 0) {
          setFailedIds((previous) => new Set([...previous, ...stillMissing]));
        }
      })
      .catch(() => {
        // Ağ hatası: id'ler "kalıcı çözülemedi" sayılmaz; kullanıcı modalı tekrar
        // açtığında yeniden denenir. Sessiz kalınır — alan seçili sayıyı yine gösterir.
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [idsKey, enabled, cache, failedIds, remember]);

  const items = useMemo(() => {
    const resolved: Item[] = [];
    for (const id of ids) {
      const item = cache.get(id);
      if (item !== undefined) resolved.push(item);
    }
    return resolved;
    // Bağımlılık BİLİNÇLİ olarak içerikten türetilmiş anahtardır (idsKey /
    // extraKey): çağıran her render'da yeni dizi/nesne üretse bile efekt tekrarlanmaz.
  }, [idsKey, cache]);

  const unresolvedIds = useMemo(
    () => ids.filter((id) => !cache.has(id)),
    // Bağımlılık BİLİNÇLİ olarak içerikten türetilmiş anahtardır (idsKey /
    // extraKey): çağıran her render'da yeni dizi/nesne üretse bile efekt tekrarlanmaz.
    [idsKey, cache],
  );

  return { byId: cache, items, unresolvedIds, resolving, remember };
}
