import Link from "next/link";
import { Alert, Button, Container, EmptyState } from "@commerce-os/ui";
import { getStorefrontDict } from "../../lib/i18n";
import { readCartItems, readCoupon, readShippingOption } from "../../lib/server/cart-cookie";
import { resolveCartWithCanonicalItems } from "../../lib/server/cart";
import { CartView } from "../../components/cart-view";

export const dynamic = "force-dynamic";

/**
 * Sepet sayfasi (F3B.1). Cookie'deki referans kalemler gateway'de sunucu-otoriter
 * cozulur; fiyat/stok/uygunluk gateway'den gelir. Cozulemeyen/kisilmis kalemler
 * varsa istemci tarafi reconcile tetiklenir (cookie kanonik hale getirilir).
 */
export default async function CartPage() {
  const t = (await getStorefrontDict()).cart;
  const items = await readCartItems();

  if (items.length === 0) {
    return <EmptyCart t={t} />;
  }

  const coupon = await readCoupon();
  const shippingOption = await readShippingOption();
  const result = await resolveCartWithCanonicalItems(items, coupon, shippingOption);
  if (!result.ok) {
    return (
      <Container className="py-12">
        <h1 className="mb-6 text-2xl font-semibold tracking-tightish text-slate-900">{t.title}</h1>
        <Alert tone="error" title={t.errorTitle}>
          {t.errorDescription}
        </Alert>
      </Container>
    );
  }

  const { view, canonicalItems } = result.data;
  if (view.isEmpty) {
    return <EmptyCart t={t} />;
  }

  // Cookie ile gateway-kanonik kalemler farkliysa istemci reconcile eder.
  const reconcileNeeded = !sameItems(items, canonicalItems);

  return (
    <Container className="py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tightish text-slate-900">{t.title}</h1>
      <CartView
        view={view}
        canonicalItems={canonicalItems}
        reconcileNeeded={reconcileNeeded}
        t={t}
      />
    </Container>
  );
}

function EmptyCart({ t }: { t: Awaited<ReturnType<typeof getStorefrontDict>>["cart"] }) {
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

function sameItems(
  a: Array<{ variantId: string; quantity: number }>,
  b: Array<{ variantId: string; quantity: number }>,
): boolean {
  if (a.length !== b.length) return false;
  const map = new Map(a.map((item) => [item.variantId, item.quantity]));
  return b.every((item) => map.get(item.variantId) === item.quantity);
}
