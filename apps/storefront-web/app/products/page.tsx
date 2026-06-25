import Link from "next/link";
import { Button, Container, EmptyState } from "@commerce-os/ui";
import { format } from "@commerce-os/i18n";
import { ProductCard } from "../../components/product-card";
import { getStorefrontDict } from "../../lib/i18n";
import { getStorefrontListing } from "../../lib/server/catalog";

// Canli katalog her istekte cozulur (sunucu-tarafi resolver + token).
export const dynamic = "force-dynamic";

export default async function ProductListingPage() {
  const dict = await getStorefrontDict();
  const t = dict.listing;
  const result = await getStorefrontListing();

  if (!result.ok && result.reason === "error") {
    return (
      <Container className="py-12">
        <EmptyState title={t.errorTitle} description={t.errorDescription} />
      </Container>
    );
  }

  const products = result.ok ? result.data : [];

  return (
    <Container className="py-12">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{t.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tightish text-slate-900">{t.title}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{format(t.description, { count: products.length })}</p>
      </header>

      {products.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={
            <Link href="/">
              <Button variant="secondary">{dict.shell.brand}</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:gap-6 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.handle} product={product} t={dict} />
          ))}
        </div>
      )}
    </Container>
  );
}
