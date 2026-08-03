import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format, formatDate, formatDateTime, type Locale } from "@commerce-os/i18n";
import type { CustomerReturnDetail } from "@commerce-os/contracts";
import {
  Badge,
  ButtonLink,
  Container,
  Heading,
  ProductMediaFrame,
  Subheading,
  Text,
} from "../../../../components/ui";
import { getRequestLocale, getStorefrontDict } from "../../../../lib/i18n";
import { formatMinor } from "../../../../lib/money";
import { getCurrentCustomer } from "../../../../lib/server/customer";
import { getReturnDetail } from "../../../../lib/server/returns";
import { AccountSidebar } from "../../../../components/account/account-sidebar";
import {
  ReturnCancelButton,
  ReturnTrackingForm,
} from "../../../../components/account/returns/return-detail-actions";

export const dynamic = "force-dynamic";

type ReturnsDict = Awaited<ReturnType<typeof getStorefrontDict>>["account"]["returns"];

/**
 * TODO-169 (ADR-269) — İade detay/takip ekranı. Oturum zorunlu; gateway yalnız kendi
 * iadesini döner (başka müşteri/yok → null → notFound). Tahmini iade tutarı SUNUCUDAN
 * (estimatedRefundMinor) gelir ve tahmin olduğu açıkça belirtilir; client hesaplamaz.
 * Takip formu yalnız canSubmitTracking, iptal yalnız canCancel ise gösterilir.
 */
export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ returnNumber: string }>;
}) {
  const customer = await getCurrentCustomer();
  const { returnNumber } = await params;
  if (!customer) {
    redirect(`/auth/login?next=/account/returns/${encodeURIComponent(returnNumber)}`);
  }
  const dict = await getStorefrontDict();
  const t = dict.account;
  const r = t.returns;
  const locale = await getRequestLocale();
  const detail = await getReturnDetail(returnNumber);
  if (!detail) {
    notFound();
  }

  return (
    <Container className="py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <AccountSidebar t={t} section="orders" caps={undefined} activeReturns />
        </aside>
        <section className="min-w-0 space-y-6">
          <ButtonLink href="/account/returns" variant="link" className="text-sm">
            ← {r.backToList}
          </ButtonLink>

          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Heading as="h1">
                {r.detail.title}: {detail.returnNumber}
              </Heading>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ink">{r.statuses[detail.status]}</Badge>
              <Badge tone="muted">{r.resolutions[detail.resolutionType]}</Badge>
            </div>
            <p className="text-sm text-ink-muted">
              <Link
                href={`/account/orders/${encodeURIComponent(detail.orderNumber)}`}
                className="hover:underline"
              >
                {r.orderRef}: {detail.orderNumber}
              </Link>{" "}
              · {formatDate(detail.createdAt, locale)}
            </p>
            <p className="text-xs text-ink-subtle">
              {r.detail.windowEndsAt}: {formatDate(detail.returnWindowEndsAt, locale)}
            </p>
          </header>

          {detail.estimatedRefundMinor !== null ? (
            <section className="border border-line p-4">
              <Subheading as="h2" className="mb-1">
                {r.detail.estimatedRefund}
              </Subheading>
              <p className="text-lg font-medium text-ink">
                {formatMinor(detail.estimatedRefundMinor, detail.currency)}
              </p>
              <p className="mt-1 text-xs text-ink-subtle">{r.detail.estimatedRefundNote}</p>
            </section>
          ) : null}

          <ItemsSection detail={detail} r={r} />

          {detail.customerNote ? (
            <section className="border border-line p-4">
              <Subheading as="h2" className="mb-2">
                {r.detail.note}
              </Subheading>
              <Text>{detail.customerNote}</Text>
            </section>
          ) : null}

          {detail.returnCarrier || detail.returnTrackingNumber ? (
            <section className="border border-line p-4">
              <Subheading as="h2" className="mb-2">
                {r.detail.trackingTitle}
              </Subheading>
              <dl className="space-y-1.5 text-sm">
                {detail.returnCarrier ? (
                  <Row label={r.detail.carrier} value={detail.returnCarrier} />
                ) : null}
                {detail.returnTrackingNumber ? (
                  <Row label={r.detail.trackingNumber} value={detail.returnTrackingNumber} />
                ) : null}
              </dl>
            </section>
          ) : null}

          {detail.canSubmitTracking ? (
            <section className="border border-line p-4">
              <Subheading as="h2" className="mb-3">
                {r.detail.trackingTitle}
              </Subheading>
              <ReturnTrackingForm returnNumber={detail.returnNumber} t={r} />
            </section>
          ) : null}

          <Timeline detail={detail} r={r} locale={locale} />

          {detail.canCancel ? (
            <section className="border border-line p-4">
              <Subheading as="h2" className="mb-3">
                {r.detail.cancelTitle}
              </Subheading>
              <ReturnCancelButton returnNumber={detail.returnNumber} t={r} />
            </section>
          ) : null}
        </section>
      </div>
    </Container>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function ItemsSection({ detail, r }: { detail: CustomerReturnDetail; r: ReturnsDict }) {
  return (
    <section className="border border-line p-4">
      <Subheading as="h2" className="mb-3">
        {r.detail.items}
      </Subheading>
      <ul className="space-y-3">
        {detail.items.map((item) => (
          <li key={item.id} className="flex gap-3">
            <ProductMediaFrame
              variant="line-thumbnail"
              handle=""
              title={item.title}
              imageUrl={item.imageUrl}
              className="h-14 w-14 shrink-0 border border-line"
            />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-ink">{item.title}</p>
              {item.variantTitle ? (
                <p className="text-xs text-ink-subtle">{item.variantTitle}</p>
              ) : null}
              <p className="text-xs text-ink-subtle">{item.sku}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {r.detail.quantity}: {item.quantity}
                {item.approvedQuantity !== null
                  ? ` · ${format(r.detail.approvedQuantity, { count: item.approvedQuantity })}`
                  : ""}
              </p>
              <p className="text-xs text-ink-muted">
                {r.detail.reason}: {r.reasons[item.reason]}
              </p>
              {item.customerComment ? (
                <p className="mt-1 text-xs text-ink-muted">“{item.customerComment}”</p>
              ) : null}
              {item.attachmentCount > 0 ? (
                <p className="text-xs text-ink-subtle">
                  {format(r.detail.attachments, { count: item.attachmentCount })}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Timeline({
  detail,
  r,
  locale,
}: {
  detail: CustomerReturnDetail;
  r: ReturnsDict;
  locale: Locale;
}) {
  const actorLabel: Record<"CUSTOMER" | "ADMIN" | "SYSTEM", string> = {
    CUSTOMER: r.detail.actorCustomer,
    ADMIN: r.detail.actorAdmin,
    SYSTEM: r.detail.actorSystem,
  };
  return (
    <section className="border border-line p-4">
      <Subheading as="h2" className="mb-3">
        {r.detail.timeline}
      </Subheading>
      <ol className="space-y-3">
        {detail.history.map((entry, index) => (
          <li key={`${entry.toStatus}-${entry.createdAt}-${index}`} className="flex gap-3">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 bg-ink" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{r.statuses[entry.toStatus]}</p>
              <p className="text-xs text-ink-subtle">
                {actorLabel[entry.actorType]} · {formatDateTime(entry.createdAt, locale)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
