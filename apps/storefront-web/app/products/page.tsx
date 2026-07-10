import { ButtonLink, Container, EmptyState, Eyebrow, Heading, Lead } from "../../components/ui";
import { ProductListingView } from "../../components/site/product-listing";
import { getRequestLocale, getStorefrontDict } from "../../lib/i18n";
import { getStorefrontListing } from "../../lib/server/catalog";

// Canli katalog her istekte cozulur (sunucu-tarafi resolver + token).
export const dynamic = "force-dynamic";

export default async function ProductListingPage() {
  const dict = await getStorefrontDict();
  const t = dict.listing;
  const result = await getStorefrontListing(await getRequestLocale());

  if (!result.ok && result.reason === "error") {
    return (
      <Container className="py-16 lg:py-20">
        <ListingHeader t={t} />
        <EmptyState className="mt-10" title={t.errorTitle} description={t.errorDescription} />
      </Container>
    );
  }

  const products = result.ok ? result.data : [];

  return (
    <Container className="py-16 lg:py-20">
      <ListingHeader t={t} />
      {products.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={
            <ButtonLink href="/" variant="secondary">
              {dict.shell.brand}
            </ButtonLink>
          }
        />
      ) : (
        <div className="mt-10 lg:mt-12">
          <ProductListingView products={products} t={dict} />
        </div>
      )}
    </Container>
  );
}

/** Editoryel liste basligi (eyebrow + serif baslik + kisa aciklama). */
function ListingHeader({ t }: { t: Awaited<ReturnType<typeof getStorefrontDict>>["listing"] }) {
  return (
    <header className="max-w-2xl">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Heading as="h1" className="mt-3">
        {t.title}
      </Heading>
      <Lead className="mt-3">{t.tagline}</Lead>
    </header>
  );
}
