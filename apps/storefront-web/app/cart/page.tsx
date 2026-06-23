import Link from "next/link";
import { Button, Container, EmptyState } from "@commerce-os/ui";

export default function CartPage() {
  return (
    <Container className="py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-slate-900">Your cart</h1>
      <EmptyState
        title="Your cart is empty"
        description="Add demo products to preview cart lines, quantities and totals. Cart state is not persisted yet."
        action={
          <Link href="/products">
            <Button>Browse products</Button>
          </Link>
        }
      />
    </Container>
  );
}
