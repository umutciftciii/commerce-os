"use client";

/**
 * TODO-161A — Tahsilat merkezi. Üstte tahakkuklar (vade aşımı türetilmiş — ADR-125), manuel
 * tahsilat + kalan bakiye (sunucu-otoriter aşırı-tahsilat guard'ı). Altta tahsilat geçmişi
 * (append-only; ters kayıt negatif satır). CSV dışa aktarım tenant-safe.
 *
 * NOT: Bu ekrandaki "Tahakkuk" platform içi ticari belgedir; resmî e-Fatura DEĞİLDİR (ADR-126).
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Modal, Select, SkeletonRows, useLocale } from "../../../components/ui";
import type {
  SponsorshipCharge,
  SponsorshipPayment,
  SponsorshipPaymentMethod,
} from "@commerce-os/api-client";
import { PaymentIcon } from "../../../components/icons";
import { storeApi, UiError } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor, inputToMinor } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";
import { CHARGE_DISPLAY_STATUS_LABELS, PAYMENT_METHOD_LABELS, sponsorshipError, type Locale } from "../sponsors/labels";

function errorText(error: unknown, locale: Locale): string {
  if (error instanceof UiError) return sponsorshipError(error.code) ?? messageForError(error, locale);
  return messageForError(error, locale);
}

const DISPLAY_TONE: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "neutral",
  OVERDUE: "danger",
};

export default function PaymentsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <PaymentsView />
    </Suspense>
  );
}

function PaymentsView() {
  const locale = useLocale() as Locale;
  const [charges, setCharges] = useState<SponsorshipCharge[]>([]);
  const [payments, setPayments] = useState<SponsorshipPayment[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<SponsorshipCharge | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ch, pay] = await Promise.all([
        storeApi.listSponsorshipCharges({ pageSize: 100, ...(overdueOnly ? { overdueOnly: "true" } : {}) }),
        storeApi.listSponsorshipPayments({ pageSize: 100 }),
      ]);
      setCharges(ch.data);
      setPayments(pay.data);
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setLoading(false);
    }
  }, [locale, overdueOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function issue(id: string) {
    try {
      await storeApi.issueSponsorshipCharge(id);
      void load();
    } catch (e) {
      setError(errorText(e, locale));
    }
  }
  async function reverse(id: string) {
    try {
      await storeApi.reverseSponsorshipPayment(id);
      void load();
    } catch (e) {
      setError(errorText(e, locale));
    }
  }

  function downloadCsv(kind: "charges" | "payments") {
    const url = kind === "charges" ? "/api/sponsorship-charges/export" : "/api/sponsorship-payments/export";
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white/90">Tahsilat & Tahakkuk</h1>
          <p className="text-sm text-white/50">Platform içi ticari belge ve tahsilat takibi — resmî fatura değildir.</p>
        </div>
      </div>
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <SurfaceCard
        title="Tahakkuklar"
        description="Vadesi geçmiş (OVERDUE) türetilmiş bir görünüm durumudur"
        icon={<PaymentIcon />}
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-white/60">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="accent-indigo-500" />
              Yalnız vadesi geçenler
            </label>
            <Button variant="ghost" size="sm" onClick={() => downloadCsv("charges")}>CSV</Button>
          </div>
        }
      >
        {loading ? (
          <SkeletonRows rows={4} />
        ) : charges.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-white/40">Kayıt yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-white/50">
                <tr className="border-b border-white/10 text-left">
                  <th className="px-3 py-2 font-medium">Tahakkuk No</th>
                  <th className="px-3 py-2 font-medium">Sponsor</th>
                  <th className="px-3 py-2 text-right font-medium">Toplam</th>
                  <th className="px-3 py-2 text-right font-medium">Kalan</th>
                  <th className="px-3 py-2 font-medium">Vade</th>
                  <th className="px-3 py-2 font-medium">Durum</th>
                  <th className="px-3 py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 text-white/80">
                    <td className="px-3 py-2 font-medium">
                      {c.chargeNumber}
                      {c.chargeType === "ADJUSTMENT" ? <Badge tone="info" className="ml-1.5">Düzeltme</Badge> : null}
                    </td>
                    <td className="px-3 py-2 text-white/70">{c.sponsorCompanyName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMinor(c.totalAmountMinor, c.currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMinor(c.remainingMinor, c.currency)}</td>
                    <td className="px-3 py-2 text-xs text-white/50">{formatDate(c.dueAt)}{c.isOverdue ? <span className="ml-1 text-rose-300">(+{c.daysOverdue}g)</span> : null}</td>
                    <td className="px-3 py-2"><Badge tone={DISPLAY_TONE[c.displayStatus]}>{CHARGE_DISPLAY_STATUS_LABELS[c.displayStatus]}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {c.status === "DRAFT" ? <Button variant="secondary" size="sm" onClick={() => void issue(c.id)}>Düzenle</Button> : null}
                        {c.remainingMinor > 0 && c.status !== "DRAFT" && c.status !== "CANCELLED" && c.totalAmountMinor > 0 ? (
                          <Button variant="secondary" size="sm" onClick={() => setPayTarget(c)}>Tahsilat</Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard
        title="Tahsilat geçmişi"
        description="Append-only defter · ters kayıt negatif satırdır"
        actions={<Button variant="ghost" size="sm" onClick={() => downloadCsv("payments")}>CSV</Button>}
      >
        {payments.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-white/40">Henüz tahsilat yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-white/50">
                <tr className="border-b border-white/10 text-left">
                  <th className="px-3 py-2 font-medium">Tarih</th>
                  <th className="px-3 py-2 font-medium">Sponsor</th>
                  <th className="px-3 py-2 font-medium">Tahakkuk</th>
                  <th className="px-3 py-2 font-medium">Yöntem</th>
                  <th className="px-3 py-2 text-right font-medium">Tutar</th>
                  <th className="px-3 py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 text-white/80">
                    <td className="px-3 py-2 text-xs text-white/50">{formatDate(p.paidAt)}</td>
                    <td className="px-3 py-2 text-white/70">{p.sponsorCompanyName}</td>
                    <td className="px-3 py-2 text-white/60">{p.chargeNumber ?? "—"}</td>
                    <td className="px-3 py-2 text-white/60">{PAYMENT_METHOD_LABELS[p.method]}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${p.amountMinor < 0 ? "text-rose-300" : "text-emerald-300"}`}>{formatMinor(p.amountMinor, p.currency)}</td>
                    <td className="px-3 py-2">
                      {p.isReversal ? <Badge tone="neutral">Ters kayıt</Badge> : p.reversed ? <Badge tone="warning">Çevrildi</Badge> : (
                        <Button variant="ghost" size="sm" onClick={() => void reverse(p.id)}>Ters çevir</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>

      {payTarget ? <RecordPaymentModal charge={payTarget} locale={locale} onClose={() => setPayTarget(null)} onSaved={() => { setPayTarget(null); void load(); }} /> : null}
    </div>
  );
}

function RecordPaymentModal({ charge, locale, onClose, onSaved }: { charge: SponsorshipCharge; locale: Locale; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState((charge.remainingMinor / 100).toFixed(2));
  const [method, setMethod] = useState<SponsorshipPaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const amountMinor = inputToMinor(amount);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Geçerli bir tutar girin.");
      setBusy(false);
      return;
    }
    try {
      await storeApi.recordSponsorshipPayment(charge.id, {
        amountMinor,
        currency: charge.currency,
        method,
        manualReference: reference.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open closeLabel="Kapat" onClose={onClose} title={`Tahsilat — ${charge.chargeNumber}`}>
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
          Kalan bakiye: <span className="font-semibold text-white/90">{formatMinor(charge.remainingMinor, charge.currency)}</span>
          <div className="mt-1 text-xs text-white/40">Aşırı tahsilat sunucuda reddedilir; kalan bakiye sunucuda hesaplanır.</div>
        </div>
        <Input label={`Tutar (${charge.currency})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Select
          label="Yöntem"
          options={(Object.keys(PAYMENT_METHOD_LABELS) as SponsorshipPaymentMethod[]).map((v) => ({ value: v, label: PAYMENT_METHOD_LABELS[v] }))}
          value={method}
          onChange={(e) => setMethod(e.target.value as SponsorshipPaymentMethod)}
        />
        <Input label="Referans (opsiyonel)" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Dekont / işlem no" />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>İptal</Button>
          <Button onClick={() => void submit()} disabled={busy}>{busy ? "Kaydediliyor…" : "Tahsilatı kaydet"}</Button>
        </div>
      </div>
    </Modal>
  );
}
