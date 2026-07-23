"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderPaymentStateResponse } from "@commerce-os/api-client";
import { Alert, Button } from "../../../../components/ui";
import { SurfaceCard, RailRow } from "../../../components/premium";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatMinor } from "../../../../lib/client/format";

type RecoveryDict = {
  title: string;
  remaining: string;
  captured: string;
  payable: string;
  noProvider: string;
  notCollectible: string;
  settled: string;
  providerLabel: string;
  autoProvider: string;
  createLink: string;
  regenerate: string;
  copy: string;
  copied: string;
  sendEmail: string;
  emailSent: string;
  emailFailed: string;
  emailNotConfigured: string;
  activeLinkTitle: string;
  linkExpires: string;
  manualTitle: string;
  manualMethod: string;
  manualAmount: string;
  manualReference: string;
  manualNote: string;
  manualCollectedAt: string;
  manualSubmit: string;
  manualRecorded: string;
  cancel: string;
  manualMethods: Record<"BANK_TRANSFER" | "CASH" | "POS" | "OTHER", string>;
};

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 outline-none focus:border-white/30";

/**
 * TODO-159F — Sipariş ödeme tahsilat (recovery) aksiyonları. Sunucu-otoriter durumdan
 * (kalan bakiye + uygun sağlayıcılar + aktif deneme) türer; sağlayıcı sonradan
 * aktifleşirse yenilemede aksiyon otomatik görünür.
 */
export function OrderPaymentActions({
  orderId,
  d,
  locale,
  onChanged,
}: {
  orderId: string;
  d: RecoveryDict;
  locale: "tr" | "en";
  onChanged: () => void;
}) {
  const [state, setState] = useState<OrderPaymentStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providerId, setProviderId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await storeApi.getOrderPayment(orderId);
      setState(next);
    } catch (err) {
      setError(messageForError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [orderId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await fn();
        await load();
        onChanged();
      } catch (err) {
        setError(messageForError(err, locale));
      } finally {
        setBusy(false);
      }
    },
    [load, locale, onChanged],
  );

  const activeLink = state?.activeAttempt?.paymentLinkUrl ?? null;

  const copyLink = useCallback(async () => {
    if (!activeLink) return;
    try {
      await navigator.clipboard.writeText(activeLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano erişimi yoksa sessiz geç (kullanıcı elle kopyalar).
    }
  }, [activeLink]);

  if (loading && !state) {
    return (
      <SurfaceCard title={d.title}>
        <p className="text-sm text-white/30">…</p>
      </SurfaceCard>
    );
  }
  if (!state) {
    return (
      <SurfaceCard title={d.title}>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </SurfaceCard>
    );
  }

  const currency = state.currency;
  const canCollect = state.canStartCollection;

  return (
    <SurfaceCard title={d.title}>
      <div className="space-y-3">
        <RailRow label={d.payable} value={formatMinor(state.payableMinor, currency)} />
        <RailRow label={d.captured} value={formatMinor(state.capturedMinor, currency)} />
        <RailRow
          label={d.remaining}
          value={<span className="font-semibold text-white/90">{formatMinor(state.remainingMinor, currency)}</span>}
        />

        {error ? <Alert tone="error">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        {!canCollect ? (
          <p className="text-sm text-white/40">
            {state.remainingMinor <= 0 ? d.settled : d.notCollectible}
          </p>
        ) : !state.providersConfigured && state.availableProviders.length === 0 ? (
          <Alert tone="warning">{d.noProvider}</Alert>
        ) : (
          <>
            {/* Aktif ödeme bağlantısı */}
            {activeLink ? (
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-wide text-white/40">{d.activeLinkTitle}</p>
                <p className="break-all font-mono text-xs text-white/70">{activeLink}</p>
                {state.activeAttempt?.expiresAt ? (
                  <p className="text-xs text-white/40">
                    {d.linkExpires}: {new Date(state.activeAttempt.expiresAt).toLocaleString(locale)}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={copyLink} disabled={busy}>
                    {copied ? d.copied : d.copy}
                  </Button>
                  {/* TD-110 — "Müşteriye Gönder" YALNIZ gerçek e-posta teslimatı
                      yapılandırılmışsa aktif; aksi halde disabled + açıklama (sahte gönderim YOK). */}
                  {state.emailDeliveryConfigured ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        setNotice(null);
                        try {
                          const res = await storeApi.emailOrderPaymentLink(orderId);
                          // Başarı mesajı YALNIZ gerçek gönderim kabul edilince (SENT).
                          if (res.sent) setNotice(d.emailSent);
                          else setError(d.emailFailed);
                          await load();
                          onChanged();
                        } catch (err) {
                          setError(messageForError(err, locale));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {d.sendEmail}
                    </Button>
                  ) : (
                    <Button type="button" variant="secondary" disabled title={d.emailNotConfigured}>
                      {d.sendEmail}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => runAction(() => storeApi.regenerateOrderPaymentLink(orderId, providerId ? { providerConfigId: providerId } : {}))}
                  >
                    {d.regenerate}
                  </Button>
                </div>
                {!state.emailDeliveryConfigured ? (
                  <p className="text-xs text-white/40">{d.emailNotConfigured}</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {state.availableProviders.length > 0 ? (
                  <label className="block text-sm">
                    <span className="mb-1 block text-white/45">{d.providerLabel}</span>
                    <select
                      className={inputClass}
                      value={providerId}
                      onChange={(event) => setProviderId(event.target.value)}
                    >
                      <option value="">{d.autoProvider}</option>
                      {state.availableProviders.map((option) => (
                        <option key={option.providerConfigId} value={option.providerConfigId}>
                          {option.displayName} · {option.provider}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <Button
                  type="button"
                  disabled={busy || state.availableProviders.length === 0}
                  onClick={() => runAction(() => storeApi.createOrderPaymentLink(orderId, providerId ? { providerConfigId: providerId } : {}))}
                >
                  {d.createLink}
                </Button>
              </div>
            )}

            {/* Manuel (offline) ödeme */}
            {showManual ? (
              <ManualPaymentForm
                d={d}
                remainingMinor={state.remainingMinor}
                currency={currency}
                busy={busy}
                onCancel={() => setShowManual(false)}
                onSubmit={(input) =>
                  runAction(async () => {
                    await storeApi.recordManualPayment(orderId, input);
                    setShowManual(false);
                    setNotice(d.manualRecorded);
                  })
                }
              />
            ) : (
              <Button type="button" variant="secondary" onClick={() => setShowManual(true)} disabled={busy}>
                {d.manualTitle}
              </Button>
            )}
          </>
        )}
      </div>
    </SurfaceCard>
  );
}

function ManualPaymentForm({
  d,
  remainingMinor,
  currency,
  busy,
  onCancel,
  onSubmit,
}: {
  d: RecoveryDict;
  remainingMinor: number;
  currency: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    method: "BANK_TRANSFER" | "CASH" | "POS" | "OTHER";
    amountMinor: number;
    currency: string;
    reference?: string;
    note?: string;
    collectedAt?: string;
  }) => void;
}) {
  const [method, setMethod] = useState<"BANK_TRANSFER" | "CASH" | "POS" | "OTHER">("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  // MVP: tam tahsilat (kalan bakiye) — kısmi tahsilat sunucuda reddedilir.
  const amountLabel = useMemo(() => formatMinor(remainingMinor, currency), [remainingMinor, currency]);

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-wide text-white/40">{d.manualTitle}</p>
      <label className="block text-sm">
        <span className="mb-1 block text-white/45">{d.manualMethod}</span>
        <select
          className={inputClass}
          value={method}
          onChange={(event) => setMethod(event.target.value as typeof method)}
        >
          {(["BANK_TRANSFER", "CASH", "POS", "OTHER"] as const).map((key) => (
            <option key={key} value={key}>
              {d.manualMethods[key]}
            </option>
          ))}
        </select>
      </label>
      <RailRow label={d.manualAmount} value={<span className="font-semibold text-white/90">{amountLabel}</span>} />
      <label className="block text-sm">
        <span className="mb-1 block text-white/45">{d.manualReference}</span>
        <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-white/45">{d.manualNote}</span>
        <input className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            onSubmit({
              method,
              amountMinor: remainingMinor,
              currency,
              reference: reference.trim() || undefined,
              note: note.trim() || undefined,
            })
          }
        >
          {d.manualSubmit}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {d.cancel}
        </Button>
      </div>
    </div>
  );
}
