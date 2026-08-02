import Link from "next/link";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type {
  StorefrontDiscoveryEditorial,
  StorefrontDiscoveryGridCard,
  StorefrontDiscoverySection,
  StorefrontProductSummary,
} from "../../../lib/catalog-types";
import { Container, Eyebrow, Heading, ProductMediaFrame } from "../../ui";
import { DiscoveryTracker } from "./discovery-tracker";

/** Bir top-level section'ın izleme meta'sını (ürünler + editoryal CTA hedefleri) türetir. */
function trackerMeta(section: StorefrontDiscoverySection): {
  products: { id: string; handle: string }[];
  ctaHrefs: string[];
} {
  const products: { id: string; handle: string }[] = [];
  const ctaHrefs: string[] = [];
  const pushProducts = (list: StorefrontProductSummary[]) => {
    for (const p of list) products.push({ id: p.id, handle: p.handle });
  };
  if (section.type === "DISCOVERY_GRID") {
    for (const card of section.cards ?? []) {
      pushProducts(card.products);
      if (card.editorial) ctaHrefs.push(card.editorial.ctaHref);
    }
  } else {
    pushProducts(section.products);
    if (section.editorial) ctaHrefs.push(section.editorial.ctaHref);
  }
  return { products, ctaHrefs };
}

/**
 * TODO-162 (ADR-202/203/206) — Katman B viewer-specific Discovery section renderer (Server Component).
 *
 * Gateway'in `/home/discovery` ucundan gelen section'ları render eder. **Eligibility SUNUCU-tarafındadır**:
 * yalnız eligible section'lar gelir → hepsi RENDER edilir (boş başlık/spacing/impression yok; ineligible
 * olan zaten yanıtta yoktur). Sunucu-tarafı render → flash/CLS yok (§21/§24). DISCOVERY_GRID hero altı
 * grid (2-4 kart); rail'ler yatay şerit; SPONSORED_RAIL "Sponsorlu" etiketli; EDITORIAL_CAMPAIGN kart.
 */

const SECTION_SPACING = "py-14 sm:py-20 lg:py-24";

function resolveTitle(section: { type: string; title: string | null }, dict: StorefrontDictionary): string {
  if (section.title) return section.title;
  const titles = dict.discovery.titles;
  return (titles as Record<string, string>)[section.type] ?? "";
}

export function DiscoverySections({
  sections,
  dict,
}: {
  sections: StorefrontDiscoverySection[];
  dict: StorefrontDictionary;
}) {
  if (sections.length === 0) return null;
  // Amazon-stili "gateway" düzen: DISCOVERY_GRID kendi grid bloğunu korur; diğer TÜM keşif bölümleri
  // (rail/sponsored/editorial) kompakt tile (başlık + 2×2 kapak + CTA) olarak TEK responsive grid'de yan
  // yana dizilir — 8-10 ürünlü yatay carousel yerine tıklamaya davetkâr kartlar (§dikkat çekicilik).
  const gridSections = sections.filter((section) => section.type === "DISCOVERY_GRID");
  const tileSections = sections.filter(
    (section) =>
      section.type !== "DISCOVERY_GRID" &&
      (section.type === "EDITORIAL_CAMPAIGN" ? Boolean(section.editorial) : section.products.length > 0),
  );
  return (
    <>
      {tileSections.length > 0 ? (
        <section className={SECTION_SPACING} aria-label={dict.discovery.gridTitle}>
          <Container>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
              {tileSections.map((section) => {
                // İzleme yalnız GÖSTERİLEN 4 kapak için (impression/click SSR ile bire bir).
                const displayed = section.products.slice(0, 4);
                const products = displayed.map((product) => ({ id: product.id, handle: product.handle }));
                const ctaHrefs = section.editorial ? [section.editorial.ctaHref] : [];
                return (
                  <DiscoveryTracker
                    key={section.id}
                    className="h-full"
                    sectionId={section.id}
                    sectionType={section.type}
                    source={section.source}
                    products={products}
                    ctaHrefs={ctaHrefs}
                  >
                    {section.type === "EDITORIAL_CAMPAIGN" && section.editorial ? (
                      <EditorialCard editorial={section.editorial} dict={dict} compact />
                    ) : (
                      <GatewayTile
                        sectionId={section.id}
                        title={resolveTitle(section, dict)}
                        products={section.products}
                        source={section.source}
                        sponsored={section.sponsored}
                        dict={dict}
                      />
                    )}
                  </DiscoveryTracker>
                );
              })}
            </div>
          </Container>
        </section>
      ) : null}
      {gridSections.map((section) => {
        const { products, ctaHrefs } = trackerMeta(section);
        return (
          <DiscoveryTracker
            key={section.id}
            sectionId={section.id}
            sectionType={section.type}
            source={section.source}
            products={products}
            ctaHrefs={ctaHrefs}
          >
            <DiscoveryGrid section={section} dict={dict} />
          </DiscoveryTracker>
        );
      })}
    </>
  );
}

/** Kişiselleştirilmiş (ziyaretçi sinyaline dayalı) kaynaklar → "Senin için seçildi" rozeti taşır. */
const PERSONALIZED_SOURCES = new Set([
  "RECENTLY_VIEWED",
  "CART",
  "PERSONALIZED_SIGNAL",
  "ORDER_HISTORY",
  "WISHLIST",
]);

/**
 * Amazon-stili "gateway" tile: kapsayıcı yüzey (çerçeve + gölge) + opsiyonel "Senin için seçildi" rozeti +
 * başlık + 2×2 kapak grid'i + CTA. 8-10 ürünlü carousel yerine kompakt, tıklamaya davetkâr kart. CTA bölümün
 * KENDİ ürünlerine götürür (`/discovery/:sectionId`) — tüm katalog DEĞİL (bölüme özel öneri/fırsat listesi).
 */
function GatewayTile({
  sectionId,
  title,
  products,
  source,
  sponsored,
  dict,
}: {
  sectionId: string;
  title: string;
  products: StorefrontProductSummary[];
  source: string;
  sponsored: boolean;
  dict: StorefrontDictionary;
}) {
  const four = products.slice(0, 4);
  const personalized = PERSONALIZED_SOURCES.has(source);
  return (
    <article className="flex h-full flex-col rounded-lg border border-line bg-surface p-5 shadow-sm transition-shadow duration-300 ease-premium hover:shadow-md">
      {personalized || sponsored ? (
        <div className="mb-3 flex items-center gap-2">
          {personalized ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-wideish text-accent">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                <path d="M6 0l1.3 3.5L11 4.2 8.3 6.7 9 10.5 6 8.6 3 10.5l.7-3.8L1 4.2l3.7-.7z" />
              </svg>
              {dict.discovery.personalizedBadge}
            </span>
          ) : null}
          {sponsored ? (
            <span className="text-[10px] font-medium uppercase tracking-wideish text-ink-subtle">
              {dict.search.sponsoredLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      <Heading as="h3" className="mb-4 text-base sm:text-lg">
        {title}
      </Heading>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {four.map((product) => (
          <GridThumb key={product.handle} product={product} />
        ))}
      </div>
      <Link
        href={`/discovery/${sectionId}`}
        className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent-ink"
      >
        {dict.discovery.viewAll}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M4.5 2l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </article>
  );
}

/** DISCOVERY_GRID: hero altı grid. columns = eligible kart sayısı (2-4). Tablet 2×2, mobile tek kolon. */
const GRID_COLS: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

function DiscoveryGrid({
  section,
  dict,
}: {
  section: StorefrontDiscoverySection;
  dict: StorefrontDictionary;
}) {
  const cards = section.cards ?? [];
  if (cards.length < 2) return null; // güvenlik: grid kuralı (min 2) sunucuda uygulanır; burada da savun.
  const colsClass = GRID_COLS[section.columns ?? cards.length] ?? "lg:grid-cols-2";
  const heading = section.title ?? dict.discovery.gridTitle;
  return (
    <section className={SECTION_SPACING} aria-label={heading}>
      <Container>
        <div className="mb-8 sm:mb-10">
          <Eyebrow>{section.subtitle ?? dict.discovery.gridEyebrow}</Eyebrow>
          <Heading as="h2" className="mt-2">
            {heading}
          </Heading>
        </div>
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 ${colsClass}`}>
          {cards.map((card, index) => (
            <DiscoveryGridCardTile key={`${card.type}-${index}`} card={card} dict={dict} />
          ))}
        </div>
      </Container>
    </section>
  );
}

/** Grid kartı: editoryal kart VEYA ürün kartı (başlık + 2×2 kapak grid'i + keşfet bağlantısı). */
function DiscoveryGridCardTile({
  card,
  dict,
}: {
  card: StorefrontDiscoveryGridCard;
  dict: StorefrontDictionary;
}) {
  const title = card.title ?? (dict.discovery.titles as Record<string, string>)[card.type] ?? "";
  if (card.editorial) {
    return (
      <article className="h-full">
        <EditorialCard editorial={card.editorial} dict={dict} compact />
      </article>
    );
  }
  const products = card.products.slice(0, 4);
  return (
    <article className="flex h-full flex-col rounded-md border border-line bg-surface p-4 sm:p-5">
      <Heading as="h3" className="mb-4 text-base sm:text-lg">
        {title}
      </Heading>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {products.map((product) => (
          <GridThumb key={product.handle} product={product} />
        ))}
      </div>
      <Link
        href="/products"
        className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wideish text-accent transition-colors hover:text-accent-ink"
      >
        {dict.discovery.viewAll}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M4.5 2l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </article>
  );
}

/** Kompakt kapak thumbnail'ı (grid kartı içinde). Tek link → PDP; başlık image altında (nested-link yok). */
function GridThumb({ product }: { product: StorefrontProductSummary }) {
  return (
    <Link href={`/products/${product.handle}`} className="group/thumb block">
      {/* TODO-165B — Ortak medya çerçevesi (contain + nötr zemin + kontrollü padding; blocker 6).
          NOT: bu thumbnail eskiden aspect-square idi; product-card variant'ı aspect-[4/5] uygular (kare→4/5). */}
      <ProductMediaFrame
        variant="product-card"
        handle={product.handle}
        title={product.title}
        imageUrl={product.coverUrl}
        className="rounded border border-line"
        mediaClassName="transition-transform duration-500 ease-premium group-hover/thumb:scale-[1.04]"
      />
      <p className="mt-1.5 line-clamp-1 text-[12px] text-ink-subtle">{product.title}</p>
    </Link>
  );
}

/** Editoryal kampanya kartı: medya + başlık + gövde + CTA. Eksik içerik gateway'de elenir (buraya gelmez). */
function EditorialCard({
  editorial,
  dict,
  compact = false,
}: {
  editorial: StorefrontDiscoveryEditorial;
  dict: StorefrontDictionary;
  compact?: boolean;
}) {
  return (
    <Link
      href={editorial.ctaHref}
      className="group/ed relative flex h-full min-h-[220px] flex-col justify-end overflow-hidden rounded-md border border-line bg-surface-muted"
    >
      {editorial.mediaUrl ? (
        <img
          src={editorial.mediaUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-premium group-hover/ed:scale-[1.04]"
        />
      ) : null}
      <div className="scrim-media relative p-5 sm:p-6">
        <p className="on-media font-serif text-xl font-normal leading-tight sm:text-2xl">
          {editorial.title}
        </p>
        {editorial.body ? (
          <p className={`on-media-muted mt-1.5 text-sm ${compact ? "line-clamp-2" : "line-clamp-3"}`}>
            {editorial.body}
          </p>
        ) : null}
        <span className="on-media mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wideish">
          {editorial.ctaLabel ?? dict.discovery.exploreCard}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M4.5 2l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </Link>
  );
}
