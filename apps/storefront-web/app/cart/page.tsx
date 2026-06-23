import Link from "next/link";
import { Button, Container, EmptyState } from "@commerce-os/ui";
import { getStorefrontDict } from "../../lib/i18n";

export default function CartPage() {
  const t = getStorefrontDict().cart;

  return (
    <Container className="py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tightish text-slate-900">{t.title}</h1>
      <EmptyState
        title={t.emptyTitle}
        description={t.emptyDescription}
        action={
          <Link href="/products">
            <Button>{t.emptyAction}</Button>
          </Link>
        }
      />
    </Container>
  );
}
