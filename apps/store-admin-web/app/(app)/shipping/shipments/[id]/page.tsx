"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Badge, Button, Input, PageHeader, SkeletonRows, useLocale } from "../../../../../components/ui";
import { SurfaceCard } from "../../../../components/premium";
import { ProviderLogo } from "../../../../../components/provider-logo";
import type { ShipmentDetail } from "@commerce-os/api-client";
import { storeApi } from "../../../../../lib/client/api";
import { messageForError } from "../../../../../lib/client/messages";
import {
  SHIPMENT_ACTION_DISABLED_REASON,
  SHIPMENT_EVENT_LABEL,
  SHIPMENT_STATUS_DESC,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_TONE,
  SHIPMENT_STEPS,
  isProblemStatus,
  shipmentStepIndex,
  type Locale,
} from "../../../../../lib/client/shipment-ui";

const L = {
  tr: {
    eyebrow: "Kargo Gönderisi",
    back: "← Gönderiler",
    orderNo: "Sipariş No",
    goOrder: "Siparişi Gör",
    provider: "Kargo Firması",
    tracking: "Takip No",
    reference: "Referans",
    shipmentId: "Gönderi No",
    invoiceId: "Fatura No",
    barcodeState: "Barkod durumu",
    barcodeReady: "Hazır",
    barcodeNone: "Yok",
    lastSync: "Son senkron",
    lastStatus: "Son sağlayıcı durumu",
    lastPoint: "Son işlem noktası",
    summary: "Özet",
    progress: "Durum çizgisi",
    timeline: "Hareketler",
    noEvents: "Henüz hareket yok.",
    operationPoint: "İşlem noktası",
    actions: "İşlemler",
    aCreateLabel: "Barkod/Etiket Oluştur",
    aSync: "Durumu Güncelle",
    aCancel: "Gönderi Kaydını İptal Et",
    aManual: "Manuel Takip No Gir",
    aNotify: "Müşteriye Bildirim Gönder",
    notifySoon: "Bildirim gönderme yakında eklenecek.",
    manualPlaceholder: "Takip numarası",
    manualSave: "Kaydet",
    manualCancel: "Vazgeç",
    cancelConfirm:
      "Bu işlem gönderi/barkod kaydını iptal etmeyi dener. Fiziksel teslim yapılmışsa başarısız olabilir. Devam edilsin mi?",
    openTracking: "Takip linkini aç",
    notFound: "Gönderi bulunamadı.",
    copy: "Kopyala",
    copied: "Kopyalandı",
    actionsDisabled: "Şu an kullanılabilir işlem yok.",
  },
  en: {
    eyebrow: "Shipment",
    back: "← Shipments",
    orderNo: "Order No",
    goOrder: "View order",
    provider: "Carrier",
    tracking: "Tracking No",
    reference: "Reference",
    shipmentId: "Shipment ID",
    invoiceId: "Invoice ID",
    barcodeState: "Label state",
    barcodeReady: "Ready",
    barcodeNone: "None",
    lastSync: "Last sync",
    lastStatus: "Last provider status",
    lastPoint: "Last operation point",
    summary: "Summary",
    progress: "Progress",
    timeline: "Events",
    noEvents: "No events yet.",
    operationPoint: "Operation point",
    actions: "Actions",
    aCreateLabel: "Create label",
    aSync: "Refresh status",
    aCancel: "Cancel shipment record",
    aManual: "Enter tracking manually",
    aNotify: "Notify customer",
    notifySoon: "Customer notifications coming soon.",
    manualPlaceholder: "Tracking number",
    manualSave: "Save",
    manualCancel: "Cancel",
    cancelConfirm:
      "This attempts to cancel the shipment/label record. It may fail if the parcel was already handed over. Continue?",
    openTracking: "Open tracking link",
    notFound: "Shipment not found.",
    copy: "Copy",
    copied: "Copied",
    actionsDisabled: "No actions available right now.",
  },
} satisfies Record<Locale, Record<string, string>>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-white/35">{label}</span>
      <span className="flex items-center gap-2 font-mono text-white/70">{children}</span>
    </>
  );
}

/** Provider-safe yatay stepper. "Kargoya verildi" otomatik adım DEĞİLDİR. */
function Stepper({ steps, current, problem }: { steps: string[]; current: number; problem: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((step, i) => {
        const done = current >= i && !(problem && i >= current);
        const active = current === i;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-inset ${
                done
                  ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
                  : active
                    ? "bg-indigo-500/15 text-indigo-300 ring-indigo-500/30"
                    : "bg-white/[0.05] text-white/35 ring-white/10"
              }`}
            >
              {i + 1}
            </span>
            <span className={`text-[12px] ${done || active ? "text-white/75" : "text-white/35"}`}>{step}</span>
            {i < steps.length - 1 ? <span className="mx-1 h-px w-4 bg-white/10" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export default function ShipmentDetailPage() {
  const locale = (useLocale() as Locale) ?? "tr";
  const t = L[locale] ?? L.tr;
  const params = useParams<{ id: string }>();
  const shipmentId = params.id;

  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await storeApi.getShipment(shipmentId);
      setShipment(res.shipment);
    } catch (err) {
      setLoadError(messageForError(err, locale));
    }
  }, [shipmentId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setActionError(messageForError(err, locale));
    } finally {
      setBusy(false);
    }
  };

  const onCreateLabel = () => void run(() => storeApi.createShipmentLabel(shipmentId, { explicitConfirm: true }));
  const onSync = () => void run(() => storeApi.syncShipment(shipmentId));
  const onCancel = () => {
    if (typeof window !== "undefined" && !window.confirm(t.cancelConfirm)) return;
    void run(() => storeApi.cancelShipment(shipmentId, { explicitConfirm: true }));
  };
  const onManualSave = () => {
    const value = manualValue.trim();
    if (!value) return;
    void run(async () => {
      await storeApi.setShipmentManualTracking(shipmentId, { trackingNumber: value });
      setManualOpen(false);
      setManualValue("");
    });
  };

  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard yoksa sessiz */
    }
  };

  if (loadError) {
    return (
      <div className="space-y-4">
        <Link href="/shipping/shipments" className="text-[12px] text-white/45 hover:text-white/70">
          {t.back}
        </Link>
        <Alert tone="error">{loadError}</Alert>
      </div>
    );
  }
  if (!shipment) return <SkeletonRows rows={6} />;

  const statusLabel = SHIPMENT_STATUS_LABEL[locale];
  const statusDesc = SHIPMENT_STATUS_DESC[locale];
  const eventLabel = SHIPMENT_EVENT_LABEL[locale];
  const a = shipment.actions;
  const problem = isProblemStatus(shipment.status);
  const disabledReasonText = a.disabledReason ? SHIPMENT_ACTION_DISABLED_REASON[locale][a.disabledReason] : null;

  return (
    <div className="space-y-5">
      <Link href="/shipping/shipments" className="text-[12px] text-white/45 hover:text-white/70">
        {t.back}
      </Link>
      <PageHeader
        eyebrow={t.eyebrow}
        title={shipment.referenceId}
        description={statusDesc[shipment.status]}
        actions={<Badge tone={SHIPMENT_STATUS_TONE[shipment.status]}>{statusLabel[shipment.status]}</Badge>}
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Sol: özet + stepper + timeline */}
        <div className="space-y-5 lg:col-span-2">
          <SurfaceCard title={t.summary}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              <Field label={t.orderNo}>
                <Link href={`/orders/${shipment.orderId}`} className="text-indigo-300/80 hover:text-indigo-200">
                  {shipment.orderNumber}
                </Link>
              </Field>
              <Field label={t.provider}>
                <ProviderLogo
                  logoUrl={shipment.providerInfo.logoUrl}
                  displayName={shipment.providerInfo.displayName}
                  logoAlt={shipment.providerInfo.logoAlt}
                  size={20}
                />
                <span className="font-sans text-white/70">{shipment.providerInfo.displayName}</span>
              </Field>
              {shipment.trackingNumber ? (
                <Field label={t.tracking}>
                  <span className="truncate">{shipment.trackingNumber}</span>
                  <button
                    type="button"
                    onClick={() => copyText(shipment.trackingNumber!, "tracking")}
                    className="shrink-0 text-[11px] text-emerald-300/70 hover:text-emerald-300"
                  >
                    {copied === "tracking" ? t.copied : t.copy}
                  </button>
                </Field>
              ) : null}
              <Field label={t.reference}>
                <span className="truncate">{shipment.referenceId}</span>
              </Field>
              {shipment.externalShipmentId ? (
                <Field label={t.shipmentId}>
                  <span className="truncate">{shipment.externalShipmentId}</span>
                  <button
                    type="button"
                    onClick={() => copyText(shipment.externalShipmentId!, "shipmentId")}
                    className="shrink-0 text-[11px] text-emerald-300/70 hover:text-emerald-300"
                  >
                    {copied === "shipmentId" ? t.copied : t.copy}
                  </button>
                </Field>
              ) : null}
              {shipment.externalInvoiceId ? (
                <Field label={t.invoiceId}>
                  <span className="truncate">{shipment.externalInvoiceId}</span>
                </Field>
              ) : null}
              <Field label={t.barcodeState}>
                <span className="font-sans">{shipment.barcodeHasLabel ? t.barcodeReady : t.barcodeNone}</span>
              </Field>
              {shipment.lastProviderStatus ? (
                <Field label={t.lastStatus}>
                  <span className="font-sans">{shipment.lastProviderStatus}</span>
                </Field>
              ) : null}
              {shipment.lastSyncedAt ? (
                <Field label={t.lastSync}>
                  <span className="font-sans">{new Date(shipment.lastSyncedAt).toLocaleString(locale)}</span>
                </Field>
              ) : null}
            </div>
            {shipment.trackingUrl ? (
              <a
                href={shipment.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[12px] text-emerald-300/80 underline"
              >
                {t.openTracking}
              </a>
            ) : null}
          </SurfaceCard>

          <SurfaceCard title={t.progress}>
            <Stepper steps={SHIPMENT_STEPS[locale]} current={shipmentStepIndex(shipment.status)} problem={problem} />
          </SurfaceCard>

          <SurfaceCard title={t.timeline}>
            {shipment.events.length === 0 ? (
              <p className="text-[12px] text-white/30">{t.noEvents}</p>
            ) : (
              <ul className="space-y-2">
                {[...shipment.events].reverse().map((e) => (
                  <li key={e.id} className="flex items-start gap-2 text-[12px] text-white/55">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
                    <span>
                      <span className="text-white/75">{e.statusText ?? eventLabel[e.eventType]}</span>
                      {/* ADR-045: location KESİN varış/teslimat şubesi DEĞİL → "işlem noktası". */}
                      {e.location ? (
                        <span className="text-white/35">
                          {" · "}
                          {t.operationPoint}: {e.location}
                        </span>
                      ) : null}
                      <span className="block text-[11px] text-white/30">
                        {new Date(e.occurredAt ?? e.createdAt).toLocaleString(locale)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SurfaceCard>
        </div>

        {/* Sağ: aksiyon paneli (capability-driven, provider-agnostic) */}
        <div>
          <SurfaceCard title={t.actions}>
            <div className="space-y-2">
              <Button className="w-full" variant="secondary" onClick={onCreateLabel} disabled={busy || !a.canCreateLabel}>
                {t.aCreateLabel}
              </Button>
              <Button className="w-full" variant="ghost" onClick={onSync} disabled={busy || !a.canSync}>
                {t.aSync}
              </Button>
              {!manualOpen ? (
                <Button className="w-full" variant="ghost" onClick={() => setManualOpen(true)} disabled={busy || !a.canManualTracking}>
                  {t.aManual}
                </Button>
              ) : (
                <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2">
                  <Input
                    label={t.aManual}
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    placeholder={t.manualPlaceholder}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={onManualSave} disabled={busy || !manualValue.trim()}>
                      {t.manualSave}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setManualOpen(false)} disabled={busy}>
                      {t.manualCancel}
                    </Button>
                  </div>
                </div>
              )}
              <Button className="w-full" variant="danger" onClick={onCancel} disabled={busy || !a.canCancel}>
                {t.aCancel}
              </Button>
              {/* Müşteriye bildirim: bu turda backend yok → açıkça pasif + not (sahte aksiyon yok). */}
              <Button className="w-full" variant="ghost" disabled title={t.notifySoon}>
                {t.aNotify}
              </Button>
              <p className="text-[11px] text-white/30">{t.notifySoon}</p>
            </div>
            {disabledReasonText ? <Alert tone="info" className="mt-3">{disabledReasonText}</Alert> : null}
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
