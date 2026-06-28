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
    done: "Tamam",
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
    done: "Done",
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
export function ShippingPanel({ order, locale }: { order: Order; locale: Locale }) {
  const t = L[locale] ?? L.tr;

  const [providers, setProviders] = useState<ShippingProviderConfigResponse[] | null>(null);
  const [shipments, setShipments] = useState<ShipmentResponse[]>([]);
  const [form, setForm] = useState<PanelForm | null>(null);
  const [rate, setRate] = useState<ShippingRateResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          {enabled && !caps?.canCalculateRate ? (
            <p className="text-[11px] text-white/30">{t.rateNotSupported}</p>
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
