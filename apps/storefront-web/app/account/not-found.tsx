import { ButtonLink, Container, EmptyState } from "../../components/ui";
import { getStorefrontDict } from "../../lib/i18n";

/**
 * BUG-CART-004 — Account-domain 404 sınırı. `/account/**` altındaki herhangi bir
 * `notFound()` (sipariş/iade/liste yok ya da sahiplik yok) artık KÖK
 * `app/not-found.tsx`'e (ürün-domain "Ürün bulunamadı" + /products) DÜŞMEZ; bu
 * hesap-uygun ekrana düşer. Gerçek HTTP 404 + otomatik noindex korunur; header/footer
 * root layout'tan gelir. Daha spesifik segmentler (ör. sipariş detayı) kendi
 * scoped not-found.tsx'ini sağlayabilir; Next en yakın sınırı seçer.
 */
export default async function AccountNotFound() {
  const dict = await getStorefrontDict();
  const n = dict.account.notFound;
  return (
    <Container className="py-24">
      <EmptyState
        title={n.title}
        description={n.description}
        action={
          <ButtonLink href="/account" variant="secondary">
            {n.backToAccount}
          </ButtonLink>
        }
      />
    </Container>
  );
}
