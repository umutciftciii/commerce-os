import Link from "next/link";
import { Button, Container } from "@commerce-os/ui";
import { ProductCard } from "../components/product-card";
import { getSampleProducts } from "../components/sample-products";
import { getStorefrontDict } from "../lib/i18n";

export default function HomePage() {
  const t = getStorefrontDict().home;
  const featured = getSampleProducts().slice(0, 3);

  return (
    <>
      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <Container className="py-20 sm:py-24">
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-card">
            {t.badge}
          </span>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tightish text-slate-900 sm:text-5xl">
            {t.heroTitle}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-500">
            {t.heroDescription}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/products">
              <Button>{t.shopCta}</Button>
            </Link>
            <Link href="/cart">
              <Button variant="secondary">{t.cartCta}</Button>
            </Link>
          </div>
        </Container>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <Container className="grid grid-cols-1 gap-px overflow-hidden sm:grid-cols-3">
          {t.valueProps.map((prop) => (
            <div key={prop.title} className="py-6 sm:px-6">
              <p className="text-sm font-semibold text-slate-900">{prop.title}</p>
              <p className="mt-1 text-sm text-slate-500">{prop.detail}</p>
            </div>
          ))}
        </Container>
      </section>

      <section>
        <Container className="py-14">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                {t.featuredEyebrow}
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tightish text-slate-900">
                {t.featuredTitle}
              </h2>
            </div>
            <Link
              href="/products"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              {t.featuredViewAll}
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((product) => (
              <ProductCard key={product.handle} product={product} />
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
