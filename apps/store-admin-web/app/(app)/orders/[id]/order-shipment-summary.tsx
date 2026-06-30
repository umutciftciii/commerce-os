"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Input, Select } from "../../../../components/ui";
import { SurfaceCard } from "../../../components/premium";
import { ProviderLogo } from "../../../../components/provider-logo";
import type { Order, ShipmentResponse, ShippingProviderConfigResponse } from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import {
  PROVIDER_TYPE_LABEL,
  SHIPMENT_EVENT_LABEL,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_TONE,
  type Locale,
} from "../../../../lib/client/shipment-ui";

/**
 * F3C.5 (TODO-121) — Sipariş detayı KARGO ÖZET kartı. Order = ticari işlem; burada yalnız
 * özet + CTA bulunur. Operasyon/timeline/sync/cancel ekranı /shipping/shipments/[id]'dedir.
 * Gönderi siparişten doğar: shipment yoksa "Gönderi Kaydı Oluştur" (born-from-order) CTA'sı.
 */

const L = {
  tr: {
    title: "Kargo",
    empty: "Bu mağazada yapılandırılmış kargo sağlayıcı yok.",
    emptyHint: "Kargo Sağlayıcıları sayfasından bir sağlayıcı ekleyin.",
    noShipment: "Henüz kargo kaydı oluşturulmadı.",
    create: "Gönderi Kaydı Oluştur",
    cancelCreate: "Vazgeç",
    provider: "Sağlayıcı",
    totalKg: "Toplam kg",
    totalDesi: "Toplam desi",
    pieceCount: "Parça sayısı",
    recipient: "Alıcı (sipariş adresinden)",
    noRecipient: "Sipariş için kargo adresi yok.",
    submit: "Oluştur",
    status: "Durum",
    tracking: "Takip No",
    lastEvent: "Son işlem",
    lastUpdate: "Son güncelleme",
    goDetail: "Kargo Detayına Git",
    providerNotActive: "Seçili sağlayıcı aktif değil; önce Kargo Sağlayıcıları sayfasından aktifleştirin.",
    liveOff: "Canlı gönderi oluşturma bu fazda guard altındadır; desteklenmeyen işlemler reddedilir.",
  },
  en: {
    title: "Shipping",
    empty: "No shipping provider is configured for this store.",
    emptyHint: "Add a provider from the Shipping Providers page.",
    noShipment: "No shipment record created yet.",
    create: "Create shipment record",
    cancelCreate: "Cancel",
    provider: "Provider",
    totalKg: "Total kg",
    totalDesi: "Total desi",
    pieceCount: "Piece count",
    recipient: "Recipient (from order address)",
    noRecipient: "No shipping address on the order.",
    submit: "Create",
    status: "Status",
    tracking: "Tracking No",
    lastEvent: "Last event",
    lastUpdate: "Last update",
    goDetail: "Go to shipment detail",
    providerNotActive: "Selected provider is not active; activate it from the Shipping Providers page first.",
    liveOff: "Live shipment creation is guarded in this phase; unsupported actions are rejected.",
  },
} satisfies Record<Locale, Record<string, string>>;

export function OrderShipmentSummary({ order, locale }: { order: Order; locale: Locale }) {
  const t = L[locale] ?? L.tr;
  const [providers, setProviders] = useState<ShippingProviderConfigResponse[] | null>(null);
  const [shipments, setShipments] = useState<ShipmentResponse[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [providerConfigId, setProviderConfigId] = useState("");
  const [kg, setKg] = useState("1");
  const [desi, setDesi] = useState("1");
  const [pieceCount, setPieceCount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shippingAddress = useMemo(
    () => order.addresses.find((aa) => aa.type === "SHIPPING") ?? null,
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
      if (list.data.length > 0) setProviderConfigId((prev) => prev || list.data[0]!.id);
    } catch (err) {
      setError(messageForError(err, locale));
      setProviders([]);
    }
  }, [order.id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  // İptal/başarısız olmayan en yeni gönderi (operasyonun ana kaydı).
  const activeShipment = useMemo(
    () => shipments.find((s) => s.status !== "CANCELLED" && s.status !== "FAILED") ?? null,
    [shipments],
  );

  const selected = providers?.find((p) => p.id === providerConfigId) ?? null;

  const providerInfoFor = (s: ShipmentResponse) => {
    const cfg = providers?.find((p) => p.provider === s.provider) ?? null;
    return {
      displayName: cfg?.displayName ?? PROVIDER_TYPE_LABEL[s.provider] ?? s.provider,
      logoUrl: cfg?.logoUrl ?? null,
      logoAlt: cfg?.logoAlt ?? null,
    };
  };

  const onSubmit = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const pieces = [{ kg: Number(kg) || 1, desi: Number(desi) || 1 }];
    const recipient = {
      fullName: shippingAddress?.fullName ?? undefined,
      phone: shippingAddress?.phone ?? undefined,
      cityName: shippingAddress?.city ?? undefined,
      districtName: shippingAddress?.district ?? undefined,
      address: shippingAddress?.addressLine1 ?? undefined,
    };
    try {
      // Born-from-order: DHL prepare (createRecipient+createOrder); diğerleri generic createOrder.
      // UI generic kalır; sağlayıcıya özel akış arka planda kalır.
      if (selected.provider === "DHL_ECOMMERCE") {
        await storeApi.prepareDhlShipment(order.id, {
          providerConfigId: selected.id,
          recipient,
          pieces,
          explicitConfirm: true,
        });
      } else {
        await storeApi.createOrderShipment(order.id, {
          providerConfigId: selected.id,
          referenceId: order.orderNumber,
          recipient,
          pieces,
          explicitConfirm: false,
        });
      }
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(messageForError(err, locale));
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

  const statusLabel = SHIPMENT_STATUS_LABEL[locale];
  const eventLabel = SHIPMENT_EVENT_LABEL[locale];

  // Aktif gönderi varsa: ÖZET + "Kargo Detayına Git".
  if (activeShipment) {
    const info = providerInfoFor(activeShipment);
    const lastEvent = activeShipment.events.length > 0 ? activeShipment.events[activeShipment.events.length - 1] : null;
    return (
      <SurfaceCard title={t.title}>
        {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <span className="text-white/35">{t.provider}</span>
          <span className="flex items-center gap-2 text-white/70">
            <ProviderLogo logoUrl={info.logoUrl} displayName={info.displayName} logoAlt={info.logoAlt} size={20} />
            {info.displayName}
          </span>
          <span className="text-white/35">{t.status}</span>
          <span>
            <Badge tone={SHIPMENT_STATUS_TONE[activeShipment.status]}>{statusLabel[activeShipment.status]}</Badge>
          </span>
          {activeShipment.trackingNumber ? (
            <>
              <span className="text-white/35">{t.tracking}</span>
              <span className="font-mono text-white/70">{activeShipment.trackingNumber}</span>
            </>
          ) : null}
          {lastEvent ? (
            <>
              <span className="text-white/35">{t.lastEvent}</span>
              <span className="text-white/70">{lastEvent.statusText ?? eventLabel[lastEvent.eventType]}</span>
            </>
          ) : null}
          <span className="text-white/35">{t.lastUpdate}</span>
          <span className="text-white/55">{new Date(activeShipment.updatedAt).toLocaleString(locale)}</span>
        </div>
        <Link
          href={`/shipping/shipments/${activeShipment.id}`}
          className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-indigo-300 hover:text-indigo-200"
        >
          {t.goDetail} →
        </Link>
      </SurfaceCard>
    );
  }

  // Gönderi yoksa: "oluşturulmadı" + CTA (born-from-order).
  return (
    <SurfaceCard title={t.title}>
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      {!createOpen ? (
        <>
          <p className="text-sm text-white/40">{t.noShipment}</p>
          <Button className="mt-3" onClick={() => setCreateOpen(true)}>
            {t.create}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <Select
            label={t.provider}
            value={providerConfigId}
            onChange={(e) => setProviderConfigId(e.target.value)}
            options={providers.map((p) => ({
              value: p.id,
              label: `${p.displayName} · ${PROVIDER_TYPE_LABEL[p.provider] ?? p.provider} · ${p.status}`,
            }))}
          />
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
              </div>
            ) : (
              <p className="text-[12px] text-white/30">{t.noRecipient}</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input label={t.pieceCount} type="number" value={pieceCount} onChange={(e) => setPieceCount(e.target.value)} />
            <Input label={t.totalKg} type="number" value={kg} onChange={(e) => setKg(e.target.value)} />
            <Input label={t.totalDesi} type="number" value={desi} onChange={(e) => setDesi(e.target.value)} />
          </div>
          {selected && selected.status !== "ENABLED" ? (
            <Alert tone="warning">{t.providerNotActive}</Alert>
          ) : (
            <Alert tone="info">{t.liveOff}</Alert>
          )}
          <div className="flex gap-2">
            <Button onClick={onSubmit} disabled={busy || !selected || selected.status !== "ENABLED"}>
              {t.submit}
            </Button>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={busy}>
              {t.cancelCreate}
            </Button>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
}
