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
              <Badge tone="outline">{r.statuses[detail.status]}</Badge>
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

          {/* TODO-169 (blocker #4) — mevcut aşama açıklaması (müşteri-facing tek cümle). */}
          <div className="border border-line bg-surface-muted p-3">
            <p className="text-sm text-ink">{r.detail.progressHelp[detail.status]}</p>
          </div>

          {/* TODO-169 recovery (blocker #4) — onay sonrası BELİRGİN geri-kargo bölümü + takip formu.
              Approve otomatik AWAITING_SHIPMENT'e ilerlediğinden bu bölüm çıkmaz olmadan erişilebilir. */}
          {detail.canSubmitTracking ? (
            <section
              aria-labelledby="ship-back-heading"
              className="border border-ink p-4"
            >
              <Subheading as="h2" id="ship-back-heading" className="mb-2">
                {r.detail.shipBack.title}
              </Subheading>
              <p className="text-sm text-ink-muted">{r.detail.shipBack.help}</p>
              {detail.shipByDate ? (
                <p className="mt-3 text-sm font-medium text-accent-ink">
                  {r.detail.shipBack.shipByLabel}: {formatDate(detail.shipByDate, locale)}
                </p>
              ) : null}
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                <li>
                  •{" "}
                  {detail.customerPaysReturnShipping
                    ? r.detail.shipBack.costCustomer
                    : r.detail.shipBack.costStore}
                </li>
                <li>• {r.detail.shipBack.addressNote}</li>
                <li>• {r.detail.shipBack.packaging}</li>
              </ul>
              <div className="mt-4">
                <ReturnTrackingForm returnNumber={detail.returnNumber} t={r} />
              </div>
            </section>
          ) : null}

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

          {/* TODO-170 (ADR-272) — MASKELİ para iadesi durumu + AYRI iade finansal özeti (bekleyen vs
              gerçekleşen). Sunucu-otoriter; teknik provider kodu/secret ASLA gösterilmez. */}
          {detail.refund ? (
            <RefundSection refund={detail.refund} r={r} locale={locale} />
          ) : null}

          {/* TODO-173 (ADR-274) — "Ürün size geri gönderiliyor" (STORE_RETURN_TO_CUSTOMER). Refund'dan
              AYRIK; teknik disposition kodu / internal not YOK. */}
          {detail.reverseShipments.length > 0 ? (
            <ReverseShipmentSection shipments={detail.reverseShipments} r={r} locale={locale} />
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
  // Uzun değerler (ör. takip numarası) 375px'de yatay taşmaya yol açmasın:
  // etiket sabit (shrink-0), değer daralabilir ve gerekirse kırılır.
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-all text-right text-ink">{value}</dd>
    </div>
  );
}

/**
 * TODO-170 (ADR-272) — Müşteri para iadesi durumu + AYRI iade finansal özeti.
 * Sunucu-otoriter maskeli veri yalnız RENDER edilir; istemci hesap yapmaz. Durum
 * yalnız renkle değil METİN etiketiyle iletilir (a11y). Teknik provider kodu / ham
 * hata / maskesiz PAN ASLA gösterilmez — FAILED'da güven verici genel mesaj kullanılır.
 * Bekleyen (expected − refunded) vs gerçekleşen (refunded) tutarlar orijinal sipariş
 * toplamından AYRI gösterilir.
 */
function RefundSection({
  refund,
  r,
  locale,
}: {
  refund: NonNullable<CustomerReturnDetail["refund"]>;
  r: ReturnsDict;
  locale: Locale;
}) {
  const rf = r.detail.refund;

  // NONE = gerçek iade henüz başlatılmadı. Yalnız beklenen tutar varsa hafif bir not göster.
  if (refund.status === "NONE") {
    if (refund.expectedTotalMinor <= 0) return null;
    return (
      <section className="border border-line p-4" aria-labelledby="refund-heading">
        <Subheading as="h2" id="refund-heading" className="mb-1">
          {rf.title}
        </Subheading>
        <p className="text-sm text-ink-muted">{rf.noneNote}</p>
      </section>
    );
  }

  const pendingMinor = Math.max(refund.expectedTotalMinor - refund.refundedTotalMinor, 0);
  const isInFlight = refund.status === "PENDING" || refund.status === "PROCESSING";

  return (
    <section className="border border-ink p-4" aria-labelledby="refund-heading">
      <Subheading as="h2" id="refund-heading" className="mb-3">
        {rf.title}
      </Subheading>

      {/* Durum: metin etiketi daima var (renk-yalnız DEĞİL). */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="ink">{rf.statuses[refund.status]}</Badge>
      </div>

      {/* Bilgilendirici not: beklemede/işleniyor → genel süre; başarısız → güven verici mesaj. */}
      {isInFlight ? <p className="mb-3 text-xs text-ink-muted">{rf.timeframeNote}</p> : null}
      {refund.status === "FAILED" ? (
        <p className="mb-3 text-sm text-ink">{rf.failedNote}</p>
      ) : null}

      {/* Ayrı iade finansal özeti — orijinal sipariş toplamından bağımsız. */}
      <dl className="space-y-1.5 text-sm">
        <Row
          label={rf.realizedLabel}
          value={formatMinor(refund.refundedTotalMinor, refund.currency)}
        />
        {pendingMinor > 0 ? (
          <Row label={rf.pendingLabel} value={formatMinor(pendingMinor, refund.currency)} />
        ) : null}
        {refund.expectedTotalMinor !== refund.refundedTotalMinor ? (
          <Row
            label={rf.expectedTotal}
            value={formatMinor(refund.expectedTotalMinor, refund.currency)}
          />
        ) : null}
        {refund.methodLabel ? <Row label={rf.method} value={refund.methodLabel} /> : null}
        {refund.status === "SUCCEEDED" && refund.completedAt ? (
          <Row label={rf.completedAt} value={formatDate(refund.completedAt, locale)} />
        ) : null}
      </dl>
    </section>
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

// TODO-173 (ADR-274) — "Ürün size geri gönderiliyor" (reddedilen ürünün geri gönderimi). PARA İADESİ
// DEĞİLDİR; teknik disposition kodu / internal not gösterilmez. Durum renk+metin ile iletilir.
// Tüm string'ler sözlükten (detail.reverseShipment) gelir; locale dallanması YOK (TR/EN parite).
function ReverseShipmentSection({
  shipments,
  r,
  locale,
}: {
  shipments: CustomerReturnDetail["reverseShipments"];
  r: ReturnsDict;
  locale: Locale;
}) {
  const rs = r.detail.reverseShipment;
  return (
    <section className="border border-line p-4" aria-label={rs.ariaLabel}>
      <Subheading as="h2" className="mb-1">
        {rs.title}
      </Subheading>
      <Text className="mb-3 text-xs text-ink-subtle">{rs.disclaimer}</Text>
      <ul className="space-y-3">
        {shipments.map((s, i) => (
          <li
            key={`${s.trackingNumber ?? "no-track"}-${s.status}-${i}`}
            className="border-t border-line pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm font-medium text-ink">
                {s.productTitle}
                {s.variantTitle ? <span className="text-ink-muted"> · {s.variantTitle}</span> : null}
                <span className="text-ink-subtle"> × {s.quantity}</span>
              </p>
              <Badge tone={s.status === "DELIVERED" ? "ink" : "muted"} className="shrink-0">
                {rs.statuses[s.status] ?? s.status}
              </Badge>
            </div>
            <dl className="mt-1.5 space-y-1 text-sm">
              {s.carrierName ? <Row label={r.detail.carrier} value={s.carrierName} /> : null}
              {s.trackingNumber ? (
                <Row label={r.detail.trackingNumber} value={s.trackingNumber} />
              ) : null}
              {s.shippedAt ? (
                <Row label={rs.shipped} value={formatDate(s.shippedAt, locale)} />
              ) : null}
              {s.estimatedDeliveryAt ? (
                <Row label={rs.estimatedDelivery} value={formatDate(s.estimatedDeliveryAt, locale)} />
              ) : null}
              {s.deliveredAt ? (
                <Row label={rs.delivered} value={formatDate(s.deliveredAt, locale)} />
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
