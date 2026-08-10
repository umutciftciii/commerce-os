import { notFound, redirect } from "next/navigation";
import { ButtonLink, Container } from "../../../../components/ui";
import { getRequestLocale, getStorefrontDict } from "../../../../lib/i18n";
import { getCurrentCustomer } from "../../../../lib/server/customer";
import { getSupportTicket } from "../../../../lib/server/support";
import { AccountSidebar } from "../../../../components/account/account-sidebar";
import { SupportTicketDetailView } from "../../../../components/account/support/support-ticket-detail-view";
import { SupportTicketPanel } from "../../../../components/account/support/support-ticket-panel";

export const dynamic = "force-dynamic";

/**
 * TODO-177 (ADR-289) Faz D — Destek talebi detayı (/account/support/[ticketNumber]). Oturum
 * zorunlu. Gateway yalnız KENDİ talebini döner (başka müşteri/yok → null → notFound → 404;
 * varlık sızıntısı yok). Statik görünüm + etkileşim paneli (yanıt/reopen) ayrık.
 */
export default async function SupportTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketNumber: string }>;
}) {
  const { ticketNumber } = await params;
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect(`/auth/login?next=/account/support/${encodeURIComponent(ticketNumber)}`);
  }
  const dict = await getStorefrontDict();
  const t = dict.account;
  const s = t.support;
  const locale = await getRequestLocale();

  const ticket = await getSupportTicket(ticketNumber);
  if (!ticket) {
    notFound();
  }

  return (
    <Container className="py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <AccountSidebar t={t} section="orders" caps={undefined} activeSupport />
        </aside>
        <section className="min-w-0 space-y-6">
          <ButtonLink href="/account/support" variant="link" className="text-sm">
            ← {s.detail.backToList}
          </ButtonLink>

          <SupportTicketDetailView
            ticket={ticket}
            t={s}
            locale={locale}
            attachmentHref={(attachmentId) =>
              `/account/support/${encodeURIComponent(ticket.ticketNumber)}/attachments/${encodeURIComponent(attachmentId)}`
            }
          />

          <SupportTicketPanel
            ticketNumber={ticket.ticketNumber}
            status={ticket.status}
            canReopen={ticket.canReopen}
            orderNumber={ticket.orderNumber}
            t={s}
          />
        </section>
      </div>
    </Container>
  );
}
