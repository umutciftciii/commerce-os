import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink, Container, EmptyState, Heading } from "../../components/ui";
import { getStorefrontDict } from "../../lib/i18n";
import {
  readCoupon,
  readDeselectedItems,
  readShippingOption,
} from "../../lib/server/cart-cookie";
import { getPaymentAvailability, resolveCheckoutView } from "../../lib/server/cart";
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

  // BUG-CART-003 (BUG 3) — Checkout, cart sayfasıyla AYNI kanonik sepeti çözer: oturum açmış
  // müşteride DB cart OTORİTER (cross-device; login-merge sonrası cookie boş olabilir). Önceden
  // burada yalnız cookie (`readCartItems`) okunuyordu → DB cart dolu olsa bile "Sepetiniz boş".
  // Checkout YALNIZCA seçili + sipariş verilebilir satırlardan oluşur; hiç yoksa boş-checkout.
  const coupon = await readCoupon();
  const shippingOption = await readShippingOption();
  const deselected = await readDeselectedItems();
  const checkoutView = await resolveCheckoutView({
    couponCode: coupon,
    shippingOptionId: shippingOption,
    deselectedVariantIds: deselected,
  });
  if (checkoutView.kind === "error") {
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

  if (checkoutView.kind === "empty") {
    return <EmptyCheckout t={t} />;
  }

  const result = { data: checkoutView.view };

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
      <CheckoutSteps t={t} />
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

/**
 * "Storefront - Checkout" tasarımı — ilerleme adımları (Sepet → Teslimat & Ödeme → Onay).
 * Statik gösterge (mevcut tek-sayfa checkout akışını yansıtır): Sepet tamamlandı, Teslimat &
 * Ödeme şu anki adım (aria-current), Onay sonraki. Token-tabanlı; aksan taşımaz.
 */
function CheckoutSteps({ t }: { t: Awaited<ReturnType<typeof getStorefrontDict>>["checkout"] }) {
  const steps: { label: string; state: "done" | "current" | "upcoming" }[] = [
    { label: t.stepCart, state: "done" },
    { label: t.stepDelivery, state: "current" },
    { label: t.stepConfirm, state: "upcoming" },
  ];
  return (
    <nav
      aria-label={t.stepsLabel}
      className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wideish"
    >
      {steps.map((step, index) => (
        <span key={step.label} className="flex items-center gap-2">
          <span
            aria-current={step.state === "current" ? "step" : undefined}
            className={
              step.state === "upcoming"
                ? "text-ink-subtle"
                : step.state === "current"
                  ? "font-semibold text-ink"
                  : "text-ink-muted"
            }
          >
            {step.label}
          </span>
          {index < steps.length - 1 ? (
            <span aria-hidden className="text-line-strong">
              →
            </span>
          ) : null}
        </span>
      ))}
    </nav>
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
