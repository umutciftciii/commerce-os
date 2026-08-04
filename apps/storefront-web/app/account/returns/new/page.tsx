import { redirect } from "next/navigation";
import { format, formatDate } from "@commerce-os/i18n";
import { Container, EmptyState, Heading, ButtonLink } from "../../../../components/ui";
import { getRequestLocale, getStorefrontDict } from "../../../../lib/i18n";
import { getCurrentCustomer } from "../../../../lib/server/customer";
import { getReturnEligibility } from "../../../../lib/server/returns";
import { AccountSidebar } from "../../../../components/account/account-sidebar";
import { ReturnWizard } from "../../../../components/account/returns/return-wizard";

export const dynamic = "force-dynamic";

/**
 * TODO-169 (ADR-269) — İade sihirbazı giriş route'u: /account/returns/new?order=<no>.
 * Oturum zorunlu. Uygunluk SUNUCUDAN yüklenir (getReturnEligibility); returnable=false
 * veya uygun satır yoksa dürüst uygunsuz-durum gösterilir (client uygunluk hesaplamaz).
 */
export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const customer = await getCurrentCustomer();
  const { order } = await searchParams;
  const orderNumber = (order ?? "").trim();
  if (!customer) {
    const next = orderNumber
      ? `/account/returns/new?order=${encodeURIComponent(orderNumber)}`
      : "/account/returns";
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }
  if (!orderNumber) {
    redirect("/account/returns");
  }

  const dict = await getStorefrontDict();
  const t = dict.account;
  const r = t.returns;
  const locale = await getRequestLocale();
  const eligibility = await getReturnEligibility(orderNumber);
  // TODO-169 (blocker #1) — sihirbaz yüzeyinde iade penceresi etiketi (teslim-türetilmiş; server).
  const rb = t.orders.returnBadge;
  const windowText =
    eligibility && eligibility.windowState === "ELIGIBLE" && eligibility.returnWindowEndsAt
      ? eligibility.remainingDays !== null && eligibility.remainingDays <= 3
        ? format(rb.window.endingSoon, { count: Math.max(0, eligibility.remainingDays) })
        : format(rb.window.eligible, {
            date: formatDate(eligibility.returnWindowEndsAt, locale),
          })
      : eligibility && eligibility.windowState === "EXPIRED"
        ? rb.window.expired
        : null;

  return (
    <Container className="py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <AccountSidebar t={t} section="orders" caps={undefined} activeReturns />
        </aside>
        <section className="min-w-0 space-y-6">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
              {r.wizard.orderLabel}: {orderNumber}
            </p>
            <Heading as="h1">{r.wizard.title}</Heading>
            {windowText ? (
              <p className="text-xs font-medium text-ink-muted">{windowText}</p>
            ) : null}
          </div>

          {eligibility && eligibility.returnable ? (
            <ReturnWizard eligibility={eligibility} t={r} />
          ) : (
            <EmptyState
              title={r.ineligibleTitle}
              description={r.ineligibleBody}
              action={
                <ButtonLink
                  href={`/account/orders/${encodeURIComponent(orderNumber)}`}
                  variant="secondary"
                  size="sm"
                >
                  {r.backToOrder}
                </ButtonLink>
              }
            />
          )}
        </section>
      </div>
    </Container>
  );
}
