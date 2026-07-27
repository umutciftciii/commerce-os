"use client";

/**
 * TD-130 (ADR-145…147) — Öneri kartı ölçüm sarmalayıcısı (client).
 *
 * Kanonik `SearchProductCard`'ı SARAR (kartın kendisini değiştirmez): (1) IMPRESSION — kart viewport'a
 * %50 girince BİR KEZ (IntersectionObserver; "impression yalnız gerçekten görünen kartta"). (2) CLICK —
 * ürün bağlantısına tıklanınca (onClickCapture; swatch/kalp tıklaması SAYILMAZ) + hedef PDP'de sepete
 * eklenirse ADD_TO_CART atfı için attribution bağlamı yazılır. Bot/prefetch gateway'de elenir; dedupe
 * client (tek-mount) + server (pencere). Best-effort — ölçüm UX'i etkilemez.
 */
import { useEffect, useRef } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { SearchListingCard } from "../../lib/search/listing-adapter";
import { SearchProductCard } from "../search/search-product-card";
import {
  rememberRecommendationClick,
  trackRecommendationEvent,
  type RecommendationContext,
} from "../../lib/recommendation/track";

export function RecommendationCard({
  card,
  t,
  priority = false,
  context,
}: {
  card: SearchListingCard;
  t: StorefrontDictionary;
  priority?: boolean;
  context: RecommendationContext;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);
  // Context'i ref'te tut → observer effect kart-id değişmedikçe yeniden kurulmaz (parent her render'da
  // yeni context objesi üretse bile gereksiz re-subscribe olmaz).
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (firedRef.current) return;
    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      trackRecommendationEvent("IMPRESSION", contextRef.current, card.id);
    };
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      // Observer yoksa (eski tarayıcı/test) render'da say.
      fire();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            fire();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [card.id]);

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    // Yalnız ürün bağlantısı (navigasyon) tıklaması CLICK sayılır; swatch/kalp butonu SAYILMAZ.
    const target = event.target as HTMLElement | null;
    if (target?.closest("a")) {
      trackRecommendationEvent("CLICK", contextRef.current, card.id);
      rememberRecommendationClick(contextRef.current, card.id);
    }
  }

  return (
    <div ref={ref} onClickCapture={handleClickCapture} className="flex h-full flex-col">
      <SearchProductCard card={card} t={t} priority={priority} />
    </div>
  );
}
