"use client";

import { useCallback, useMemo, useState } from "react";
import { Alert, Badge, Button, Input, Select } from "../../../../components/ui";
import type {
  Order,
  ShipmentResponse,
  ShippingCbsCity,
  ShippingCbsDistrict,
  ShippingProviderConfigResponse,
} from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import type { Locale } from "../../../../lib/client/shipment-ui";

/**
 * TODO-139 — Sipariş teslimat adresi SNAPSHOT düzenleme paneli.
 *
 * Bu, MÜŞTERİ adres defterini DEĞİL, yalnız BU siparişin teslimat adresini (OrderAddress
 * SHIPPING + varsa güvenli durumdaki Shipment alıcı snapshot'ı) günceller. Gönderi kargoya
 * verilmiş/teslim aşamasındaysa (LABEL_CREATED+/IN_TRANSIT/…) düzenleme KİLİTLİDİR; UI net
 * uyarı gösterir, backend guard NİHAİ otoritedir. Provider context (DHL) varsa il/ilçe
 * CBS-destekli dropdown'lardan seçilir; kodlar sunucuda CBS'e karşı YENİDEN doğrulanır.
 */

// Gönderi HANGİ durumlarda adres düzenlenebilir (backend ADDRESS_EDITABLE_SHIPMENT_STATUSES ile birebir).
const EDITABLE_SHIPMENT_STATUSES = new Set(["DRAFT", "ORDER_CREATED", "LABEL_PENDING"]);

const L = {
  tr: {
    edit: "Teslimat Adresini Düzenle",
    scopeWarning: "Bu değişiklik müşteri adres defterini değil, yalnızca bu siparişin teslimat adresini günceller.",
    locked: "Kargoya verilmiş siparişlerde adres değiştirilemez.",
    name: "Alıcı adı",
    phone: "Telefon",
    addressLine1: "Adres",
    addressLine2: "Adres (devam)",
    postalCode: "Posta kodu",
    city: "İl",
    district: "İlçe",
    citySelect: "İl seçin",
    districtSelect: "İlçe seçin",
    cityCode: "Kargo il kodu",
    districtCode: "Kargo ilçe kodu",
    matched: "CBS eşleşmesi bulundu",
    notMatched: "Eşleşme bulunamadı",
    noCode: "Kod yok",
    save: "Kaydet",
    saving: "Kaydediliyor…",
    cancel: "Vazgeç",
    savedResent: "Adres güncellendi, barkod tekrar denenebilir.",
    saved: "Adres güncellendi.",
    providerLimitation:
      "Kargo firması üzerindeki kayıt güncellenemedi. Barkod tekrar hata verirse yeni gönderi oluşturmak gerekebilir.",
    loadingCbs: "CBS listesi yükleniyor…",
  },
  en: {
    edit: "Edit delivery address",
    scopeWarning: "This change updates only this order's delivery address.",
    locked: "Address cannot be changed after handoff to carrier.",
    name: "Recipient name",
    phone: "Phone",
    addressLine1: "Address",
    addressLine2: "Address (cont.)",
    postalCode: "Postal code",
    city: "City",
    district: "District",
    citySelect: "Select city",
    districtSelect: "Select district",
    cityCode: "Carrier city code",
    districtCode: "Carrier district code",
    matched: "CBS match found",
    notMatched: "No match found",
    noCode: "No code",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    savedResent: "Address updated; barcode can be retried.",
    saved: "Address updated.",
    providerLimitation:
      "Carrier record could not be updated; a new shipment may be required if the barcode fails again.",
    loadingCbs: "Loading CBS list…",
  },
} satisfies Record<Locale, Record<string, string>>;

export function EditShippingAddress({
  order,
  activeShipment,
  providers,
  locale,
  onSaved,
}: {
  order: Order;
  activeShipment: ShipmentResponse | null;
  providers: ShippingProviderConfigResponse[];
  locale: Locale;
  onSaved: () => void | Promise<void>;
}) {
  const t = L[locale] ?? L.tr;

  const shippingAddress = useMemo(
    () => order.addresses.find((a) => a.type === "SHIPPING") ?? null,
    [order.addresses],
  );

  // Gönderi kilidi: aktif gönderi var ve durumu düzenlenebilir değilse adres değişmez.
  const locked = activeShipment != null && !EDITABLE_SHIPMENT_STATUSES.has(activeShipment.status);

  // CBS dropdown'ları için DHL provider config'i: gönderi varsa onun sağlayıcısı, yoksa ilk DHL.
  const dhlConfigId = useMemo(() => {
    if (activeShipment) {
      const match = providers.find((p) => p.provider === activeShipment.provider);
      return match?.provider === "DHL_ECOMMERCE" ? match.id : null;
    }
    return providers.find((p) => p.provider === "DHL_ECOMMERCE")?.id ?? null;
  }, [activeShipment, providers]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(shippingAddress?.fullName ?? "");
  const [phone, setPhone] = useState(shippingAddress?.phone ?? "");
  const [line1, setLine1] = useState(shippingAddress?.addressLine1 ?? "");
  const [line2, setLine2] = useState(shippingAddress?.addressLine2 ?? "");
  const [postal, setPostal] = useState(shippingAddress?.postalCode ?? "");
  // CBS yoksa serbest metin; CBS varsa cityName/districtName seçilen etiketten türetilir.
  const [cityText, setCityText] = useState(shippingAddress?.city ?? "");
  const [districtText, setDistrictText] = useState(shippingAddress?.district ?? "");
  const [cityCode, setCityCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [cities, setCities] = useState<ShippingCbsCity[] | null>(null);
  const [districts, setDistricts] = useState<ShippingCbsDistrict[] | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [limitation, setLimitation] = useState(false);

  const loadDistricts = useCallback(
    async (code: string) => {
      if (!dhlConfigId || !code) {
        setDistricts(null);
        return;
      }
      const res = await storeApi.getCbsDistricts(dhlConfigId, Number(code));
      setDistricts(res.districts);
    },
    [dhlConfigId],
  );

  const openPanel = async () => {
    setOpen(true);
    setError(null);
    setNotice(null);
    setLimitation(false);
    if (dhlConfigId && !cities) {
      setBusy(true);
      try {
        const res = await storeApi.getCbsCities(dhlConfigId);
        setCities(res.cities);
      } catch (err) {
        setError(messageForError(err, locale));
      } finally {
        setBusy(false);
      }
    }
  };

  const onCityChange = async (code: string) => {
    setCityCode(code);
    setDistrictCode("");
    setDistricts(null);
    const selected = cities?.find((c) => c.code === code) ?? null;
    setCityText(selected?.name ?? "");
    setDistrictText("");
    if (!code) return;
    setBusy(true);
    try {
      await loadDistricts(code);
    } catch (err) {
      setError(messageForError(err, locale));
    } finally {
      setBusy(false);
    }
  };

  const onDistrictChange = (code: string) => {
    setDistrictCode(code);
    const selected = districts?.find((d) => d.code === code) ?? null;
    setDistrictText(selected?.name ?? "");
  };

  const cbsMatched = dhlConfigId != null && cityCode !== "" && districtCode !== "";

  const onSave = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setLimitation(false);
    try {
      const res = await storeApi.updateOrderShippingAddress(order.id, {
        recipientName: name.trim(),
        recipientPhone: phone.trim() ? phone.trim() : null,
        cityName: cityText.trim(),
        districtName: districtText.trim() ? districtText.trim() : null,
        addressLine1: line1.trim(),
        addressLine2: line2.trim() ? line2.trim() : null,
        postalCode: postal.trim() ? postal.trim() : null,
        // Yalnız CBS dropdown'undan seçilen geçerli kodları gönder (sunucu yine doğrular).
        cityCode: dhlConfigId && cityCode ? Number(cityCode) : undefined,
        districtCode: dhlConfigId && districtCode ? Number(districtCode) : undefined,
        explicitConfirm: true,
      });
      // Sağlayıcı kaydı güncellenemediyse (providerResent=false) sınırlama kopyası gösterilir.
      if (res.shipment && res.providerRepairSupported && !res.providerResent) {
        setLimitation(true);
        setNotice(res.cbsMatched ? t.savedResent : t.saved);
      } else {
        setNotice(res.providerResent ? t.savedResent : t.saved);
      }
      setOpen(false);
      await onSaved();
    } catch (err) {
      if (err instanceof UiError) {
        setError(messageForError(err, locale));
      } else {
        setError(messageForError(err, locale));
      }
    } finally {
      setBusy(false);
    }
  };

  // Kilitli: net uyarı; düzenleme aksiyonu görünmez.
  if (locked) {
    return (
      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <Alert tone="warning">{t.locked}</Alert>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3">
      {notice ? (
        <Alert tone="success" className="mb-3">
          {notice}
          {limitation ? <span className="mt-1 block text-[11px] opacity-80">{t.providerLimitation}</span> : null}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      ) : null}

      {!open ? (
        <Button variant="secondary" size="sm" onClick={() => void openPanel()} disabled={busy}>
          {t.edit}
        </Button>
      ) : (
        <div className="space-y-3">
          <Alert tone="info">{t.scopeWarning}</Alert>
          <div className="grid grid-cols-2 gap-2">
            <Input label={t.name} value={name} onChange={(e) => setName(e.target.value)} />
            <Input label={t.phone} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Input label={t.addressLine1} value={line1} onChange={(e) => setLine1(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input label={t.addressLine2} value={line2} onChange={(e) => setLine2(e.target.value)} />
            <Input label={t.postalCode} value={postal} onChange={(e) => setPostal(e.target.value)} />
          </div>

          {dhlConfigId ? (
            busy && !cities ? (
              <p className="text-[12px] text-white/35">{t.loadingCbs}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    label={t.city}
                    value={cityCode}
                    onChange={(e) => void onCityChange(e.target.value)}
                    options={[
                      { value: "", label: t.citySelect },
                      ...(cities ?? []).map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })),
                    ]}
                  />
                  <Select
                    label={t.district}
                    value={districtCode}
                    onChange={(e) => onDistrictChange(e.target.value)}
                    options={[
                      { value: "", label: t.districtSelect },
                      ...(districts ?? []).map((d) => ({ value: d.code, label: `${d.name} (${d.code})` })),
                    ]}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {cbsMatched ? (
                    <Badge tone="success">{t.matched}</Badge>
                  ) : (
                    <Badge tone="warning">{t.notMatched}</Badge>
                  )}
                  <span className="text-[11px] text-white/35">
                    {t.cityCode}: <span className="font-mono">{cityCode || t.noCode}</span> · {t.districtCode}:{" "}
                    <span className="font-mono">{districtCode || t.noCode}</span>
                  </span>
                </div>
              </>
            )
          ) : (
            // Provider context yoksa (DHL değil): serbest il/ilçe metni; kargo kodu yazılmaz.
            <div className="grid grid-cols-2 gap-2">
              <Input label={t.city} value={cityText} onChange={(e) => setCityText(e.target.value)} />
              <Input label={t.district} value={districtText} onChange={(e) => setDistrictText(e.target.value)} />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void onSave()}
              disabled={busy || !name.trim() || !line1.trim() || !cityText.trim()}
            >
              {busy ? t.saving : t.save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
