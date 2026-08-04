import { redirect } from "next/navigation";
import { Alert, Container } from "../../../components/ui";
import { getStorefrontDict } from "../../../lib/i18n";
import { getCurrentCustomer } from "../../../lib/server/customer";
import { safeNextPath } from "../../../lib/next-path";
import { LoginForm } from "../../../components/auth/login-form";

export const dynamic = "force-dynamic";

/**
 * Giris sayfasi (F3B.3 / ADR-271). Zaten oturum acmis kullanici next'e (varsayilan
 * /account) yonlendirilir. `?reason=expired` → oturum sona erdi bildirimi gosterilir
 * (idle/absolute expiry sonrasi SessionGuard buraya yonlendirir). Checkout guard
 * buraya `?next=/checkout` ile yonlendirir; giris sonrasi kullanici doner.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const t = (await getStorefrontDict()).auth;
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getCurrentCustomer()) {
    redirect(next);
  }
  const expiredNotice = params.reason === "expired" ? t.session.expiredMessage : null;
  return (
    <Container className="py-12">
      <div className="mx-auto max-w-md">
        <h1 className="mb-1 text-2xl font-semibold tracking-tightish text-slate-900">
          {t.login.title}
        </h1>
        <p className="mb-6 text-sm text-slate-600">{t.login.subtitle}</p>
        {expiredNotice ? (
          <div className="mb-4">
            <Alert tone="warning">{expiredNotice}</Alert>
          </div>
        ) : null}
        <LoginForm t={t} next={next} />
      </div>
    </Container>
  );
}
