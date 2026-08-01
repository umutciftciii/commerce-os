"use client";

import { createContext, useContext, useMemo, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * TODO-156B (ANALIZ-156A §7.4) — İstemci URL güncelleme + geçiş (transition) bağlamı.
 *
 * İstemci HİÇBİR arama mantığı çalıştırmaz; YALNIZCA URL'i günceller (`router.replace`/`push` +
 * `useTransition`). URL değişince RSC sunucuda yeniden fetch eder. `isPending` ile sonuç bölgesi
 * "yumuşak-meşgul" olur (eski içerik ekranda kalır, layout shift yok). Sıralama = replace (geçmişi
 * kirletmez); sayfalama = push (geri/ileri sayfalar arasında adımlar).
 */
interface SearchTransitionValue {
  isPending: boolean;
  navigate: (href: string, opts?: { scroll?: boolean; replace?: boolean }) => void;
}

const SearchTransitionContext = createContext<SearchTransitionValue | null>(null);

export function SearchTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const value = useMemo<SearchTransitionValue>(
    () => ({
      isPending,
      navigate: (href, opts) => {
        startTransition(() => {
          if (opts?.replace) router.replace(href, { scroll: opts?.scroll ?? false });
          else router.push(href, { scroll: opts?.scroll ?? false });
        });
      },
    }),
    [isPending, router],
  );

  return <SearchTransitionContext.Provider value={value}>{children}</SearchTransitionContext.Provider>;
}

export function useSearchTransition(): SearchTransitionValue {
  const ctx = useContext(SearchTransitionContext);
  if (!ctx) {
    // Sağlam fallback: provider dışı kullanımda no-op pending=false (kırılmaz).
    return { isPending: false, navigate: () => {} };
  }
  return ctx;
}

/**
 * TODO-165A (ADR-165A) Task 20 fix (coordinator review) — PLP arama bileşenleri (`FilterRail`,
 * `ActiveFilterChips`, `SearchPagination`, `SortControl`, facet renderer'ları...) `buildSearchHref(state)`'i
 * SABİT `/products` varsayılanıyla çağırıyordu; bu, `/markalar/[slug]` marka vitrininde sayfalama/sıralama/
 * filtre etkileşimlerini marka bağlamından (header/canonical/JSON-LD) KOPARIYORDU (TD-165A.1). `usePathname()`
 * GEÇERLİ route'u döner (`/products` ya da `/markalar/<slug>`) — bileşenler ayrı bir context/prop'a
 * gerek KALMADAN bunu `buildSearchHref`'in ikinci argümanı olarak geçirir; her iki route de KENDİ
 * path'inde kalır (minimal, düşük-riskli; page.tsx'lerde HİÇBİR wiring gerekmez).
 */
export function useSearchBasePath(): string {
  // usePathname() gerçek Next uygulamasında hep string döner; ama app-router bağlamı DIŞINDA (ör.
  // renderToStaticMarkup birim testleri) `null` dönebilir (Next'in kendi runtime davranışı — tip
  // imzası bunu yansıtmaz). Bu durumda buildSearchHref'in kendi varsayılanına (`/products`) düş.
  return usePathname() ?? "/products";
}
