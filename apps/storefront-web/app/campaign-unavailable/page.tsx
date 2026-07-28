import type { Metadata } from "next";
import { ButtonLink, Container, EmptyState } from "../../components/ui";
import { getStorefrontDict } from "../../lib/i18n";

/**
 * Influencer Campaign Lifecycle (ADR-172) — durdurulmuş/bitmiş/iptal kampanya
 * bağlantısı terminal sayfası. `/t/[token]` route handler, gateway "available=false"
 * dönerse buraya `?state=<ended|inactive|unavailable>` ile yönlendirir.
 *
 * İlkeler:
 *  - Ürün adı / özel müşteri bilgisi SIZDIRILMAZ; yalnız 3 genel durum mesajı.
 *  - Bu sayfa görüntülenmesi bir attribution EVENT'i DEĞİLDİR (gateway click yazmadı).
 *  - SEO: `noindex, nofollow` (aşağıdaki metadata). HTTP semantiği kararı ADR-172:
 *    Next App Router render edilen page için 410 döndürülemez → güvenli 200 + noindex.
 *  - Root layout içinde render olur (header/footer/branding korunur).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getStorefrontDict();
  return {
    title: dict.campaignUnavailable.metaTitle,
    robots: { index: false, follow: false },
  };
}

type State = "ended" | "inactive" | "unavailable";

function resolveState(raw: string | string[] | undefined): State {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "ended" || value === "inactive") return value;
  return "unavailable";
}

export default async function CampaignUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const dict = await getStorefrontDict();
  const t = dict.campaignUnavailable;
  const state = resolveState((await searchParams).state);

  const title =
    state === "ended" ? t.endedTitle : state === "inactive" ? t.inactiveTitle : t.unavailableTitle;
  const description =
    state === "ended"
      ? t.endedDescription
      : state === "inactive"
        ? t.inactiveDescription
        : t.unavailableDescription;

  return (
    <Container className="py-24">
      <EmptyState
        title={title}
        description={description}
        action={
          <ButtonLink href="/" variant="secondary">
            {t.action}
          </ButtonLink>
        }
      />
    </Container>
  );
}
