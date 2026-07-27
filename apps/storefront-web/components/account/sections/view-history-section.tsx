"use client";

/**
 * TODO-161B (ADR-137) — Hesabım > Görüntüleme Geçmişi (client island).
 *
 * Mount'ta `/api/recently-viewed` (kimlik = müşteri cookie) çağrılır; en-yeni-önce sıralı (sunucu
 * lastViewedAt DESC), bounded liste. "Geçmişi temizle" → DELETE + yeniden yükle. Empty/loading durumları.
 */
import { useEffect, useState } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { PublicSearchProduct } from "@commerce-os/api-client";
import { Button, EmptyState } from "../../ui";
import { ProductCardSkeleton } from "../../ui/product-card-skeleton";
import { WishlistProvider } from "../../wishlist/wishlist-provider";
import { RecommendationCard } from "../../recommendation/recommendation-card";
import { toListingCards } from "../../../lib/search/listing-adapter";
import { clearRecentlyViewed, fetchRecentlyViewed } from "../../../lib/recently-viewed/track";

const GRID_CLASS = "grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4";

export function ViewHistorySection({ t }: { t: StorefrontDictionary }) {
  const v = t.account.viewHistory;
  const [state, setState] = useState<"loading" | "ready">("loading");
  const [products, setProducts] = useState<PublicSearchProduct[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);

  async function load() {
    setState("loading");
    const result = await fetchRecentlyViewed(50);
    setProducts(result.products);
    setSavedIds(result.savedIds);
    setState("ready");
  }

  useEffect(() => {
    let active = true;
    fetchRecentlyViewed(50).then((result) => {
      if (!active) return;
      setProducts(result.products);
      setSavedIds(result.savedIds);
      setState("ready");
    });
    return () => {
      active = false;
    };
  }, []);

  async function onClear() {
    setClearing(true);
    try {
      await clearRecentlyViewed();
      await load();
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">{v.title}</h1>
          <p className="mt-1 text-sm text-ink-subtle">{v.subtitle}</p>
        </div>
        {state === "ready" && products.length > 0 ? (
          <Button variant="secondary" onClick={onClear} disabled={clearing}>
            {clearing ? v.clearing : v.clear}
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {state === "loading" ? (
          <div className={GRID_CLASS} aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <EmptyState title={v.emptyTitle} description={v.emptyBody} />
        ) : (
          // TODO-161B (TD-128) — Wishlist kalbi GERÇEK (TODO-159D; hesap oturumu → gateway).
          <WishlistProvider initialSavedIds={savedIds}>
            <div className={GRID_CLASS}>
              {toListingCards(products).map((card, index) => (
                // TD-130 — Hesabım Görüntüleme Geçmişi: impression + click (add-to-cart aksiyonu yok →
                // sahte aksiyon EKLENMEZ; hedef PDP'de sepete eklenirse attribution yine de çalışır).
                <RecommendationCard
                  key={card.id}
                  card={card}
                  t={t}
                  priority={index < 4}
                  context={{ source: "RECENTLY_VIEWED", placement: "ACCOUNT" }}
                />
              ))}
            </div>
          </WishlistProvider>
        )}
      </div>
    </div>
  );
}
