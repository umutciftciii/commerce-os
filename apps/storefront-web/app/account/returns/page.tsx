import Link from "next/link";
import { redirect } from "next/navigation";
import type { CustomerRefundVisibilityItem } from "@commerce-os/contracts";
import { format, formatDate, type Locale } from "@commerce-os/i18n";
import { Badge, ButtonLink, Container, EmptyState, Heading, Text } from "../../../components/ui";
import { getRequestLocale, getStorefrontDict } from "../../../lib/i18n";
import { formatMinor } from "../../../lib/money";
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
            <EmptyState
              title={r.listEmpty}
              description={r.listEmptyDescription}
              action={
                <ButtonLink href="/account/orders" variant="secondary" size="sm">
                  {r.listEmptyCta}
                </ButtonLink>
              }
            />
          ) : (
            <ul className="space-y-3">
              {returns.map((item) =>
                item.source === "ORDER_CANCELLATION" ? (
                  <li key={`cancel:${item.reference}`}>
                    <CancellationRefundCard
                      item={item}
                      rf={r.refunds}
                      reasons={t.cancellations.reasons}
                      destinationLabel={r.refundDestinationLabel}
                      destinations={r.refundDestinations}
                      locale={locale}
                    />
                  </li>
                ) : (
                  <li key={`return:${item.reference}`}>
                    <Link
                      href={`/account/returns/${encodeURIComponent(item.reference)}`}
                      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border border-line p-4 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium text-ink">
                          {r.reference}: {item.reference}
                        </p>
                        <p className="text-xs text-ink-subtle">
                          {r.orderRef}: {item.orderNumber}
                          {item.itemCount !== null
                            ? ` · ${format(r.itemCount, { count: item.itemCount })}`
                            : ""}
                        </p>
                        <p className="text-xs text-ink-subtle">
                          {r.createdAt}: {formatDate(item.createdAt, locale)}
                        </p>
                        {item.refundDestination ? (
                          <p className="text-xs text-ink-subtle">
                            {r.refundDestinationLabel}: {r.refundDestinations[item.refundDestination]}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        {item.resolutionType ? (
                          <Badge tone="muted">{r.resolutions[item.resolutionType]}</Badge>
                        ) : null}
                        {item.returnStatus ? (
                          <Badge tone="outline">{r.statuses[item.returnStatus]}</Badge>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}

/**
 * TODO-174A — Sipariş iptali geri ödemesi kartı (vitrin "İadelerim"). ReturnRequest DEĞİL; "iade talebi"
 * copy'si kullanılmaz. Detay için sipariş sayfasına (iptal bloğu + refund durumu) yönlendirir. Refund
 * MASKELİdir; FAILED yanıltıcı gösterilmez (destek/kurtarma metni + nötr rozet, danger tonu YOK — editorial).
 */
function CancellationRefundCard({
  item,
  rf,
  reasons,
  destinationLabel,
  destinations,
  locale,
}: {
  item: CustomerRefundVisibilityItem;
  rf: {
    cancellationTitle: string;
    orderRef: string;
    amountLabel: string;
    reasonLabel: string;
    methodLabel: string;
    createdAt: string;
    completedAt: string;
    statusValues: Record<"NONE" | "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED", string>;
    failedSupport: string;
  };
  reasons: Record<string, string>;
  destinationLabel: string;
  destinations: Record<"ORIGINAL_PAYMENT" | "SHOPPING_BALANCE", string>;
  locale: Locale;
}) {
  const refund = item.refund;
  const statusKey = refund?.status ?? "NONE";
  const failed = statusKey === "FAILED";
  return (
    <Link
      href={`/account/orders/${encodeURIComponent(item.orderNumber)}`}
      className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border border-line p-4 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-ink">{rf.cancellationTitle}</p>
        <p className="text-xs text-ink-subtle">
          {rf.orderRef}: {item.orderNumber}
        </p>
        {item.cancellationReasonCode ? (
          <p className="text-xs text-ink-subtle">
            {rf.reasonLabel}: {reasons[item.cancellationReasonCode] ?? item.cancellationReasonCode}
          </p>
        ) : null}
        <p className="text-xs text-ink-subtle">
          {rf.createdAt}: {formatDate(item.createdAt, locale)}
        </p>
        {refund?.completedAt ? (
          <p className="text-xs text-ink-subtle">
            {rf.completedAt}: {formatDate(refund.completedAt, locale)}
          </p>
        ) : null}
        {refund?.methodLabel ? (
          <p className="text-xs text-ink-subtle">
            {rf.methodLabel}: {refund.methodLabel}
          </p>
        ) : null}
        {item.refundDestination ? (
          <p className="text-xs text-ink-subtle">
            {destinationLabel}: {destinations[item.refundDestination]}
          </p>
        ) : null}
        {failed ? <p className="text-xs text-ink-subtle">{rf.failedSupport}</p> : null}
      </div>
      <div className="flex flex-col items-end gap-2">
        {refund ? (
          <p className="text-sm font-medium text-ink">
            {formatMinor(refund.expectedTotalMinor, refund.currency)}
          </p>
        ) : null}
        <Badge tone="outline">{rf.statusValues[statusKey]}</Badge>
      </div>
    </Link>
  );
}
