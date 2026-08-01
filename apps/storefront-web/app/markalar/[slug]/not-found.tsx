import { ButtonLink, Container, EmptyState } from "../../../components/ui";
import { getStorefrontDict } from "../../../lib/i18n";
import { brandsPath, productsPath } from "../../../lib/seo/routes";

/**
 * TODO-165A (ADR-165A) Task 20 fix (coordinator review) — segment-level 404 for `/markalar/[slug]`.
 *
 * `notFound()` in `app/markalar/[slug]/page.tsx` (unknown/archived/cross-store brand slug — both in
 * `generateMetadata` and the page body, mirroring the PDP's soft-404 hotfix pattern) now renders THIS
 * branded boundary instead of falling through to the generic `app/not-found.tsx` — same real HTTP 404 +
 * automatic noindex, but brand-appropriate copy + a "back to brands" action (not the generic "back to
 * products" one). Wires the `brands.notFoundTitle/notFoundDescription/viewProducts/backToBrands` i18n
 * keys that were previously added but unreferenced.
 */
export default async function BrandNotFound() {
  const dict = await getStorefrontDict();
  const s = dict.brands;
  return (
    <Container className="py-24">
      <EmptyState
        title={s.notFoundTitle}
        description={s.notFoundDescription}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href={brandsPath()} variant="secondary">
              {s.backToBrands}
            </ButtonLink>
            <ButtonLink href={productsPath()} variant="secondary">
              {s.viewProducts}
            </ButtonLink>
          </div>
        }
      />
    </Container>
  );
}
