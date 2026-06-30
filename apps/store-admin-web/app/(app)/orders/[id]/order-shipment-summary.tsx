"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Badge } from "../../../../components/ui";
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
 * F3C.5 (TODO-121) — Sipariş detayı KARGO ÖZET kartı. Order = ticari işlem; burada YALNIZ
 * okuma-amaçlı özet + güvenli yönlendirme bulunur. Bu kart dış sağlayıcıya İSTEK ATMAZ
 * (createOrder/createbarcode/cancel YOK). Asıl operasyon (hazırlık/barkod/sync/iptal) ve
 * manuel takip /shipping/shipments/[id] ekranında, açık guard/capability mesajlarıyla yapılır.
 * Non-destructive shipment draft akışı ayrı borç olarak izlenir (TODO-126).
 */

const L = {
  tr: {
    title: "Kargo",
    empty: "Bu mağazada yapılandırılmış kargo sağlayıcı yok.",
    emptyHint: "Kargo Sağlayıcıları sayfasından bir sağlayıcı ekleyin.",
    noShipment: "Bu sipariş için henüz kargo kaydı oluşturulmadı.",
    provider: "Sağlayıcı",
    recipient: "Alıcı (sipariş adresinden)",
    noRecipient: "Sipariş için kargo adresi yok.",
    status: "Durum",
    tracking: "Takip No",
    noTracking: "Henüz oluşmadı",
    lastEvent: "Son işlem",
    lastUpdate: "Son güncelleme",
    goDetail: "Kargo Detayına Git",
    openShipments: "Kargo Gönderileri ekranını aç",
    lockedNote:
      "Sağlayıcı operasyonu güvenlik kilidiyle kapalı. Gönderi kaydı, barkod ve takip işlemleri Kargo Gönderileri ekranından yürütülür. Bu güvenlik kilidi canlı/test ayrımından bağımsızdır; dış sağlayıcıya istek atmayı engeller.",
  },
  en: {
    title: "Shipping",
    empty: "No shipping provider is configured for this store.",
    emptyHint: "Add a provider from the Shipping Providers page.",
    noShipment: "No shipment record has been created for this order yet.",
    provider: "Provider",
    recipient: "Recipient (from order address)",
    noRecipient: "No shipping address on the order.",
    status: "Status",
    tracking: "Tracking No",
    noTracking: "Not created yet",
    lastEvent: "Last event",
    lastUpdate: "Last update",
    goDetail: "Go to shipment detail",
    openShipments: "Open the Shipments screen",
    lockedNote:
      "Provider operation is closed by a security lock. Shipment record, label and tracking operations run from the Shipments screen. This security lock is independent of the live/test distinction; it blocks outbound provider calls.",
  },
} satisfies Record<Locale, Record<string, string>>;

export function OrderShipmentSummary({ order, locale }: { order: Order; locale: Locale }) {
  const t = L[locale] ?? L.tr;
  const [providers, setProviders] = useState<ShippingProviderConfigResponse[] | null>(null);
  const [shipments, setShipments] = useState<ShipmentResponse[]>([]);
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

  const providerInfoFor = (s: ShipmentResponse) => {
    const cfg = providers?.find((p) => p.provider === s.provider) ?? null;
    return {
      displayName: cfg?.displayName ?? PROVIDER_TYPE_LABEL[s.provider] ?? s.provider,
      logoUrl: cfg?.logoUrl ?? null,
      logoAlt: cfg?.logoAlt ?? null,
    };
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

  // Aktif gönderi varsa: ÖZET + "Kargo Detayına Git" (operasyon detay sayfasında).
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
          <span className="text-white/35">{t.tracking}</span>
          {activeShipment.trackingNumber ? (
            <span className="font-mono text-white/70">{activeShipment.trackingNumber}</span>
          ) : (
            <span className="text-white/30">{t.noTracking}</span>
          )}
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

  // Gönderi yoksa: SADECE güvenli hazırlık/özet. Dış sağlayıcıya istek ATAN buton YOK
  // (TODO-126 non-destructive draft akışına kadar createOrder/createbarcode burada tetiklenmez).
  return (
    <SurfaceCard title={t.title}>
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <p className="text-sm text-white/40">{t.noShipment}</p>
      <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
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
      <Alert tone="info" className="mt-3">{t.lockedNote}</Alert>
      <Link
        href="/shipping/shipments"
        className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-indigo-300 hover:text-indigo-200"
      >
        {t.openShipments} →
      </Link>
    </SurfaceCard>
  );
}
