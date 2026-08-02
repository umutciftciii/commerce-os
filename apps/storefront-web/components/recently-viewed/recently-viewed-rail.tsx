"use client";

/**
 * TODO-161B (ADR-137) — "Son İncelediklerin" yatay şerit (client island; Home + Cart).
 *
 * Mount'ta `/api/recently-viewed` çağrılır (kimlik cookie ile same-origin gider). Geçmiş YOKSA section
 * HİÇ render edilmez (loading'de de görünmez → CLS yok). `excludeIds` ile (Cart) sepetteki ürünler
 * gösterilmez. Kart = canonical `SearchProductCard`; mobil yatay kaydırma (snap).
 */
import { useEffect, useState } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { PublicSearchProduct } from "@commerce-os/api-client";
import { Eyebrow, Heading } from "../ui";
import { WishlistProvider } from "../wishlist/wishlist-provider";
import { RatingProvider, type CardRating } from "../reviews/rating-provider";
import { RecommendationCard } from "../recommendation/recommendation-card";
import { toListingCards } from "../../lib/search/listing-adapter";
import { fetchRecentlyViewed } from "../../lib/recently-viewed/track";
import type { RecommendationPlacement } from "../../lib/recommendation/track";

export function RecentlyViewedRail({
  t,
  title,
  eyebrow,
  excludeIds,
  excludeSlugs,
  limit = 12,
  minItems = 1,
  placement = "HOME",
  wishlistEnabled = true,
}: {
  t: StorefrontDictionary;
  /** Başlık (varsayılan `related.recentlyViewedTitle`). */
  title?: string;
  eyebrow?: string;
  /** Gösterimde hariç tutulacak ürün id'leri (Cart: sepet ürünleri). */
  excludeIds?: string[];
  /** Gösterimde hariç tutulacak ürün slug'ları (Cart line'ları slug taşır). */
  excludeSlugs?: string[];
  limit?: number;
  /** Bu sayının altında ürün varsa render edilmez (Cart'ta düşük-yoğunluk için). */
  minItems?: number;
  /** TD-130 — ölçüm yerleşimi (HOME / CART). source her zaman RECENTLY_VIEWED. */
  placement?: RecommendationPlacement;
  // TODO-163 Faz 3 (TD-156) — WISHLIST kapalıysa kalp gizlenir (provider enabled=false). Yoksa true.
  wishlistEnabled?: boolean;
}) {
  const [products, setProducts] = useState<PublicSearchProduct[] | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [ratings, setRatings] = useState<Record<string, CardRating>>({});

  useEffect(() => {
    let active = true;
    fetchRecentlyViewed(limit).then((result) => {
      if (!active) return;
      setProducts(result.products);
      setSavedIds(result.savedIds);
      setRatings(result.ratings);
    });
    return () => {
      active = false;
    };
  }, [limit]);

  if (products === null) return null; // loading → görünmez (CLS yok)
  const excludeId = new Set(excludeIds ?? []);
  const excludeSlug = new Set(excludeSlugs ?? []);
  const visible = products.filter((p) => !excludeId.has(p.id) && !excludeSlug.has(p.slug));
  if (visible.length < Math.max(1, minItems)) return null; // geçmiş yok → section yok

  const cards = toListingCards(visible);
  return (
    <section className="mt-16" aria-label={title ?? t.related.recentlyViewedTitle}>
      {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
      <Heading as="h2" className="mb-6 text-xl sm:text-2xl">
        {title ?? t.related.recentlyViewedTitle}
      </Heading>
      {/* TODO-161B (TD-128) — Wishlist kalbi GERÇEK (TODO-159D; auth→gateway, guest→cookie). */}
      {/* FP-3 — rating özetleri SUNUCUDAN (BFF getCardRatings); yorumu olan ürünlerde yıldız gösterilir. */}
      <WishlistProvider initialSavedIds={savedIds} enabled={wishlistEnabled}>
        <RatingProvider summaries={ratings}>
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:gap-6">
            {cards.map((card) => (
              <div key={card.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[23%]">
                {/* TD-130 — Son İncelediklerin ölçümü: impression/click + hedef PDP add-to-cart attribution. */}
                <RecommendationCard card={card} t={t} context={{ source: "RECENTLY_VIEWED", placement }} />
              </div>
            ))}
          </div>
        </RatingProvider>
      </WishlistProvider>
    </section>
  );
}
