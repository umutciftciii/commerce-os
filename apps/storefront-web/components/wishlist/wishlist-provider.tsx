"use client";

/**
 * TODO-159D (ADR-093) — Vitrin favori (wishlist) istemci durumu.
 *
 * Sayfa sunucu bileşeni, o sayfadaki ürünler için TEK batched çağrıyla favori
 * durumunu çözer (N+1 yok) ve `initialSavedIds` ile bu provider'a verir. Toggle
 * OPTIMISTIC'tir: durum anında güncellenir, ardından server action çağrılır;
 * başarısızlıkta GERİ ALINIR (rollback). Favori ürün-seviyesidir → aynı sayfadaki
 * tüm kartlar ve PDP tutarlı kalır.
 *
 * Provider yoksa `useWishlist` güvenli no-op döner (kartlar her yerde render olur;
 * yalnız provider ile sarılı sayfalarda gerçek davranış çalışır).
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toggleWishlistAction } from "../../lib/server/wishlist-actions";

export interface WishlistToggleOutcome {
  ok: boolean;
  saved: boolean;
}

interface WishlistContextValue {
  isSaved: (productId: string) => boolean;
  isPending: (productId: string) => boolean;
  toggle: (productId: string) => Promise<WishlistToggleOutcome>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

const NOOP_CONTEXT: WishlistContextValue = {
  isSaved: () => false,
  isPending: () => false,
  toggle: async () => ({ ok: false, saved: false }),
};

export function WishlistProvider({
  initialSavedIds,
  children,
}: {
  initialSavedIds: string[];
  children: React.ReactNode;
}) {
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initialSavedIds));
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const toggle = useCallback(async (productId: string): Promise<WishlistToggleOutcome> => {
    let optimisticSaved = false;
    // Optimistic: durumu anında flip et.
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        optimisticSaved = false;
      } else {
        next.add(productId);
        optimisticSaved = true;
      }
      return next;
    });
    setPending((prev) => new Set(prev).add(productId));

    const result = await toggleWishlistAction(productId, optimisticSaved);

    setPending((prev) => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
    setSaved((prev) => {
      const next = new Set(prev);
      if (result.ok) {
        if (result.saved) next.add(productId);
        else next.delete(productId);
      } else {
        // Rollback: optimistic değişikliği geri al.
        if (optimisticSaved) next.delete(productId);
        else next.add(productId);
      }
      return next;
    });

    return result.ok
      ? { ok: true, saved: result.saved }
      : { ok: false, saved: !optimisticSaved };
  }, []);

  const value = useMemo<WishlistContextValue>(
    () => ({
      isSaved: (productId) => saved.has(productId),
      isPending: (productId) => pending.has(productId),
      toggle,
    }),
    [saved, pending, toggle],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  return useContext(WishlistContext) ?? NOOP_CONTEXT;
}
