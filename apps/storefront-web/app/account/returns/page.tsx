import Link from "next/link";
import { redirect } from "next/navigation";
import { format, formatDate } from "@commerce-os/i18n";
import { Badge, Container, EmptyState, Heading, Text } from "../../../components/ui";
import { getRequestLocale, getStorefrontDict } from "../../../lib/i18n";
import { getCurrentCustomer } from "../../../lib/server/customer";
import { listReturns } from "../../../lib/server/returns";
import { AccountSidebar } from "../../../components/account/account-sidebar";

export const dynamic = "force-dynamic";

/**
 * TODO-169 (ADR-269) — Hesabım > İadelerim listesi (/account/returns). Oturum
 * zorunlu. Gateway yalnız kendi iadelerini döner. Durum salt renkle değil metinle
 * (rozet + status etiketi) anlatılır.
 */
export default async function ReturnsListPage() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/auth/login?next=/account/returns");
  }
  const dict = await getStorefrontDict();
  const t = dict.account;
  const r = t.returns;
  const locale = await getRequestLocale();
  const returns = await listReturns();

  return (
    <Container className="py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <AccountSidebar t={t} section="orders" caps={undefined} activeReturns />
        </aside>
        <section className="min-w-0 space-y-6">
          <header className="space-y-1">
            <Heading as="h1">{r.listTitle}</Heading>
            <Text>{r.listSubtitle}</Text>
          </header>

          {returns.length === 0 ? (
            <EmptyState title={r.listEmpty} />
          ) : (
            <ul className="space-y-3">
              {returns.map((item) => (
                <li key={item.returnNumber}>
                  <Link
                    href={`/account/returns/${encodeURIComponent(item.returnNumber)}`}
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border border-line p-4 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-ink">
                        {r.reference}: {item.returnNumber}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {r.orderRef}: {item.orderNumber} ·{" "}
                        {format(r.itemCount, { count: item.itemCount })}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {r.createdAt}: {formatDate(item.createdAt, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="muted">{r.resolutions[item.resolutionType]}</Badge>
                      <Badge tone="outline">{r.statuses[item.status]}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
