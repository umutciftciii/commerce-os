import { redirect } from "next/navigation";
import { Container } from "@commerce-os/ui";
import { getStorefrontDict } from "../../../lib/i18n";
import { getCurrentCustomer } from "../../../lib/server/customer";
import { safeNextPath } from "../../../lib/next-path";
import { RegisterFlow } from "../../../components/auth/register-flow";

export const dynamic = "force-dynamic";

/**
 * Uyelik sayfasi (F3B.3) — 3 adim: identifier -> OTP -> profil/sifre/onaylar.
 * Tamamlaninca otomatik oturum acilir; next (varsayilan /account, checkout'tan
 * gelindiyse /checkout) korunur.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = (await getStorefrontDict()).auth;
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentCustomer()) {
    redirect(next);
  }
  return (
    <Container className="py-12">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-2xl font-semibold tracking-tightish text-slate-900">
          {t.register.title}
        </h1>
        <RegisterFlow t={t} next={next} />
      </div>
    </Container>
  );
}
