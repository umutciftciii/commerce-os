import Link from "next/link";
import { Button, Card, Container } from "@commerce-os/ui";
import { sampleProducts } from "../components/sample-products";

export default function HomePage() {
  const featured = sampleProducts.slice(0, 3);

  return (
    <>
      <section className="border-b border-slate-200 bg-slate-50">
        <Container className="py-20">
          <p className="text-sm font-medium text-brand-600">Demo Store</p>
          <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Everyday essentials, thoughtfully made.
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-500">
            A demo storefront running on commerce-os. Products, cart and checkout below are
            placeholders that preview the shopping experience.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/products">
              <Button>Shop products</Button>
            </Link>
            <Link href="/cart">
              <Button variant="secondary">View cart</Button>
            </Link>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-14">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Featured</h2>
            <Link
              href="/products"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((product) => (
              <Link key={product.handle} href={`/products/${product.handle}`}>
                <Card className="overflow-hidden transition-shadow hover:shadow-md">
                  <div className="aspect-square bg-slate-100" />
                  <div className="p-4">
                    <p className="text-sm font-medium text-slate-900">{product.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{product.priceLabel}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
