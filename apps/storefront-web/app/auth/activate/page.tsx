import { Container } from "@commerce-os/ui";
import { getStorefrontDict } from "../../../lib/i18n";
import { ActivateForm } from "../../../components/auth/activate-form";

export const dynamic = "force-dynamic";

/**
 * Aktivasyon / parola belirleme sayfası (TODO-087). Admin panelden üretilen tek
 * seferlik link (`?token=...`) buraya gelir; müşteri parolasını belirler. Tam
 * self-service "şifremi unuttum" akışı TODO-075 ile ayrı kalır.
 */
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = (await getStorefrontDict()).auth;
  const token = (await searchParams).token ?? "";
  return (
    <Container className="py-12">
      <div className="mx-auto max-w-md">
        <h1 className="mb-1 text-2xl font-semibold tracking-tightish text-slate-900">
          {t.activate.title}
        </h1>
        <p className="mb-6 text-sm text-slate-600">{t.activate.subtitle}</p>
        <ActivateForm t={t} token={token} />
      </div>
    </Container>
  );
}
