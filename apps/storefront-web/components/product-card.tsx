import Link from "next/link";
import { Card } from "@commerce-os/ui";
import type { SampleProduct } from "./sample-products";

/**
 * Vitrin urun karti. Bos gri kutu yerine, kategori + rozet + fiyat ile
 * urunlesmis bir e-ticaret karti hissi verir. Gorseller yer tutucudur.
 * Tum gorunur metin sozlukten gelen urun verisidir.
 */
export function ProductCard({ product }: { product: SampleProduct }) {
  return (
    <Link href={`/products/${product.handle}`} className="group block">
      <Card className="overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-card-hover">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
          {product.tag ? (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 shadow-card backdrop-blur">
              {product.tag}
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            {product.category}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900 group-hover:text-brand-700">
            {product.name}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{product.priceLabel}</p>
        </div>
      </Card>
    </Link>
  );
}
