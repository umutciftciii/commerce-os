import { Container } from "@commerce-os/ui";
import { format } from "@commerce-os/i18n";
import { ProductCard } from "../../components/product-card";
import { getSampleProducts } from "../../components/sample-products";
import { getStorefrontDict } from "../../lib/i18n";

export default function ProductListingPage() {
  const t = getStorefrontDict().listing;
  const products = getSampleProducts();

  return (
    <Container className="py-12">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{t.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tightish text-slate-900">{t.title}</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {format(t.description, { count: products.length })}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-5 sm:gap-6 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.handle} product={product} />
        ))}
      </div>
    </Container>
  );
}
