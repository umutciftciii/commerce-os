import Link from "next/link";
import { Card, Container } from "@commerce-os/ui";
import { sampleProducts } from "../../components/sample-products";

export default function ProductListingPage() {
  return (
    <Container className="py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">All products</h1>
        <p className="mt-1 text-sm text-slate-500">
          Demo catalogue — placeholder products previewing the listing grid.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {sampleProducts.map((product) => (
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
  );
}
