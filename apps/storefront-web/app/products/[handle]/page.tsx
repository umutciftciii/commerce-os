import Link from "next/link";
import { Badge, Button, Container } from "@commerce-os/ui";
import { findSampleProduct, sampleProductHandles } from "../../../components/sample-products";
import { getStorefrontDict } from "../../../lib/i18n";

export function generateStaticParams() {
  return sampleProductHandles().map((handle) => ({ handle }));
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const t = (await getStorefrontDict()).detail;
  const product = await findSampleProduct(handle);
  const name = product?.name ?? t.fallbackName;
  const category = product?.category ?? t.fallbackCategory;
  const priceLabel = product?.priceLabel ?? "₺—";
  const blurb = product?.blurb ?? t.fallbackBlurb;

  return (
    <Container className="py-12">
      <nav className="mb-6 text-sm text-slate-400" aria-label="Sayfa yolu">
        <Link href="/products" className="hover:text-slate-600">
          {t.breadcrumbProducts}
        </Link>
        <span className="px-2">/</span>
        <span className="text-slate-600">{name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="aspect-square rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200" />

        <div>
          <Badge tone="neutral">{category}</Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-tightish text-slate-900">{name}</h1>
          <p className="mt-2 text-xl font-semibold text-slate-900">{priceLabel}</p>
          <p className="mt-4 text-sm leading-relaxed text-slate-500">{blurb}</p>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-slate-700">{t.sizeLabel}</p>
            <div className="flex gap-2">
              {["S", "M", "L"].map((size) => (
                <span
                  key={size}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-sm text-slate-600 transition-colors hover:border-slate-300"
                >
                  {size}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <Button disabled>{t.addToCart}</Button>
            <Button variant="secondary" disabled>
              {t.buyNow}
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-400">{t.note}</p>
        </div>
      </div>
    </Container>
  );
}
