"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { emitDiscoveryEvent, rememberDiscoveryClick } from "../../../lib/discovery/track";

/**
 * TODO-162 (ADR-205) — Home Discovery section-analytics istemci izleyici sarmalayıcısı.
 *
 * SSR ile render edilen bir top-level discovery section'ı sarar (flash/CLS yok; tracking pasif katman):
 *  - Görünürlük (IntersectionObserver ≥0.3): bir kez SECTION_IMPRESSION + her ürün için CARD_IMPRESSION.
 *  - Tıklama delegasyonu: `/products/<handle>` bağlantısı → PRODUCT_CLICK (handle→id eşleme); editoryal CTA
 *    bağlantısı (ctaHref eşleşmesi) → CTA_CLICK. Bilinmeyen bağlantı yok sayılır.
 *
 * eligibilitySource top-level section granülerliğindedir (grid için "DISCOVERY" konteyner kaynağı). Sponsorlu
 * kartların OTORİTATİF ölçümü AYRICA SponsoredProductEvent token'ıyla yapılır (çift-ölçüm değil). ADD_TO_CART
 * discovery kart yüzeyinde tetiklenmez (kart PDP'ye götürür); model/pipeline desteklese de bu yüzeyden emit
 * edilmez (sepete-ekleme PDP'de gerçekleşir — discovery bağlamı orada yoktur).
 */
export interface DiscoveryTrackerProps {
  sectionId: string;
  sectionType: string;
  source: string;
  /** Section'daki ürünler (CARD_IMPRESSION + handle→id tıklama eşlemesi). */
  products?: { id: string; handle: string }[];
  /** Editoryal CTA bağlantı hedefleri (CTA_CLICK tespiti). */
  ctaHrefs?: string[];
  children: ReactNode;
}

export function DiscoveryTracker({
  sectionId,
  sectionType,
  source,
  products = [],
  ctaHrefs = [],
  children,
}: DiscoveryTrackerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);
  // Prop'ları ref'te tut → effect churn'ü (her render'da observer kur/yık) önle.
  const configRef = useRef({ sectionId, sectionType, source, products, ctaHrefs });
  configRef.current = { sectionId, sectionType, source, products, ctaHrefs };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      const { sectionId: sid, sectionType: st, source: src, products: prods } = configRef.current;
      emitDiscoveryEvent({ type: "SECTION_IMPRESSION", sectionId: sid, sectionType: st, eligibilitySource: src });
      for (const p of prods) {
        emitDiscoveryEvent({
          type: "CARD_IMPRESSION",
          sectionId: sid,
          sectionType: st,
          eligibilitySource: src,
          productId: p.id,
        });
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      fire();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.3) {
            fire();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: [0, 0.3, 0.6] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    const { sectionId: sid, sectionType: st, source: src, products: prods, ctaHrefs: ctas } = configRef.current;
    if (href && ctas.includes(href)) {
      emitDiscoveryEvent({ type: "CTA_CLICK", sectionId: sid, sectionType: st, eligibilitySource: src });
      return;
    }
    const match = /\/products\/([^/?#]+)/.exec(href);
    if (match) {
      const handle = decodeURIComponent(match[1]);
      const product = prods.find((p) => p.handle === handle);
      if (product) {
        emitDiscoveryEvent({
          type: "PRODUCT_CLICK",
          sectionId: sid,
          sectionType: st,
          eligibilitySource: src,
          productId: product.id,
        });
        // PDP'de başarılı sepete-ekleme olursa ADD_TO_CART bu bağlama atfedilsin (kısa TTL, tek-kullanımlık).
        rememberDiscoveryClick({ sectionId: sid, sectionType: st, eligibilitySource: src }, product.id);
      }
    }
  };

  return (
    <div ref={rootRef} onClickCapture={handleClick}>
      {children}
    </div>
  );
}
