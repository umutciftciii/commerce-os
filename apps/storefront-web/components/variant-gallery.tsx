"use client";

// Faz 2C-7 (ADR-078) — Variant Media Engine. Secili varyanta REAKTIF galeri. Paylasilan PDP
// state'inden (usePdpSelection) secili varyanti okur, media-tanimlayici eksene gore galeriyi
// filtreler (varyantin Renk etiketine eslesen + paylasilan gorseller) ve mevcut galeri
// gorunumunu (ProductGallery / ProductMedia) render eder.
//
// Klasik galeride (media ekseni yok) galleryImagesForVariant TUM gorselleri dondurur → davranis
// ADR-065 ile birebir. Cok gorselli grupta ProductGallery, tek/sifirda ProductMedia (hidrasyon
// maliyeti dusuk yol) — shouldShowThumbnailStrip ile ayni karar, artik grup-basina.
//
// SSR: provider ilk state = varsayilan (en ucuz) varyant → ilk render o varyantin grubuyla gelir;
// sunucu ve istemci ayni ilk state oldugundan hidrasyon sicramasi YOK. ProductGallery'ye grup
// degistiginde `key` verilir → ic secili-indeks 0'a (grubun kapagina) reset olur.

import type { StorefrontDictionary } from "@commerce-os/i18n";
import { ProductMedia } from "./ui";
import { ProductGallery } from "./product-gallery";
import { usePdpSelection } from "./pdp-selection";
import { shouldShowThumbnailStrip } from "../lib/gallery";
import { galleryImagesForVariant, type StorefrontProductDetail } from "../lib/catalog-types";

export function VariantGallery({
  detail,
  t,
}: {
  detail: StorefrontProductDetail;
  t: StorefrontDictionary["detail"];
}) {
  const { selectedVariantId } = usePdpSelection();
  const selected = detail.variants.find((variant) => variant.id === selectedVariantId) ?? detail.variants[0];
  const images = galleryImagesForVariant(
    detail.images,
    detail.mediaDefiningAttributeId,
    selected?.mediaOptionId ?? null,
  );
  // Grup anahtari: media ekseni varsa secili varyantin renk grubu, yoksa sabit ("all").
  const groupKey = detail.mediaDefiningAttributeId ? (selected?.mediaOptionId ?? "__shared__") : "all";
  const coverUrl = images[0]?.url ?? detail.coverUrl;

  if (shouldShowThumbnailStrip(images)) {
    return <ProductGallery key={groupKey} images={images} title={detail.title} t={t} />;
  }

  return (
    <div className="aspect-[4/5] overflow-hidden border border-line bg-surface">
      <ProductMedia handle={detail.handle} title={detail.title} imageUrl={coverUrl} />
    </div>
  );
}
