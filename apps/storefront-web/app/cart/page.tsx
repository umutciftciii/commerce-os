import { ButtonLink, Container, EmptyState, Heading } from "../../components/ui";
import { getStorefrontDict } from "../../lib/i18n";
import {
  readCartItems,
  readCoupon,
  readDeselectedItems,
  readShippingOption,
} from "../../lib/server/cart-cookie";
import { resolveCartWithCanonicalItems } from "../../lib/server/cart";
import { CartView } from "../../components/cart-view";

export const dynamic = "force-dynamic";

/**
 * Sepet sayfasi (F3B.1). Cookie'deki referans kalemler gateway'de sunucu-otoriter
 * cozulur; fiyat/stok/uygunluk gateway'den gelir. Cozulemeyen/kisilmis kalemler
 * varsa istemci tarafi reconcile tetiklenir (cookie kanonik hale getirilir).
 *
 * Kapsayici/bos/hata yuzeyleri vitrin DS'ine göçtü (yerel components/ui barrel,
 * PLP/PDP dili): serif Heading, editoryel EmptyState, hairline hata kutusu.
 */
export default async function CartPage() {
  const t = (await getStorefrontDict()).cart;
  const items = await readCartItems();

  if (items.length === 0) {
    return <EmptyCart t={t} />;
  }

  const coupon = await readCoupon();
  const shippingOption = await readShippingOption();
  const deselected = await readDeselectedItems();
  const result = await resolveCartWithCanonicalItems(items, coupon, shippingOption, deselected);
  if (!result.ok) {
    return (
      <Container className="py-12">
        <Heading as="h1" className="mb-6">
          {t.title}
        </Heading>
        <div className="border border-line bg-surface-muted px-4 py-4">
          <p className="text-sm font-semibold text-red-600">{t.errorTitle}</p>
          <p className="mt-1 text-sm text-ink-muted">{t.errorDescription}</p>
        </div>
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
      {/* Dilim 6a-refine — Baslikta sepetteki kalem sayisi (mockup: "Sepetim (N)"). */}
      <Heading as="h1" className="mb-6">
        {t.title} ({view.lines.length})
      </Heading>
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
      <Heading as="h1" className="mb-6">
        {t.title}
      </Heading>
      <EmptyState
        title={t.emptyTitle}
        description={t.emptyDescription}
        action={
          <ButtonLink href="/products" variant="primary">
            {t.emptyAction}
          </ButtonLink>
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
