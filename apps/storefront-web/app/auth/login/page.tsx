import { redirect } from "next/navigation";
import { Container } from "@commerce-os/ui";
import { getStorefrontDict } from "../../../lib/i18n";
import { getCurrentCustomer } from "../../../lib/server/customer";
import { safeNextPath } from "../../../lib/next-path";
import { LoginForm } from "../../../components/auth/login-form";

export const dynamic = "force-dynamic";

/**
 * Giris sayfasi (F3B.3). Zaten oturum acmis kullanici next'e (varsayilan /account)
 * yonlendirilir. Checkout guard buraya `?next=/checkout` ile yonlendirir; giris
 * sonrasi kullanici checkout'a doner (cart cookie korunur).
 */
export default async function LoginPage({
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
        <h1 className="mb-1 text-2xl font-semibold tracking-tightish text-slate-900">
          {t.login.title}
        </h1>
        <p className="mb-6 text-sm text-slate-600">{t.login.subtitle}</p>
        <LoginForm t={t} next={next} />
      </div>
    </Container>
  );
}
