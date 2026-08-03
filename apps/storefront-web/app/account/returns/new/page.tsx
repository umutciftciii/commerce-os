import { redirect } from "next/navigation";
import { Container, EmptyState, Heading, ButtonLink } from "../../../../components/ui";
import { getStorefrontDict } from "../../../../lib/i18n";
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
  const eligibility = await getReturnEligibility(orderNumber);

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
