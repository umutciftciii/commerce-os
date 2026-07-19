import { ButtonLink, Container, EmptyState } from "../components/ui";
import { getStorefrontDict } from "../lib/i18n";

/**
 * TODO-156D (brief §7) — Global 404 sınırı. `notFound()` (silinen ürün vb.) buraya düşer; Next HTTP 404
 * döndürür (soft-404 DEĞİL) ve bu route otomatik noindex'tir. Ana sayfaya redirect YOK — kullanıcı kendi
 * seçer (Ürünler / Ana sayfa). Root layout içinde render olur (header/footer korunur).
 */
export default async function NotFound() {
  const dict = await getStorefrontDict();
  const t = dict.detail;
  return (
    <Container className="py-24">
      <EmptyState
        title={t.notFoundTitle}
        description={t.notFoundDescription}
        action={
          <ButtonLink href="/products" variant="secondary">
            {t.notFoundAction}
          </ButtonLink>
        }
      />
    </Container>
  );
}
