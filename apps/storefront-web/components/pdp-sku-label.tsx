"use client";

// TODO-165 (SKU reactivity fix) — PDP başlık altındaki "Ürün kodu" göstergesi. Önceden RSC'de
// statik `detail.sku` (varsayılan varyant) idi; renk/beden seçimi değişince güncellenmiyordu
// (Buy Box'ın kendi SKU'su reaktifti → tutarsızlık). Bu client bileşen PAYLAŞILAN
// PdpSelection context'inden seçili varyantı okur → Buy Box seçili varyantı çözünce (auto-heal
// dahil) SKU senkron güncellenir.
//
// Hidrasyon güvenli: başlangıç selectedVariantId = varsayılan (en ucuz) varyant (provider SSR +
// client aynı ilk state) → ilk render sunucuyla aynı SKU'yu üretir, sıçrama yok.
// Yanıltıcı SKU önlenir: selectedVariantId geçerli bir varyanta çözülmezse fallback (varsayılan)
// gösterilir; hiç yoksa hiçbir şey gösterilmez.

import { usePdpSelection } from "./pdp-selection";

interface SkuVariant {
  id: string;
  sku: string;
}

export function PdpSkuLabel({
  variants,
  fallbackSku,
  label,
}: {
  variants: SkuVariant[];
  fallbackSku: string | null;
  label: string;
}) {
  const { selectedVariantId } = usePdpSelection();
  const selected = selectedVariantId
    ? variants.find((variant) => variant.id === selectedVariantId) ?? null
    : null;
  const sku = selected?.sku ?? fallbackSku;
  if (!sku) return null;
  return (
    <p className="mt-2 text-sm text-ink-subtle">
      {label}: <span className="font-medium text-ink-muted">{sku}</span>
    </p>
  );
}
