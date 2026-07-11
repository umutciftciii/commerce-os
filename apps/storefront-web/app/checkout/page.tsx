import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink, Container, EmptyState, Heading } from "../../components/ui";
import { getStorefrontDict } from "../../lib/i18n";
import { readCartItems, readCoupon, readShippingOption } from "../../lib/server/cart-cookie";
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
 *
 * Kapsayici/bos/hata yuzeyleri vitrin DS'ine göçtü (yerel components/ui barrel,
 * cart sayfasiyla ayni dil): serif Heading, editoryel EmptyState, hairline hata
 * kutusu, ink alt-cizgi "geri" baglantisi.
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
  const shippingOption = await readShippingOption();
  const result = await resolveCart(items, coupon, shippingOption);
  if (!result.ok) {
    return (
      <Container className="py-12">
        <Heading as="h1" className="mb-6">
          {t.title}
        </Heading>
        <div className="border border-line bg-surface-muted px-4 py-4">
          <p className="text-sm text-red-600">{t.errorNoStore}</p>
        </div>
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
          <Heading as="h1">{t.title}</Heading>
          <BackToCart label={t.backToCart} />
        </div>
        <EmptyState
          title={t.addressBook.noneTitle}
          description={t.addressBook.noneDescription}
          action={
            <ButtonLink href="/account?section=addresses" variant="primary">
              {t.addressBook.addCta}
            </ButtonLink>
          }
        />
      </Container>
    );
  }

  const paymentTestEnabled = await getPaymentAvailability();

  return (
    <Container className="py-12">
      <div className="mb-6 flex items-center justify-between">
        <Heading as="h1">{t.title}</Heading>
        <BackToCart label={t.backToCart} />
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

/** Sepete dönüş bağlantısı — ink alt-çizgi (vitrin DS bağlantı dili). */
function BackToCart({ label }: { label: string }) {
  return (
    <Link
      href="/cart"
      className="text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
    >
      ← {label}
    </Link>
  );
}

function EmptyCheckout({ t }: { t: Awaited<ReturnType<typeof getStorefrontDict>>["checkout"] }) {
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
