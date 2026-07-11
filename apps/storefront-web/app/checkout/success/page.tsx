import { ButtonLink, Container, EmptyState } from "../../../components/ui";
import { getStorefrontDict } from "../../../lib/i18n";
import { readCheckoutConfirmationCookie } from "../../../lib/server/cart-cookie";
import { CheckoutSuccess } from "../../../components/checkout-success";

export const dynamic = "force-dynamic";

/**
 * F3B.2 — Order onay sayfasi. Uygun TEST/MOCK provider YOKKEN checkout sonrasi
 * SUNUCU-TARAFI redirect ile buraya gelinir. Onay, sepetten BAGIMSIZ olarak kisa
 * omurlu imzali cookie'den okunur; boylece sepet temizlenmis olsa bile siparis
 * ozeti gosterilir (empty-state'e dusmez). Dogrudan/cookie'siz erisimde notr
 * "yakin zamanda siparis yok" durumu gosterilir.
 *
 * Kapsayici/bos yuzeyler vitrin DS'ine göçtü (yerel components/ui barrel, cart
 * sayfasiyla birebir dil): editoryel EmptyState + nötr `ButtonLink variant="primary"`.
 * Accent (menekse) yalniz gerçek onay CTA'sinda (CheckoutSuccess "Alışverişe devam
 * et"); bos-durum aksiyonu NOTR kalir. Cookie okuma/cart-bagimsiz render/routing
 * DEGISMEDI — yalniz görsel katman.
 */
export default async function CheckoutSuccessPage() {
  const t = (await getStorefrontDict()).checkout;
  const confirmation = await readCheckoutConfirmationCookie();

  if (!confirmation) {
    return (
      <Container className="py-12">
        <EmptyState
          title={t.success.noOrderTitle}
          description={t.success.noOrderDescription}
          action={
            <ButtonLink href="/products" variant="primary">
              {t.success.continueShopping}
            </ButtonLink>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="py-12">
      <CheckoutSuccess confirmation={confirmation} t={t} />
    </Container>
  );
}
