import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDate } from "@commerce-os/i18n";
import { Badge, ButtonLink, Container, EmptyState, Heading, Text } from "../../../components/ui";
import { getRequestLocale, getStorefrontDict } from "../../../lib/i18n";
import { getCurrentCustomer } from "../../../lib/server/customer";
import { listSupportTickets } from "../../../lib/server/support";
import { statusLabel, topicLabel } from "../../../lib/support/labels";
import { AccountSidebar } from "../../../components/account/account-sidebar";

export const dynamic = "force-dynamic";

/**
 * TODO-177 (ADR-289) Faz D — Hesabım > Destek Taleplerim (/account/support). Oturum zorunlu.
 * Gateway yalnız müşterinin KENDİ taleplerini döner. Durum salt renkle değil metinle (rozet +
 * status etiketi) anlatılır; ham enum GÖSTERİLMEZ.
 */
export default async function SupportListPage() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/auth/login?next=/account/support");
  }
  const dict = await getStorefrontDict();
  const t = dict.account;
  const s = t.support;
  const locale = await getRequestLocale();
  const tickets = await listSupportTickets();

  return (
    <Container className="py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <AccountSidebar t={t} section="orders" caps={undefined} activeSupport />
        </aside>
        <section className="min-w-0 space-y-6">
          <header className="space-y-1">
            <Heading as="h1">{s.title}</Heading>
            <Text>{s.subtitle}</Text>
          </header>

          {tickets.length === 0 ? (
            <EmptyState
              title={s.list.empty}
              description={s.list.emptyDescription}
              action={
                <ButtonLink href="/account/orders" variant="secondary" size="sm">
                  {s.list.emptyCta}
                </ButtonLink>
              }
            />
          ) : (
            <ul className="space-y-3">
              {tickets.map((item) => (
                <li key={item.ticketNumber}>
                  <Link
                    href={`/account/support/${encodeURIComponent(item.ticketNumber)}`}
                    data-testid="support-ticket-row"
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border border-line p-4 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-ink">
                        {s.list.ticketNumber}: {item.ticketNumber}
                      </p>
                      <p className="truncate text-sm text-ink-muted">{item.productTitle}</p>
                      <p className="text-xs text-ink-subtle">
                        {s.list.topic}: {topicLabel(item.topic, s)}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {s.list.lastActivity}: {formatDate(item.lastActivityAt, locale)}
                      </p>
                    </div>
                    <Badge tone="outline">{statusLabel(item.status, s)}</Badge>
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
