"use client";

/**
 * Shopping Balance Admin — müşteri bakiye detayı (Finans > Alışveriş Bakiyesi > müşteri).
 *
 * Özet (kullanılabilir + bucket'lar), lot listesi (kaynak/tutar/son kullanım/durum) ve
 * append-only ledger timeline (insan-okur TR/EN etiket; RAW ENUM yok). "Bakiye tanımla"
 * mevcut goodwill grant altyapısını REUSE eder (issueCustomerCredit; 30/60/120/180 gün,
 * expiring-only). Manuel non-expiring goodwill YOK; bakiye düşürme bu yüzeyde YOK.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  useLocale,
} from "../../../../../components/ui";
import { PaymentIcon } from "../../../../../components/icons";
import type { ShoppingBalanceDetailDto } from "@commerce-os/api-client";
import { storeApi } from "../../../../../lib/client/api";
import { messageForError } from "../../../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../../../lib/client/format";
import { tlToMinor, creditReasonOptions } from "../../../../../lib/client/credit-format";
import { creditLedgerTypeLabel, creditSourceTypeLabel, creditLotStatusLabel } from "../../../../../lib/client/credit-labels";
import { SurfaceCard } from "../../../../components/premium";

const money = (minor: string, currency: string) => formatMinor(Number(minor), currency);
const EXPIRY_OPTIONS = [30, 60, 120, 180];

export default function ShoppingBalanceDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const locale = useLocale();
  const tr = locale === "tr";

  const [detail, setDetail] = useState<ShoppingBalanceDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDetail(await storeApi.getShoppingBalanceDetail(customerId));
    } catch (err) {
      setError(messageForError(err, locale));
    }
  }, [customerId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const L = useMemo(
    () => ({
      eyebrow: tr ? "Alışveriş Bakiyesi" : "Shopping Balance",
      back: tr ? "← Listeye dön" : "← Back to list",
      available: tr ? "Kullanılabilir bakiye" : "Available balance",
      grant: tr ? "Bakiye tanımla" : "Add balance",
      buckets: {
        issued: tr ? "Toplam yüklenen" : "Total loaded",
        spent: tr ? "Harcanan" : "Spent",
        goodwill: tr ? "Goodwill / telafi" : "Goodwill",
        refundOrigin: tr ? "İade kaynaklı" : "Refund-origin",
        restored: tr ? "Restore edilen" : "Restored",
        expired: tr ? "Süresi dolan" : "Expired",
        nearestExpiry: tr ? "En yakın son kullanım" : "Next expiry",
      },
      lots: {
        title: tr ? "Bakiye Lotları" : "Balance Lots",
        source: tr ? "Kaynak" : "Source",
        original: tr ? "İlk tutar" : "Original",
        remaining: tr ? "Kalan" : "Remaining",
        issued: tr ? "Tanımlanma" : "Issued",
        expires: tr ? "Son kullanım" : "Expires",
        status: tr ? "Durum" : "Status",
        never: tr ? "Süresiz" : "Never",
        empty: tr ? "Lot yok." : "No lots.",
      },
      ledger: {
        title: tr ? "Hareket Geçmişi" : "Movement History",
        empty: tr ? "Henüz hareket yok." : "No movements yet.",
      },
    }),
    [tr],
  );

  const lotStatusTone = (s: string): "success" | "neutral" | "warning" =>
    s === "ACTIVE" ? "success" : s === "EXPIRED" ? "warning" : "neutral";

  return (
    <>
      <PageHeader
        eyebrow={L.eyebrow}
        title={detail?.customerName ?? (tr ? "Müşteri" : "Customer")}
        description={detail?.customerEmail ?? undefined}
        actions={
          <div className="flex gap-2">
            <Link
              href="/finance/shopping-balance"
              className="inline-flex h-9 items-center rounded-lg border border-white/10 px-3 text-sm text-white/70 hover:text-white"
            >
              {L.back}
            </Link>
            <Button onClick={() => setGranting(true)} disabled={!detail}>
              {L.grant}
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {!detail && !error ? <SkeletonRows rows={6} /> : null}

      {detail ? (
        <div className="space-y-5">
          {/* Özet */}
          <SurfaceCard title={L.available} icon={<PaymentIcon />}>
            <div data-testid="sb-detail-available" className="text-3xl font-semibold tabular-nums text-white/90">
              {money(detail.summary.availableMinor, detail.currency)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Bucket label={L.buckets.issued} value={money(detail.summary.issuedMinor, detail.currency)} />
              <Bucket label={L.buckets.spent} value={money(detail.summary.spentMinor, detail.currency)} />
              <Bucket label={L.buckets.goodwill} value={money(detail.summary.goodwillMinor, detail.currency)} />
              <Bucket label={L.buckets.refundOrigin} value={money(detail.summary.refundOriginMinor, detail.currency)} />
              <Bucket label={L.buckets.restored} value={money(detail.summary.restoredMinor, detail.currency)} />
              <Bucket label={L.buckets.expired} value={money(detail.summary.expiredMinor, detail.currency)} />
              <Bucket
                label={L.buckets.nearestExpiry}
                value={detail.summary.nearestExpiryAt ? formatDate(detail.summary.nearestExpiryAt) : "—"}
              />
            </div>
          </SurfaceCard>

          {/* Lotlar */}
          <SurfaceCard title={L.lots.title} icon={<PaymentIcon />}>
            {detail.lots.length === 0 ? (
              <p className="text-sm text-white/40">{L.lots.empty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-white/30">
                      <th className="py-2 pr-4">{L.lots.source}</th>
                      <th className="py-2 pr-4 text-right">{L.lots.original}</th>
                      <th className="py-2 pr-4 text-right">{L.lots.remaining}</th>
                      <th className="py-2 pr-4">{L.lots.issued}</th>
                      <th className="py-2 pr-4">{L.lots.expires}</th>
                      <th className="py-2">{L.lots.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lots.map((lot) => (
                      <tr key={lot.id} data-testid="sb-lot-row" className="border-t border-white/5">
                        <td className="py-2 pr-4 text-white/80">{creditSourceTypeLabel(lot.sourceType, tr)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-white/55">{money(lot.originalAmountMinor, detail.currency)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-medium text-white/90">{money(lot.remainingAmountMinor, detail.currency)}</td>
                        <td className="py-2 pr-4 text-white/45">{formatDate(lot.issuedAt)}</td>
                        <td className="py-2 pr-4 text-white/45">{lot.expiresAt ? formatDate(lot.expiresAt) : L.lots.never}</td>
                        <td className="py-2">
                          <Badge tone={lotStatusTone(lot.status)}>{creditLotStatusLabel(lot.status, tr)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SurfaceCard>

          {/* Ledger timeline */}
          <SurfaceCard title={L.ledger.title} icon={<PaymentIcon />}>
            {detail.ledger.length === 0 ? (
              <p className="text-sm text-white/40">{L.ledger.empty}</p>
            ) : (
              <div className="space-y-2">
                {detail.ledger.map((e) => {
                  const credit = e.direction === "CREDIT";
                  return (
                    <div key={e.id} data-testid="sb-ledger-row" className="flex items-center justify-between gap-3 border-t border-white/5 pt-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-white/80">{creditLedgerTypeLabel(e.type, tr)}</p>
                        <p className="text-xs text-white/35">
                          {formatDate(e.createdAt)}
                          {e.orderNumber ? ` · ${e.orderNumber}` : ""}
                        </p>
                      </div>
                      <div className={`tabular-nums font-medium ${credit ? "text-emerald-300/90" : "text-white/60"}`}>
                        {credit ? "+" : "−"}
                        {money(e.amountMinor, e.currency)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SurfaceCard>
        </div>
      ) : null}

      {granting && detail ? (
        <GrantModal
          customerId={customerId}
          onClose={() => setGranting(false)}
          onGranted={(msg) => {
            setGranting(false);
            setNotice(msg);
            void load();
          }}
          onError={(err) => setError(messageForError(err, locale))}
        />
      ) : null}
    </>
  );
}

function Bucket({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className="text-[11px] text-white/40">{label}</div>
      <div className="mt-0.5 tabular-nums text-white/85">{value}</div>
    </div>
  );
}

/* Bakiye tanımlama — goodwill grant altyapısı reuse (expiring-only). */
function GrantModal({
  customerId,
  onClose,
  onGranted,
  onError,
}: {
  customerId: string;
  onClose: () => void;
  onGranted: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const locale = useLocale();
  const tr = locale === "tr";
  const reasonOptions = creditReasonOptions(tr);
  const [amountTl, setAmountTl] = useState("");
  const [expiry, setExpiry] = useState(60);
  const [reason, setReason] = useState(reasonOptions[0]!.value);
  const [note, setNote] = useState("");
  const [key] = useState(() => `sb-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const amountMinor = tlToMinor(amountTl);
    if (!amountMinor) {
      setLocalError(tr ? "Geçerli bir tutar girin (₺)." : "Enter a valid amount (₺).");
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      await storeApi.issueCustomerCredit(customerId, {
        amountMinor,
        expiryDays: expiry as never,
        reason,
        internalNote: note || undefined,
        idempotencyKey: key,
      });
      onGranted(tr ? "Bakiye tanımlandı." : "Balance granted.");
    } catch (err) {
      onError(err);
      setBusy(false);
    }
  }, [amountTl, expiry, reason, note, key, customerId, tr, onGranted, onError]);

  return (
    <Modal
      open
      onClose={onClose}
      title={tr ? "Bakiye Tanımla" : "Add Balance"}
      description={tr ? "Müşteriye goodwill alışveriş bakiyesi tanımla (süreli)." : "Grant goodwill shopping balance (expiring)."}
      closeLabel={tr ? "Kapat" : "Close"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {tr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button onClick={() => void submit()} disabled={busy} data-testid="sb-grant-submit">
            {tr ? "Tanımla" : "Grant"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {localError ? <Alert tone="error">{localError}</Alert> : null}
        <Input
          id="sb-amount"
          label={tr ? "Tutar (₺)" : "Amount (₺)"}
          value={amountTl}
          onChange={(e) => setAmountTl(e.target.value)}
          disabled={busy}
          inputMode="decimal"
          data-testid="sb-grant-amount"
        />
        <Select
          id="sb-reason"
          label={tr ? "Neden" : "Reason"}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          options={reasonOptions}
        />
        <Select
          id="sb-expiry"
          label={tr ? "Son kullanım süresi" : "Expiry"}
          value={String(expiry)}
          onChange={(e) => setExpiry(Number(e.target.value))}
          disabled={busy}
          options={EXPIRY_OPTIONS.map((d) => ({ value: String(d), label: `${d} ${tr ? "gün" : "days"}` }))}
        />
        <Input
          id="sb-note"
          label={tr ? "Not (opsiyonel, iç)" : "Note (optional, internal)"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
      </div>
    </Modal>
  );
}
