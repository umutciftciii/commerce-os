import Link from "next/link";
import { Alert, Button, Container, EmptyState } from "@commerce-os/ui";
import { getStorefrontDict } from "../../lib/i18n";
import { readCartItems, readCoupon } from "../../lib/server/cart-cookie";
import { resolveCart } from "../../lib/server/cart";
import { CheckoutForm } from "../../components/checkout-form";

export const dynamic = "force-dynamic";

/**
 * Checkout sayfasi (F3B.1). Sepet sunucu-otoriter cozulur; bos/uygunsuz sepette
 * form gosterilmez. Form submit'i Server Action ile gateway public checkout
 * ucuna gider; order olusumu/stok rezervasyonu sunucu tarafindadir.
 */
export default async function CheckoutPage() {
  const t = (await getStorefrontDict()).checkout;
  const items = await readCartItems();

  if (items.length === 0) {
    return <EmptyCheckout t={t} />;
  }

  const coupon = await readCoupon();
  const result = await resolveCart(items, coupon);
  if (!result.ok) {
    return (
      <Container className="py-12">
        <h1 className="mb-6 text-2xl font-semibold tracking-tightish text-slate-900">{t.title}</h1>
        <Alert tone="error">{t.errorNoStore}</Alert>
      </Container>
    );
  }

  if (result.data.isEmpty) {
    return <EmptyCheckout t={t} />;
  }

  return (
    <Container className="py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tightish text-slate-900">{t.title}</h1>
        <Link href="/cart" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← {t.backToCart}
        </Link>
      </div>
      <CheckoutForm view={result.data} t={t} />
    </Container>
  );
}

function EmptyCheckout({ t }: { t: Awaited<ReturnType<typeof getStorefrontDict>>["checkout"] }) {
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
