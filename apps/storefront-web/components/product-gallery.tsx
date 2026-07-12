"use client";

import { useState } from "react";
import { cn } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import { resolveImageAlt, type GalleryImage } from "../lib/gallery";

/**
 * PDP medya galerisi (Faz 3/Dilim 2) — ana gorsel + tiklanabilir thumbnail seridi.
 *
 * Sunucu sayfasinin icine gomulu KUCUK bir istemci adasidir (bkz. `BuyBox` emsali):
 * sayfanin geri kalani server kalir, yalniz secili-gorsel etkilesimi burada hydrate
 * olur. Cagiran taraf (`page.tsx`) bu bileseni SADECE `images.length > 1` iken render
 * eder; tek/sifir gorsel eski `ProductMedia` yoluyla islenir (bkz. `shouldShowThumbnailStrip`).
 *
 * SSR: ilk secili indeks 0 (kapak) oldugundan statik markup'ta bile kapak gorseli basilir.
 */
export function ProductGallery({
  images,
  title,
  t,
}: {
  images: GalleryImage[];
  title: string;
  t: StorefrontDictionary["detail"];
}) {
  const [selected, setSelected] = useState(0);
  const active = images[selected] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      {/* Ana gorsel — secili thumbnail'i yansitir. */}
      <div className="aspect-[4/5] overflow-hidden border border-line bg-surface">
        <img
          src={active.url}
          alt={resolveImageAlt(active.altText, title)}
          className="h-full w-full object-cover"
        />
      </div>

      {/* Thumbnail seridi — her boyutta yatay; mobilde kaydirma (snap). */}
      <div className="flex snap-x gap-2 overflow-x-auto pb-1" role="group" aria-label={t.galleryAlt}>
        {images.map((image, index) => {
          const isActive = index === selected;
          return (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setSelected(index)}
              aria-pressed={isActive}
              aria-label={resolveImageAlt(
                image.altText,
                format(t.galleryThumbAlt, { title, n: index + 1 }),
              )}
              className={cn(
                "aspect-square h-16 w-16 flex-none snap-start overflow-hidden border bg-surface transition-colors sm:h-20 sm:w-20",
                isActive
                  ? "border-ink ring-1 ring-ink"
                  : "border-line hover:border-line-strong",
              )}
            >
              <img
                src={image.url}
                alt=""
                aria-hidden
                className="h-full w-full object-cover"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
