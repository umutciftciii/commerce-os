import { ButtonLink, Container, EmptyState } from "../../../../components/ui";
import { getStorefrontDict } from "../../../../lib/i18n";

/**
 * BUG-CART-004 — Sipariş-detayı 404 sınırı. `app/account/orders/[orderNumber]/page.tsx`
 * içindeki `notFound()` (sipariş yok / başka müşteri) artık ÜRÜN-404 yerine bu
 * sipariş-uygun ekranı gösterir. Gerçek HTTP 404 + noindex korunur. Mevcut
 * `account.orders.detail.notFoundTitle/notFoundNote/backToList` i18n anahtarlarını
 * kullanır (önceden tanımlı ama bir sınır tarafından referans edilmiyordu).
 */
export default async function OrderNotFound() {
  const dict = await getStorefrontDict();
  const o = dict.account.orders.detail;
  return (
    <Container className="py-24">
      <EmptyState
        title={o.notFoundTitle}
        description={o.notFoundNote}
        action={
          <ButtonLink href="/account?section=orders" variant="secondary">
            {o.backToList}
          </ButtonLink>
        }
      />
    </Container>
  );
}
