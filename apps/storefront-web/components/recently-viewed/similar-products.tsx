"use client";

/**
 * TODO-161B (ADR-140…143) — PDP "Benzer Ürünler" (client island).
 *
 * Mount'ta `/api/similar` çağrılır (read-model tabanlı açıklanabilir öneri; mevcut ürün gateway'de
 * hariç tutulur, sponsored/organik ranking'e DOKUNULMAZ). Durumlar: loading (skeleton) · empty (gizli) ·
 * error (gizli — best-effort). Kart = canonical `SearchProductCard` (PLP ile aynı); mobil grid standardı.
 */
import { useEffect, useState } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { PublicSearchProduct } from "@commerce-os/api-client";
import { Heading } from "../ui";
import { ProductCardSkeleton } from "../ui/product-card-skeleton";
import { SearchProductCard } from "../search/search-product-card";
import { WishlistProvider } from "../wishlist/wishlist-provider";
import { toListingCards } from "../../lib/search/listing-adapter";
import { fetchSimilarProducts } from "../../lib/recently-viewed/track";

const GRID_CLASS = "grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-14";

export function SimilarProducts({
  productId,
  t,
  limit = 8,
}: {
  productId: string;
  t: StorefrontDictionary;
  limit?: number;
}) {
  const [state, setState] = useState<"loading" | "ready">("loading");
  const [products, setProducts] = useState<PublicSearchProduct[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setState("loading");
    fetchSimilarProducts(productId, limit).then((result) => {
      if (!active) return;
      setProducts(result.products);
      setSavedIds(result.savedIds);
      setState("ready");
    });
    return () => {
      active = false;
    };
  }, [productId, limit]);

  // Empty/error → section hiç render edilmez (best-effort; sessiz).
  if (state === "ready" && products.length === 0) return null;

  return (
    <section className="mt-20" aria-label={t.related.title}>
      <Heading as="h2" className="mb-8 text-xl sm:text-2xl">
        {t.related.title}
      </Heading>
      {state === "loading" ? (
        <div className={GRID_CLASS} aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        // TODO-161B (TD-128) — Wishlist kalbi GERÇEK: TODO-159D altyapısına bağlı (auth→gateway,
        // guest→cookie); doğru başlangıç durumu BFF savedIds ile; optimistic + rollback provider'da.
        <WishlistProvider initialSavedIds={savedIds}>
          <div className={GRID_CLASS}>
            {toListingCards(products).map((card, index) => (
              <SearchProductCard key={card.id} card={card} t={t} priority={index < 4} />
            ))}
          </div>
        </WishlistProvider>
      )}
    </section>
  );
}
