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
import { SearchProductCard } from "../search/search-product-card";
import { WishlistProvider } from "../wishlist/wishlist-provider";
import { toListingCards } from "../../lib/search/listing-adapter";
import { fetchRecentlyViewed } from "../../lib/recently-viewed/track";

export function RecentlyViewedRail({
  t,
  title,
  eyebrow,
  excludeIds,
  excludeSlugs,
  limit = 12,
  minItems = 1,
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
}) {
  const [products, setProducts] = useState<PublicSearchProduct[] | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetchRecentlyViewed(limit).then((result) => {
      if (!active) return;
      setProducts(result.products);
      setSavedIds(result.savedIds);
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
      <WishlistProvider initialSavedIds={savedIds}>
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:gap-6">
          {cards.map((card) => (
            <div key={card.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[23%]">
              <SearchProductCard card={card} t={t} />
            </div>
          ))}
        </div>
      </WishlistProvider>
    </section>
  );
}
