import Link from "next/link";
import { Button, Container, EmptyState } from "@commerce-os/ui";
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
            <Link href="/products">
              <Button>{t.success.continueShopping}</Button>
            </Link>
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
