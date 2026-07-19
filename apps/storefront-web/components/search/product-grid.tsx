import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { SearchListingCard } from "../../lib/search/listing-adapter";
import { SearchProductCard } from "./search-product-card";

/**
 * TODO-156B (ANALIZ §6) — Responsive ürün grid'i (RSC). 2 (mobil) / 3 (tablet) / 4 (desktop) kolon;
 * sabit 4:5 kart oranı → layout shift minimum, ürün sayısından bağımsız düzen. İlk satır görselleri
 * (LCP) `priority`; gerisi lazy. Kartlar client island (swatch/hover); grid sunucuda render edilir.
 */
const PRIORITY_COUNT = 4; // desktop ilk satır (4 kolon) — LCP.

export function ProductGrid({ cards, t }: { cards: SearchListingCard[]; t: StorefrontDictionary }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-14">
      {cards.map((card, index) => (
        <SearchProductCard key={card.id} card={card} t={t} priority={index < PRIORITY_COUNT} />
      ))}
    </div>
  );
}
