"use client";

/**
 * ADR-065 Faz 2 (Dilim 1) — GEÇİCİ smoke sayfası.
 *
 * Hiçbir gerçek entity'ye bağlı değildir; MediaUpload primitive'ini (tekil + çoklu
 * + kütüphane) gerçek upload/list/delete uçlarıyla uçtan uca doğrulamak içindir.
 * Nav'a EKLENMEZ; doğrudan /media-lab ile erişilir. Dilim 2 (ürün galerisi)
 * başlarken kaldırılacaktır.
 */

import { useState } from "react";
import { PageHeader, SectionCard } from "../../../components/ui";
import { MediaUpload, type MediaItem } from "../../../components/media-upload";
import { ProductIcon } from "../../../components/icons";

export default function MediaLabPage() {
  const [single, setSingle] = useState<MediaItem[]>([]);
  const [gallery, setGallery] = useState<MediaItem[]>([]);

  return (
    <>
      <PageHeader
        eyebrow="ADR-065 · Dilim 1"
        title="Media Lab (geçici)"
        description="MediaUpload bileşeninin smoke doğrulaması. Yükle → önizle → kütüphaneden seç → kaldır."
      />

      <div className="space-y-6">
        <SectionCard title="Tekil (BRANDING)" description="single mode — tek görsel" icon={<ProductIcon />}>
          <MediaUpload
            context="BRANDING"
            mode="single"
            value={single}
            onAttach={(asset) => setSingle([{ id: asset.id, url: asset.url, altText: asset.altText }])}
            onRemove={(id) => setSingle((prev) => prev.filter((item) => item.id !== id))}
          />
        </SectionCard>

        <SectionCard title="Çoklu (PRODUCT)" description="multiple mode — galeri + sıralama" icon={<ProductIcon />}>
          <MediaUpload
            context="PRODUCT"
            mode="multiple"
            value={gallery}
            onAttach={(asset) =>
              setGallery((prev) =>
                prev.some((item) => item.id === asset.id)
                  ? prev
                  : [...prev, { id: asset.id, url: asset.url, altText: asset.altText }],
              )
            }
            onRemove={(id) => setGallery((prev) => prev.filter((item) => item.id !== id))}
            onReorder={(orderedIds) =>
              setGallery((prev) =>
                orderedIds
                  .map((id) => prev.find((item) => item.id === id))
                  .filter((item): item is MediaItem => item !== undefined),
              )
            }
          />
        </SectionCard>
      </div>
    </>
  );
}
