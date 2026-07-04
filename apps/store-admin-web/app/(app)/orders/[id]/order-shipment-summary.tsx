"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Input, Select } from "../../../../components/ui";
import { SurfaceCard } from "../../../components/premium";
import { ProviderLogo } from "../../../../components/provider-logo";
import type { Order, ShipmentResponse, ShippingProviderConfigResponse } from "@commerce-os/api-client";
import { isOrderPaidForShipment } from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { EditShippingAddress } from "./edit-shipping-address";
import {
  PROVIDER_TYPE_LABEL,
  SHIPMENT_EVENT_LABEL,
  SHIPMENT_STATUS_DESC,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_TONE,
  formatDateTime,
  isAwaitingPickupStatus,
  type Locale,
} from "../../../../lib/client/shipment-ui";

/**
 * F3C.5 (TODO-121 / TODO-126) — Sipariş detayı KARGO ÖZET kartı. Sen paketleyince:
 * BİRİNCİL akış "Gönderi Oluştur" = online sağlayıcı (createRecipient + createOrder).
 * Başarılı → shipment detayına yönlendirir (barkod/takip/sync orada). Sağlayıcı hatası
 * (401/409/network) kullanıcıya HAM patlamaz → "Geçici bir sağlayıcı hatası" + İKİNCİL
 * "Manuel Gönderi Hazırla" (provider'a İSTEK ATMAZ; yerel kayıt → manuel takip).
 * createOrder = gönderi KAYDIDIR; barkod ve fiziksel "kargoya verildi" ayrı adımlardır.
 */

const L = {
  tr: {
    title: "Kargo",
    empty: "Bu mağazada yapılandırılmış kargo sağlayıcı yok.",
    emptyHint: "Kargo Sağlayıcıları sayfasından bir sağlayıcı ekleyin.",
    noShipment: "Bu sipariş için henüz kargo kaydı oluşturulmadı.",
    create: "Gönderi Oluştur",
    cancelCreate: "Vazgeç",
    provider: "Sağlayıcı",
    totalKg: "Toplam kg",
    totalDesi: "Toplam desi",
    pieceCount: "Parça sayısı",
    recipient: "Alıcı (sipariş adresinden)",
    noRecipient: "Sipariş için kargo adresi yok.",
    submitOnline: "Gönderi Oluştur",
    submitting: "Oluşturuluyor…",
    status: "Durum",
    tracking: "Takip No",
    noTracking: "Henüz oluşmadı",
    lastEvent: "Son işlem",
    lastUpdate: "Son güncelleme",
    goDetail: "Kargo Detayına Git",
    providerNotActive: "Seçili sağlayıcı aktif değil; önce Kargo Sağlayıcıları sayfasından aktifleştirin.",
    providerError: "Geçici bir sağlayıcı hatası oluştu. Manuel gönderi ile devam edebilirsiniz.",
    manualPrepare: "Manuel Gönderi Hazırla",
    onlineHint: "Önce sağlayıcı üzerinden gönderi kaydı denenecek. Hata olursa manuel devam edebilirsiniz.",
    // TODO-136 — Ödeme alınmadan gönderi oluşturulamaz (backend guard'ı da vardır).
    paymentRequiredTitle: "Ödeme alınmadan gönderi oluşturulamaz.",
    paymentRequiredHint: "Gönderi oluşturmak için siparişin ödemesi tamamlanmalıdır.",
  },
  en: {
    title: "Shipping",
    empty: "No shipping provider is configured for this store.",
    emptyHint: "Add a provider from the Shipping Providers page.",
    noShipment: "No shipment record has been created for this order yet.",
    create: "Create shipment",
    cancelCreate: "Cancel",
    provider: "Provider",
    totalKg: "Total kg",
    totalDesi: "Total desi",
    pieceCount: "Piece count",
    recipient: "Recipient (from order address)",
    noRecipient: "No shipping address on the order.",
    submitOnline: "Create shipment",
    submitting: "Creating…",
    status: "Status",
    tracking: "Tracking No",
    noTracking: "Not created yet",
    lastEvent: "Last event",
    lastUpdate: "Last update",
    goDetail: "Go to shipment detail",
    providerNotActive: "Selected provider is not active; activate it from the Shipping Providers page first.",
    providerError: "A temporary provider error occurred. You can continue with a manual shipment.",
    manualPrepare: "Prepare manual shipment",
    onlineHint: "We first try a shipment record via the provider. If it fails, you can continue manually.",
    // TODO-136 — A shipment cannot be created until the order is paid (also enforced server-side).
    paymentRequiredTitle: "A shipment cannot be created until payment is received.",
    paymentRequiredHint: "The order's payment must be completed before creating a shipment.",
  },
} satisfies Record<Locale, Record<string, string>>;

export function OrderShipmentSummary({ order, locale }: { order: Order; locale: Locale }) {
  const t = L[locale] ?? L.tr;
  const router = useRouter();
  const [providers, setProviders] = useState<ShippingProviderConfigResponse[] | null>(null);
  const [shipments, setShipments] = useState<ShipmentResponse[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [providerConfigId, setProviderConfigId] = useState("");
  const [kg, setKg] = useState("1");
  const [desi, setDesi] = useState("1");
  const [pieceCount, setPieceCount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Online sağlayıcı hatası → manuel fallback CTA'sını açar (ham 401/409 gösterilmez).
  const [providerFailed, setProviderFailed] = useState(false);

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

  // TODO-136 — Ödemesi alınmamış sipariş kargoya VERİLEMEZ. UI "Gönderi Oluştur"u
  // pasifleştirir + yardımcı metin gösterir; backend guard ayrıca NİHAİ otoritedir.
  const paidForShipment = isOrderPaidForShipment(order.paymentStatus);

  const providerInfoFor = (s: ShipmentResponse) => {
    const cfg = providers?.find((p) => p.provider === s.provider) ?? null;
    return {
      displayName: cfg?.displayName ?? PROVIDER_TYPE_LABEL[s.provider] ?? s.provider,
      logoUrl: cfg?.logoUrl ?? null,
      logoAlt: cfg?.logoAlt ?? null,
    };
  };

  const buildPayload = () => {
    const pieces = Array.from({ length: Math.max(1, Number(pieceCount) || 1) }, () => ({
      kg: Number(kg) || 1,
      desi: Number(desi) || 1,
    }));
    const recipient = {
      fullName: shippingAddress?.fullName ?? undefined,
      phone: shippingAddress?.phone ?? undefined,
      cityName: shippingAddress?.city ?? undefined,
      districtName: shippingAddress?.district ?? undefined,
      address: shippingAddress?.addressLine1 ?? undefined,
    };
    return { pieces, recipient };
  };

  // Online BİRİNCİL akış: createRecipient + createOrder (sağlayıcı). Başarılı → detaya git.
  const onCreateOnline = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setProviderFailed(false);
    const { pieces, recipient } = buildPayload();
    try {
      if (selected.provider === "DHL_ECOMMERCE") {
        const res = await storeApi.prepareDhlShipment(order.id, {
          providerConfigId: selected.id,
          recipient,
          pieces,
          explicitConfirm: true,
        });
        router.push(`/shipping/shipments/${res.shipment.id}`);
        return;
      }
      // Generic createOrder shipment id döndürmez → kaydı yeniden çekip detaya yönlendir.
      await storeApi.createOrderShipment(order.id, {
        providerConfigId: selected.id,
        referenceId: order.orderNumber,
        recipient,
        pieces,
        explicitConfirm: true,
      });
      const ship = await storeApi.getOrderShipping(order.id);
      const created = ship.shipments.find((s) => s.status !== "CANCELLED" && s.status !== "FAILED");
      if (created) router.push(`/shipping/shipments/${created.id}`);
      else await load();
    } catch (err) {
      // TODO-132: alıcı e-posta eksik/geçersiz → aksiyon alınabilir SPESİFİK mesaj
      // (sağlayıcıya istek atılmadı; müşteri kaydına e-posta eklenince online akış çalışır).
      // TODO-124: il/ilçe CBS'te eşleşmedi → sağlayıcı ÇAĞRILMADI; adres il/ilçe
      // düzeltilmeden tekrar denemek anlamsız (bozuk MNG kaydı bu sayede oluşmaz).
      if (
        err instanceof UiError &&
        (err.code === "RECIPIENT_EMAIL_REQUIRED" ||
          err.code === "RECIPIENT_EMAIL_INVALID" ||
          err.code === "ADDRESS_DISTRICT_CODE_REQUIRED")
      ) {
        setProviderFailed(true); // manuel gönderi yine de mümkün
        setError(messageForError(err, locale));
        return;
      }
      // Ham sağlayıcı hatası (401/409/network) UI'a patlamaz → manuel fallback öner.
      setProviderFailed(true);
      setError(t.providerError);
    } finally {
      setBusy(false);
    }
  };

  // İKİNCİL/fallback: manuel gönderi (provider'a İSTEK ATMAZ) → detaya git → manuel takip.
  const onCreateManual = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const { pieces, recipient } = buildPayload();
    try {
      const res = await storeApi.createShipmentDraft(order.id, {
        providerConfigId: selected.id,
        recipient,
        pieces,
        explicitConfirm: false,
      });
      router.push(`/shipping/shipments/${res.shipment.id}`);
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
  const statusDesc = SHIPMENT_STATUS_DESC[locale];
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
            {/* TODO-127 — createOrder başarısı = "Gönderi oluşturuldu"; fiziksel kargoya
                verildi DEĞİL → hazırlık aşamasında "Kargonun alımı bekleniyor." ipucu. */}
            {isAwaitingPickupStatus(activeShipment.status) ? (
              <span className="mt-1 block text-[11px] text-white/40">{statusDesc[activeShipment.status]}</span>
            ) : null}
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
          <span className="text-white/55">{formatDateTime(activeShipment.updatedAt, locale)}</span>
        </div>
        <Link
          href={`/shipping/shipments/${activeShipment.id}`}
          className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-indigo-300 hover:text-indigo-200"
        >
          {t.goDetail} →
        </Link>
        {/* TODO-139 — Aktif gönderi güvenli durumdaysa teslimat adresi snapshot'ı düzenlenebilir;
            kargoya verilmişse editor kilit uyarısını gösterir. */}
        <EditShippingAddress
          order={order}
          activeShipment={activeShipment}
          providers={providers}
          locale={locale}
          onSaved={async () => {
            await load();
            router.refresh();
          }}
        />
      </SurfaceCard>
    );
  }

  // Gönderi yoksa: BİRİNCİL "Gönderi Oluştur" (online) + hata olursa manuel fallback.
  return (
    <SurfaceCard title={t.title}>
      {error ? <Alert tone={providerFailed ? "warning" : "error"} className="mb-3">{error}</Alert> : null}
      {!createOpen ? (
        <>
          <p className="text-sm text-white/40">{t.noShipment}</p>
          {/* TODO-136 — Ödeme alınmadan gönderi oluşturulamaz: buton pasif + açıklayıcı metin. */}
          {!paidForShipment ? (
            <Alert tone="warning" title={t.paymentRequiredTitle} className="mt-3">
              {t.paymentRequiredHint}
            </Alert>
          ) : null}
          <Button className="mt-3" onClick={() => setCreateOpen(true)} disabled={!paidForShipment}>
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
          ) : !providerFailed ? (
            <p className="text-[12px] text-white/35">{t.onlineHint}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {/* BİRİNCİL: online sağlayıcı akışı */}
            <Button onClick={onCreateOnline} disabled={busy || !selected || selected.status !== "ENABLED"}>
              {busy ? t.submitting : t.submitOnline}
            </Button>
            {/* İKİNCİL: yalnız sağlayıcı hatasından sonra görünür (manuel, provider'a gitmez) */}
            {providerFailed ? (
              <Button variant="secondary" onClick={onCreateManual} disabled={busy || !selected}>
                {t.manualPrepare}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => { setCreateOpen(false); setProviderFailed(false); setError(null); }} disabled={busy}>
              {t.cancelCreate}
            </Button>
          </div>
        </div>
      )}
      {/* TODO-139 — Gönderi henüz yokken de teslimat adresi snapshot'ı düzeltilebilir (yalnız OrderAddress). */}
      <EditShippingAddress
        order={order}
        activeShipment={null}
        providers={providers}
        locale={locale}
        onSaved={async () => {
          await load();
          router.refresh();
        }}
      />
    </SurfaceCard>
  );
}
