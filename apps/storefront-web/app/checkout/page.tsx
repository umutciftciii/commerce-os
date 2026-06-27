import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Button, Container, EmptyState } from "@commerce-os/ui";
import { getStorefrontDict } from "../../lib/i18n";
import { readCartItems, readCoupon } from "../../lib/server/cart-cookie";
import { getPaymentAvailability, resolveCart } from "../../lib/server/cart";
import { getCurrentCustomer, listCustomerAddresses } from "../../lib/server/customer";
import { CheckoutForm } from "../../components/checkout-form";

export const dynamic = "force-dynamic";

/**
 * Checkout sayfasi (F3B.1 + F3B.3 guard). Once oturum zorunlu: oturum yoksa
 * kullanici /auth/login?next=/checkout'a yonlendirilir (sepet cookie'si korunur).
 * Oturum varsa sepet sunucu-otoriter cozulur; teslimat adresi adres defterinden
 * secilir (kayitli adres yoksa "adres ekle" yonlendirmesi). Order, gateway'de
 * `x-customer-session` ile customerId'ye baglanir.
 */
export default async function CheckoutPage() {
  const t = (await getStorefrontDict()).checkout;

  // 1) Guard — checkout yalnizca oturum acmis musteriye acik.
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/auth/login?next=/checkout");
  }

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

  // 2) Adres defteri — kayitli adres yoksa checkout devam etmez; adres ekleme cagrisi.
  const addresses = await listCustomerAddresses();
  if (addresses.length === 0) {
    return (
      <Container className="py-12">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tightish text-slate-900">{t.title}</h1>
          <Link href="/cart" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            ← {t.backToCart}
          </Link>
        </div>
        <EmptyState
          title={t.addressBook.noneTitle}
          description={t.addressBook.noneDescription}
          action={
            <Link href="/account?section=addresses">
              <Button>{t.addressBook.addCta}</Button>
            </Link>
          }
        />
      </Container>
    );
  }

  const paymentTestEnabled = await getPaymentAvailability();

  return (
    <Container className="py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tightish text-slate-900">{t.title}</h1>
        <Link href="/cart" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← {t.backToCart}
        </Link>
      </div>
      <CheckoutForm
        view={result.data}
        t={t}
        paymentTestEnabled={paymentTestEnabled}
        addressBook={{ addresses, accountEmail: customer.email }}
      />
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
