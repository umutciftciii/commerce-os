import Link from "next/link";
import { Badge, Button, Container } from "@commerce-os/ui";
import { findSampleProduct, sampleProducts } from "../../../components/sample-products";

export function generateStaticParams() {
  return sampleProducts.map((product) => ({ handle: product.handle }));
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const product = findSampleProduct(handle);
  const name = product?.name ?? "Sample product";
  const priceLabel = product?.priceLabel ?? "₺—";
  const blurb =
    product?.blurb ?? "This is a placeholder product detail page for the storefront foundation.";

  return (
    <Container className="py-12">
      <nav className="mb-6 text-sm text-slate-400" aria-label="Breadcrumb">
        <Link href="/products" className="hover:text-slate-600">
          Products
        </Link>
        <span className="px-2">/</span>
        <span className="text-slate-600">{name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="aspect-square rounded-xl bg-slate-100" />

        <div>
          <Badge tone="neutral">Demo product</Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{name}</h1>
          <p className="mt-2 text-xl text-slate-900">{priceLabel}</p>
          <p className="mt-4 text-sm leading-relaxed text-slate-500">{blurb}</p>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-slate-700">Variant</p>
            <div className="flex gap-2">
              {["S", "M", "L"].map((size) => (
                <span
                  key={size}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-sm text-slate-600"
                >
                  {size}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <Button disabled>Add to cart</Button>
            <Button variant="secondary" disabled>
              Buy now
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Cart and checkout actions are placeholders; no real purchase logic runs yet.
          </p>
        </div>
      </div>
    </Container>
  );
}
