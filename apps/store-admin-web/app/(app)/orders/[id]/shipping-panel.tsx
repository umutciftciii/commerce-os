"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Input, Select } from "../../../../components/ui";
import { SurfaceCard } from "../../../components/premium";
import type {
  Order,
  ShippingProviderConfigResponse,
  ShipmentResponse,
  ShippingRateResponse,
} from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatMinor } from "../../../../lib/client/format";

type Locale = "tr" | "en";

const PROVIDER_LABEL: Record<string, string> = {
  MOCK: "MOCK",
  GELIVER: "Geliver",
  DHL_ECOMMERCE: "DHL eCommerce",
};

const L = {
  tr: {
    title: "Kargo",
    empty: "Bu mağazada yapılandırılmış kargo sağlayıcı yok.",
    emptyHint: "Kargo Sağlayıcıları sayfasından bir sağlayıcı ekleyin.",
    provider: "Sağlayıcı",
    pieceCount: "Parça sayısı",
    totalKg: "Toplam kg",
    totalDesi: "Toplam desi",
    packagingType: "Paketleme tipi",
    serviceType: "Gönderi tipi",
    paymentType: "Ödeme tipi",
    deliveryType: "Teslim tipi",
    cityCode: "Şehir kodu",
    districtCode: "İlçe kodu",
    recipient: "Alıcı (sipariş adresinden)",
    noRecipient: "Sipariş için kargo adresi yok.",
    calculate: "Ücret hesapla",
    createOrder: "Sipariş oluştur",
    createBarcode: "Barkod oluştur",
    geliverTest: "Test gönderi oluştur",
    rateResult: "Tahmini ücret",
    liveOffNote: "Canlı gönderi ve barkod oluşturma bu fazda kapalıdır; bu işlemler 409 ile reddedilir.",
    labelOffNote: "Geliver canlı etiket satın alma kapalıdır; yalnızca test gönderi denenebilir.",
    shipmentsTitle: "Gönderiler",
    noShipments: "Henüz gönderi yok.",
    refLabel: "Referans",
    statusLabel: "Durum",
    providerNotActive: "Bu sağlayıcı aktif değil. İşlemleri kullanmak için önce “Kargo Sağlayıcıları” sayfasından aktifleştirin.",
    rateNotSupported: "Bu sağlayıcı için ücret hesaplama desteklenmiyor.",
    httpDisabledNote:
      "Test bağlantısı bu ortamda kapalı. Sandbox HTTP doğrulaması açılmadan gerçek sağlayıcıya istek atılmaz.",
    done: "Tamam",
    // F3C.3 — DHL operasyon workflow
    dhlWorkflowTitle: "DHL gönderi operasyonu",
    dhlPrepare: "Kargo Hazırlığı Başlat",
    dhlBarcode: "Barkod Oluştur",
    dhlSync: "Durumu Güncelle",
    dhlCancel: "Kargo Kaydını İptal Et",
    dhlPrepareHint: "createRecipient + createOrder ile DHL gönderi kaydı oluşturur. Fiziksel teslim anlamına gelmez.",
    dhlCancelDisabled: "İptal endpoint’i henüz teyit edilmedi; bu işlem şu an kapalı.",
    shipmentIdLabel: "Gönderi no",
    invoiceIdLabel: "Fatura no",
    trackingNumberLabel: "Takip no",
    trackingUrlLabel: "Takip linki",
    lastSyncedLabel: "Son senkron",
    providerStatusLabel: "Sağlayıcı durumu",
    barcodeReady: "Barkod/etiket hazır",
    timelineTitle: "Hareketler",
    copy: "Kopyala",
    copied: "Kopyalandı",
    openLink: "Aç",
  },
  en: {
    title: "Shipping",
    empty: "No shipping provider is configured for this store.",
    emptyHint: "Add a provider from the Shipping Providers page.",
    provider: "Provider",
    pieceCount: "Piece count",
    totalKg: "Total kg",
    totalDesi: "Total desi",
    packagingType: "Packaging type",
    serviceType: "Service type",
    paymentType: "Payment type",
    deliveryType: "Delivery type",
    cityCode: "City code",
    districtCode: "District code",
    recipient: "Recipient (from order address)",
    noRecipient: "No shipping address on the order.",
    calculate: "Calculate rate",
    createOrder: "Create order",
    createBarcode: "Create barcode",
    geliverTest: "Create test shipment",
    rateResult: "Estimated rate",
    liveOffNote: "Live order and barcode creation are disabled in this phase; these actions are rejected with 409.",
    labelOffNote: "Geliver live label purchase is disabled; only a test shipment can be attempted.",
    shipmentsTitle: "Shipments",
    noShipments: "No shipments yet.",
    refLabel: "Reference",
    statusLabel: "Status",
    providerNotActive: "This provider is not active. Activate it from the “Shipping Providers” page to use operations.",
    rateNotSupported: "Rate calculation is not supported for this provider.",
    httpDisabledNote:
      "Test connection is disabled in this environment. No request is sent to the real provider until sandbox HTTP verification is enabled.",
    done: "Done",
    dhlWorkflowTitle: "DHL shipment operation",
    dhlPrepare: "Start shipping prep",
    dhlBarcode: "Create barcode",
    dhlSync: "Refresh status",
    dhlCancel: "Cancel shipment record",
    dhlPrepareHint: "Creates a DHL shipment record via createRecipient + createOrder. Not a physical handover.",
    dhlCancelDisabled: "Cancel endpoint is not confirmed yet; this action is currently disabled.",
    shipmentIdLabel: "Shipment ID",
    invoiceIdLabel: "Invoice ID",
    trackingNumberLabel: "Tracking no",
    trackingUrlLabel: "Tracking link",
    lastSyncedLabel: "Last synced",
    providerStatusLabel: "Provider status",
    barcodeReady: "Barcode/label ready",
    timelineTitle: "Events",
    copy: "Copy",
    copied: "Copied",
    openLink: "Open",
  },
} satisfies Record<Locale, Record<string, string>>;

interface PanelForm {
  providerConfigId: string;
  pieceCount: string;
  totalKg: string;
  totalDesi: string;
  packagingType: string;
  shipmentServiceType: string;
  paymentType: string;
  deliveryType: string;
  cityCode: string;
  districtCode: string;
}

function defaultForm(providerConfigId: string): PanelForm {
  return {
    providerConfigId,
    pieceCount: "1",
    totalKg: "1",
    totalDesi: "1",
    packagingType: "3",
    shipmentServiceType: "1",
    paymentType: "1",
    deliveryType: "1",
    cityCode: "",
    districtCode: "",
  };
}

/**
 * F3C.1 (Faz B) — Sipariş detayı kargo paneli. Provider seçimi + paket bilgileri +
 * alıcı snapshot + ücret hesaplama. Canlı sipariş/barkod CTA'ları VARSAYILAN guard
 * altındadır (gateway 409 döndürür) ve UI'da açıkça "canlı işlem kapalı" gösterilir.
 */
/** Tek satır etiketli alan; opsiyonel kopyala butonu (takip/gönderi no için). */
function DhlField({
  label,
  value,
  onCopy,
  copyText,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copyText?: string;
}) {
  return (
    <>
      <span className="text-white/35">{label}</span>
      <span className="flex items-center gap-2 font-mono text-white/70">
        <span className="truncate">{value}</span>
        {onCopy ? (
          <button type="button" onClick={onCopy} className="shrink-0 text-[11px] text-emerald-300/70 hover:text-emerald-300">
            {copyText}
          </button>
        ) : null}
      </span>
    </>
  );
}

export function ShippingPanel({ order, locale }: { order: Order; locale: Locale }) {
  const t = L[locale] ?? L.tr;

  const [providers, setProviders] = useState<ShippingProviderConfigResponse[] | null>(null);
  const [shipments, setShipments] = useState<ShipmentResponse[]>([]);
  const [form, setForm] = useState<PanelForm | null>(null);
  const [rate, setRate] = useState<ShippingRateResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const shippingAddress = useMemo(
    () => order.addresses.find((a) => a.type === "SHIPPING") ?? null,
    [order.addresses],
  );

  const load = useCallback(async () => {
    try {
      const [list, ship] = await Promise.all([
        storeApi.listShippingProviders(),
        storeApi.getOrderShipping(order.id),
      ]);
      setProviders(list.data);
      setShipments(ship.shipments);
      if (list.data.length > 0) setForm((prev) => prev ?? defaultForm(list.data[0]!.id));
    } catch (error) {
      setActionError(messageForError(error, locale));
      setProviders([]);
    }
  }, [order.id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = providers?.find((p) => p.id === form?.providerConfigId) ?? null;

  const buildRecipientAndPieces = (f: PanelForm) => {
    const pieces = [
      {
        desi: Number(f.totalDesi) || 1,
        kg: Number(f.totalKg) || 1,
      },
    ];
    const recipient = {
      fullName: shippingAddress?.fullName ?? undefined,
      phone: shippingAddress?.phone ?? undefined,
      cityName: shippingAddress?.city ?? undefined,
      districtName: shippingAddress?.district ?? undefined,
      address: shippingAddress?.addressLine1 ?? undefined,
      cityCode: f.cityCode ? Number(f.cityCode) : undefined,
      districtCode: f.districtCode ? Number(f.districtCode) : undefined,
    };
    return { pieces, recipient };
  };

  const onCalculate = async () => {
    if (!form) return;
    setBusy(true);
    setActionError(null);
    setRate(null);
    try {
      const { pieces, recipient } = buildRecipientAndPieces(form);
      const result = await storeApi.calculateOrderShippingRate(order.id, {
        providerConfigId: form.providerConfigId,
        shipmentServiceType: Number(form.shipmentServiceType) || undefined,
        packagingType: Number(form.packagingType) || undefined,
        paymentType: Number(form.paymentType) || undefined,
        deliveryType: Number(form.deliveryType) || undefined,
        recipient,
        pieces,
      });
      setRate(result);
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusy(false);
    }
  };

  const onCreateOrder = async () => {
    if (!form) return;
    setBusy(true);
    setActionError(null);
    try {
      const { pieces, recipient } = buildRecipientAndPieces(form);
      const result = await storeApi.createOrderShipment(order.id, {
        providerConfigId: form.providerConfigId,
        referenceId: order.orderNumber,
        recipient,
        pieces,
        explicitConfirm: false,
      });
      setNotice(`${t.refLabel}: ${result.referenceId}`);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusy(false);
    }
  };

  const onCreateBarcode = async () => {
    if (!form) return;
    setBusy(true);
    setActionError(null);
    try {
      const { pieces } = buildRecipientAndPieces(form);
      const result = await storeApi.createOrderShipmentBarcode(order.id, {
        providerConfigId: form.providerConfigId,
        referenceId: order.orderNumber,
        pieces,
        explicitConfirm: false,
      });
      setNotice(`${t.refLabel}: ${result.referenceId}`);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusy(false);
    }
  };

  // F3C.3 — DHL post-order operasyon aksiyonlari.
  const runDhlAction = async (fn: () => Promise<{ shipment: { referenceId: string } }>) => {
    if (!form) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await fn();
      setNotice(`${t.refLabel}: ${result.shipment.referenceId}`);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusy(false);
    }
  };

  const onDhlPrepare = () => {
    if (!form) return;
    const { pieces, recipient } = buildRecipientAndPieces(form);
    void runDhlAction(() =>
      storeApi.prepareDhlShipment(order.id, {
        providerConfigId: form.providerConfigId,
        shipmentServiceType: Number(form.shipmentServiceType) || undefined,
        packagingType: Number(form.packagingType) || undefined,
        paymentType: Number(form.paymentType) || undefined,
        deliveryType: Number(form.deliveryType) || undefined,
        recipient,
        pieces,
        explicitConfirm: true,
      }),
    );
  };

  const onDhlBarcode = () => {
    if (!form) return;
    void runDhlAction(() =>
      storeApi.createDhlBarcode(order.id, {
        providerConfigId: form.providerConfigId,
        packagingType: Number(form.packagingType) || undefined,
        explicitConfirm: true,
      }),
    );
  };

  const onDhlSync = () => {
    if (!form) return;
    void runDhlAction(() => storeApi.syncDhlShipment(order.id, { providerConfigId: form.providerConfigId }));
  };

  const copyText = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      setTimeout(() => setCopied((c) => (c === field ? null : c)), 1500);
    } catch {
      /* clipboard yoksa sessiz */
    }
  };

  if (providers === null) {
    return (
      <SurfaceCard title={t.title}>
        <p className="text-sm text-white/30">…</p>
      </SurfaceCard>
    );
  }

  if (providers.length === 0) {
    return (
      <SurfaceCard title={t.title}>
        <p className="text-sm text-white/40">{t.empty}</p>
        <p className="mt-1 text-[12px] text-white/30">{t.emptyHint}</p>
      </SurfaceCard>
    );
  }

  const isGeliver = selected?.provider === "GELIVER";
  const isDhl = selected?.provider === "DHL_ECOMMERCE";
  const caps = selected?.capabilities;
  const enabled = selected?.status === "ENABLED";
  // F3C.3 — bu sipariş için aktif (iptal/başarısız olmayan) DHL gönderisi.
  const activeDhl =
    shipments.find(
      (s) => s.provider === "DHL_ECOMMERCE" && s.status !== "CANCELLED" && s.status !== "FAILED",
    ) ?? null;
  const canBarcode = activeDhl?.status === "ORDER_CREATED";

  return (
    <SurfaceCard title={t.title}>
      {notice ? (
        <Alert tone="success" className="mb-3" action={<Button size="sm" variant="ghost" onClick={() => setNotice(null)}>{t.done}</Button>}>
          {notice}
        </Alert>
      ) : null}
      {actionError ? <Alert tone="error" className="mb-3">{actionError}</Alert> : null}

      {form ? (
        <div className="space-y-4">
          <Select
            label={t.provider}
            value={form.providerConfigId}
            onChange={(e) => {
              setForm({ ...form, providerConfigId: e.target.value });
              setRate(null);
            }}
            options={providers.map((p) => ({ value: p.id, label: `${p.displayName} · ${PROVIDER_LABEL[p.provider] ?? p.provider} · ${p.status}` }))}
          />

          {/* Alıcı snapshot */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-white/30">{t.recipient}</p>
            {shippingAddress ? (
              <div className="text-[12px] text-white/55">
                <p className="font-medium text-white/70">{shippingAddress.fullName}</p>
                <p>{shippingAddress.addressLine1}</p>
                <p>
                  {shippingAddress.district ? `${shippingAddress.district}, ` : ""}
                  {shippingAddress.city} · {shippingAddress.countryCode}
                </p>
                {shippingAddress.phone ? <p>{shippingAddress.phone}</p> : null}
              </div>
            ) : (
              <p className="text-[12px] text-white/30">{t.noRecipient}</p>
            )}
          </div>

          {/* Paket bilgileri */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input label={t.pieceCount} type="number" value={form.pieceCount} onChange={(e) => setForm({ ...form, pieceCount: e.target.value })} />
            <Input label={t.totalKg} type="number" value={form.totalKg} onChange={(e) => setForm({ ...form, totalKg: e.target.value })} />
            <Input label={t.totalDesi} type="number" value={form.totalDesi} onChange={(e) => setForm({ ...form, totalDesi: e.target.value })} />
            <Input label={t.packagingType} type="number" value={form.packagingType} onChange={(e) => setForm({ ...form, packagingType: e.target.value })} />
            <Input label={t.serviceType} type="number" value={form.shipmentServiceType} onChange={(e) => setForm({ ...form, shipmentServiceType: e.target.value })} />
            <Input label={t.paymentType} type="number" value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value })} />
            <Input label={t.deliveryType} type="number" value={form.deliveryType} onChange={(e) => setForm({ ...form, deliveryType: e.target.value })} />
            {isDhl ? (
              <>
                <Input label={t.cityCode} type="number" value={form.cityCode} onChange={(e) => setForm({ ...form, cityCode: e.target.value })} />
                <Input label={t.districtCode} type="number" value={form.districtCode} onChange={(e) => setForm({ ...form, districtCode: e.target.value })} />
              </>
            ) : null}
          </div>

          {/* Provider durumu / guard uyarısı */}
          {!enabled ? (
            <Alert tone="warning">{t.providerNotActive}</Alert>
          ) : (
            <Alert tone="warning">{isGeliver ? t.labelOffNote : t.liveOffNote}</Alert>
          )}

          {/* TODO-094B — gercek saglayici (MOCK haric) henuz canli HTTP ile dogrulanmadiysa
              "gercek istek atilmadi" uyarisini goster. connectionStatus OK degilse. */}
          {selected && selected.provider !== "MOCK" && (selected.connectionStatus ?? "UNTESTED") !== "OK" ? (
            <Alert tone="info">{t.httpDisabledNote}</Alert>
          ) : null}

          {/* Rate sonucu */}
          {rate ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-emerald-300/70">{t.rateResult}</p>
              <p className="text-lg font-semibold tabular-nums text-white/90">{formatMinor(rate.amountMinor, rate.currency)}</p>
            </div>
          ) : null}

          {/* Aksiyonlar — yetenek (capability) bazlı. Provider "test OK" olsa bile
              desteklenmeyen/guard'lı işlemler disabled görünür. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={onCalculate} disabled={busy || !caps?.canCalculateRate}>
              {t.calculate}
            </Button>
            {isGeliver ? (
              <Button variant="ghost" onClick={onCreateOrder} disabled={busy || !caps?.canCreateTestShipment}>
                {t.geliverTest}
              </Button>
            ) : isDhl ? (
              <>
                <Button variant="ghost" onClick={onDhlPrepare} disabled={busy || !caps?.canCreateOrder || Boolean(activeDhl)}>
                  {t.dhlPrepare}
                </Button>
                <Button variant="ghost" onClick={onDhlBarcode} disabled={busy || !canBarcode || !caps?.canCreateBarcode}>
                  {t.dhlBarcode}
                </Button>
                <Button variant="ghost" onClick={onDhlSync} disabled={busy || !activeDhl}>
                  {t.dhlSync}
                </Button>
                {/* Cancel: endpoint MNG tarafında teyit edilmedi → disabled. */}
                <Button variant="ghost" disabled title={t.dhlCancelDisabled}>
                  {t.dhlCancel}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={onCreateOrder} disabled={busy || !caps?.canCreateOrder}>
                  {t.createOrder}
                </Button>
                <Button variant="ghost" onClick={onCreateBarcode} disabled={busy || !caps?.canCreateBarcode}>
                  {t.createBarcode}
                </Button>
              </>
            )}
          </div>
          {isDhl ? <p className="text-[11px] text-white/30">{t.dhlPrepareHint}</p> : null}
          {isDhl && !activeDhl ? <p className="text-[11px] text-white/30">{t.dhlCancelDisabled}</p> : null}
          {enabled && !caps?.canCalculateRate ? (
            <p className="text-[11px] text-white/30">{t.rateNotSupported}</p>
          ) : null}

          {/* DHL aktif gönderi durum kartı + timeline */}
          {isDhl && activeDhl ? (
            <div className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35">{t.dhlWorkflowTitle}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                <DhlField label={t.statusLabel} value={activeDhl.status} />
                <DhlField label={t.refLabel} value={activeDhl.referenceId} />
                {activeDhl.externalShipmentId ? (
                  <DhlField
                    label={t.shipmentIdLabel}
                    value={activeDhl.externalShipmentId}
                    onCopy={() => copyText(activeDhl.externalShipmentId!, "shipmentId")}
                    copyText={copied === "shipmentId" ? t.copied : t.copy}
                  />
                ) : null}
                {activeDhl.externalInvoiceId ? <DhlField label={t.invoiceIdLabel} value={activeDhl.externalInvoiceId} /> : null}
                {activeDhl.trackingNumber ? (
                  <DhlField
                    label={t.trackingNumberLabel}
                    value={activeDhl.trackingNumber}
                    onCopy={() => copyText(activeDhl.trackingNumber!, "trackingNumber")}
                    copyText={copied === "trackingNumber" ? t.copied : t.copy}
                  />
                ) : null}
                {activeDhl.lastProviderStatus ? <DhlField label={t.providerStatusLabel} value={activeDhl.lastProviderStatus} /> : null}
                {activeDhl.lastSyncedAt ? (
                  <DhlField label={t.lastSyncedLabel} value={new Date(activeDhl.lastSyncedAt).toLocaleString(locale)} />
                ) : null}
              </div>
              {activeDhl.trackingUrl ? (
                <a
                  href={activeDhl.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[12px] text-emerald-300/80 underline"
                >
                  {t.trackingUrlLabel} · {t.openLink}
                </a>
              ) : null}
              {activeDhl.barcodeHasLabel ? <Badge tone="success">{t.barcodeReady}</Badge> : null}

              {activeDhl.events.length > 0 ? (
                <div className="border-t border-white/[0.06] pt-2">
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/30">{t.timelineTitle}</p>
                  <ul className="space-y-1.5">
                    {activeDhl.events.map((e) => (
                      <li key={e.id} className="flex items-start gap-2 text-[12px] text-white/55">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
                        <span>
                          <span className="text-white/75">{e.statusText ?? e.eventType}</span>
                          {e.location ? <span className="text-white/35"> · {e.location}</span> : null}
                          <span className="block text-[11px] text-white/30">
                            {new Date(e.occurredAt ?? e.createdAt).toLocaleString(locale)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Mevcut gönderiler */}
      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">{t.shipmentsTitle}</p>
        {shipments.length === 0 ? (
          <p className="text-[12px] text-white/30">{t.noShipments}</p>
        ) : (
          <div className="space-y-2">
            {shipments.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                <span className="font-mono text-[12px] text-white/60">{s.referenceId}</span>
                <Badge tone="info">{s.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}
