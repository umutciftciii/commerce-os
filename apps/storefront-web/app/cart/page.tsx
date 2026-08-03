import { ButtonLink, Container, EmptyState, Heading } from "../../components/ui";
import { getStorefrontDict } from "../../lib/i18n";
import {
  readCartItems,
  readCartNotice,
  readCoupon,
  readDeselectedItems,
  readShippingOption,
} from "../../lib/server/cart-cookie";
import type { CartNotice } from "../../lib/server/cart-cookie";
import { resolveAuthCartView, resolveCartWithCanonicalItems } from "../../lib/server/cart";
import type { CartView as CartViewModel } from "../../lib/server/cart";
import { CartView } from "../../components/cart-view";
// TODO-161B (ADR-137) — Sepette düşük-yoğunluklu "Son İncelediklerin" (sepet ürünleri hariç).
import { RecentlyViewedRail } from "../../components/recently-viewed/recently-viewed-rail";
import { isStorefrontModuleEnabled } from "../../lib/server/site";

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
  const dict = await getStorefrontDict();
  const t = dict.cart;
  // TODO-167 (ADR-266) — Kullanici-dostu persistent-cart bildirimi (merge / cross-device). Salt-okuma
  // (RSC mutasyon yapamaz); CartView gösterdikten sonra one-shot temizler.
  const notice = await readCartNotice();

  // TODO-167 (ADR-266) — Oturum acmis musteride sepet KALICI DB cart'tan (cross-device)
  // gelir; misafirde mevcut cookie referans kalemlerinden. Anonim yol DEGISMEDI.
  // BUG-CART-002 — Checkbox secim-disi varyantlar (storefront cookie) auth gorunume de tasinir;
  // aksi halde deselect edilen satir her refresh'te yeniden secili render olurdu (regresyon C).
  const authDeselected = await readDeselectedItems();
  const authView = await resolveAuthCartView(authDeselected);
  if (authView) {
    if (!authView.ok || authView.data.isEmpty) {
      return <EmptyCart t={t} />;
    }
    return (
      <CartPageShell view={authView.data} canonicalItems={[]} reconcileNeeded={false} notice={notice} t={t} dict={dict} />
    );
  }

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

  // Cookie ile gateway-kanonik kalemler farkliysa istemci reconcile eder (yalniz misafir).
  const reconcileNeeded = !sameItems(items, canonicalItems);

  return (
    <CartPageShell
      view={view}
      canonicalItems={canonicalItems}
      reconcileNeeded={reconcileNeeded}
      notice={notice}
      t={t}
      dict={dict}
    />
  );
}

/** Ortak sepet govdesi (auth DB cart + misafir cookie ayni render'i paylasir). */
async function CartPageShell({
  view,
  canonicalItems,
  reconcileNeeded,
  notice,
  t,
  dict,
}: {
  view: CartViewModel;
  canonicalItems: Array<{ variantId: string; quantity: number }>;
  reconcileNeeded: boolean;
  notice: CartNotice | null;
  t: Awaited<ReturnType<typeof getStorefrontDict>>["cart"];
  dict: Awaited<ReturnType<typeof getStorefrontDict>>;
}) {
  // TODO-163 Faz 3 (TD-156) — RECENTLY_VIEWED/WISHLIST capability projeksiyonu (island + kalp gizleme).
  const [recentlyViewedOn, wishlistOn] = await Promise.all([
    isStorefrontModuleEnabled("RECENTLY_VIEWED"),
    isStorefrontModuleEnabled("WISHLIST"),
  ]);
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
        notice={notice}
        t={t}
      />
      {/* TODO-161B — Düşük-yoğunluklu öneri: son incelenenler (sepetteki ürünler hariç; checkout akışı bozulmaz). */}
      {recentlyViewedOn ? (
        <RecentlyViewedRail
          t={dict}
          excludeSlugs={view.lines.map((line) => line.productSlug)}
          limit={12}
          placement="CART"
          wishlistEnabled={wishlistOn}
        />
      ) : null}
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
