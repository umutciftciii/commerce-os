"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Select } from "../../../../../components/ui";
import { SurfaceCard } from "../../../../components/premium";
import type { ShipmentDetail, ShippingCbsCity, ShippingCbsDistrict } from "@commerce-os/api-client";
import { storeApi } from "../../../../../lib/client/api";
import { messageForError } from "../../../../../lib/client/messages";
import type { Locale } from "../../../../../lib/client/shipment-ui";

/**
 * TODO-124 — Varış il/ilçe eşlemesi kartı + onarım paneli.
 *
 * Kullanım: MNG barkodu 20001 "VARIŞ ŞUBESİ BULUNAMADI" ile düştüğünde
 * (lastBarcodeErrorCode=DESTINATION_BRANCH_NOT_FOUND) admin CBS listelerinden
 * doğru il/ilçeyi seçer; kayıt Shipment SNAPSHOT'ına yazılır ve alıcı kaydı
 * sağlayıcıya yeniden iletilmeye çalışılır. providerResent=false ise sınırlama
 * açıkça gösterilir (sahte başarı yok); barkod mevcut "Barkod/Etiket Oluştur"
 * aksiyonuyla yeniden denenir.
 */

const L = {
  tr: {
    title: "Varış İl/İlçe Eşlemesi",
    city: "İl",
    district: "İlçe",
    cityCode: "Kargo İl Kodu",
    districtCode: "Kargo İlçe Kodu",
    address: "Adres",
    noCode: "Kod yok",
    matched: "Eşleşme bulundu",
    notMatched: "Eşleşme bulunamadı",
    destinationFailed:
      "Varış şubesi bulunamadı. Alıcı il/ilçe bilgisi kargo firmasında eşleşmedi. Adres il/ilçe bilgisini düzeltin.",
    repair: "Adres İl/İlçe Eşlemesini Düzelt",
    autoMatch: "CBS’den Eşleştir",
    citySelect: "İl seçin",
    districtSelect: "İlçe seçin",
    save: "Kaydet ve Sağlayıcıya İlet",
    cancel: "Vazgeç",
    loading: "CBS listesi yükleniyor…",
    saving: "Kaydediliyor…",
    savedResent: "Eşleme düzeltildi ve alıcı kaydı sağlayıcıya yeniden iletildi. Barkodu tekrar deneyebilirsiniz.",
    savedNotResent:
      "Eşleme düzeltildi ancak sağlayıcıya yeniden iletilemedi. Barkod denemesi düzeltilmiş kodlarla yapılacak.",
    limitation: "Bu düzeltme mevcut kargo kaydını otomatik güncellemeyebilir.",
    retryHint: "Düzeltmeden sonra “Barkod/Etiket Oluştur” ile tekrar deneyin.",
    noProviderConfig: "Sağlayıcı yapılandırması bulunamadı; eşleme düzeltilemez.",
  },
  en: {
    title: "Destination City/District Mapping",
    city: "City",
    district: "District",
    cityCode: "Carrier city code",
    districtCode: "Carrier district code",
    address: "Address",
    noCode: "No code",
    matched: "Match found",
    notMatched: "No match found",
    destinationFailed:
      "Destination branch could not be resolved. Recipient city/district could not be matched by the carrier. Update address city/district.",
    repair: "Fix address city/district mapping",
    autoMatch: "Match from CBS",
    citySelect: "Select city",
    districtSelect: "Select district",
    save: "Save and resend to carrier",
    cancel: "Cancel",
    loading: "Loading CBS list…",
    saving: "Saving…",
    savedResent: "Mapping repaired and recipient record resent to the carrier. You can retry the label now.",
    savedNotResent:
      "Mapping repaired but could not be resent to the carrier. The label retry will use the corrected codes.",
    limitation: "This correction may not automatically update the existing carrier record.",
    retryHint: "After the correction, retry with “Create label”.",
    noProviderConfig: "Provider configuration not found; mapping cannot be repaired.",
  },
} satisfies Record<Locale, Record<string, string>>;

/** CBS ad eşlemesi için TR-güvenli hafif normalize (backend exact-match ile uyumlu). */
function normalizeTr(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (ch) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[ch] ?? ch);
}

export function ShipmentDestinationCard({
  shipment,
  locale,
  onRepaired,
}: {
  shipment: ShipmentDetail;
  locale: Locale;
  onRepaired: () => void | Promise<void>;
}) {
  const t = L[locale] ?? L.tr;
  const providerConfigId = shipment.providerInfo.configId;
  const canRepair = shipment.actions.canRepairDestination;
  const destinationFailed = shipment.lastBarcodeErrorCode === "DESTINATION_BRANCH_NOT_FOUND";

  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState<ShippingCbsCity[] | null>(null);
  const [districts, setDistricts] = useState<ShippingCbsDistrict[] | null>(null);
  const [cityCode, setCityCode] = useState<string>("");
  const [districtCode, setDistrictCode] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autoMatchState, setAutoMatchState] = useState<"matched" | "notMatched" | null>(null);

  const hasCodes =
    typeof shipment.recipientCityCode === "number" &&
    shipment.recipientCityCode > 0 &&
    typeof shipment.recipientDistrictCode === "number" &&
    shipment.recipientDistrictCode > 0;

  const loadDistricts = useCallback(
    async (code: string) => {
      if (!providerConfigId || !code) {
        setDistricts(null);
        return null;
      }
      const res = await storeApi.getCbsDistricts(providerConfigId, Number(code));
      setDistricts(res.districts);
      return res.districts;
    },
    [providerConfigId],
  );

  /** Mevcut snapshot il/ilçe adını CBS listelerinde arayıp seçimleri doldurur. */
  const autoMatch = useCallback(
    async (cityList: ShippingCbsCity[]) => {
      const cityKey = normalizeTr(shipment.recipientCityName);
      const city = cityKey ? cityList.find((c) => normalizeTr(c.name) === cityKey) ?? null : null;
      if (!city) {
        setAutoMatchState("notMatched");
        return;
      }
      setCityCode(city.code);
      const districtList = await loadDistricts(city.code);
      const districtKey = normalizeTr(shipment.recipientDistrictName);
      const district =
        districtKey && districtList
          ? districtList.find((d) => normalizeTr(d.name) === districtKey) ?? null
          : null;
      if (district) {
        setDistrictCode(district.code);
        setAutoMatchState("matched");
      } else {
        setDistrictCode("");
        setAutoMatchState("notMatched");
      }
    },
    [shipment.recipientCityName, shipment.recipientDistrictName, loadDistricts],
  );

  const openPanel = async () => {
    if (!providerConfigId) {
      setError(t.noProviderConfig);
      return;
    }
    setOpen(true);
    setError(null);
    setNotice(null);
    if (cities) return;
    setBusy(true);
    try {
      const res = await storeApi.getCbsCities(providerConfigId);
      setCities(res.cities);
      await autoMatch(res.cities);
    } catch (err) {
      setError(messageForError(err, locale));
    } finally {
      setBusy(false);
    }
  };

  const onCityChange = async (code: string) => {
    setCityCode(code);
    setDistrictCode("");
    setAutoMatchState(null);
    setError(null);
    if (!code) {
      setDistricts(null);
      return;
    }
    setBusy(true);
    try {
      await loadDistricts(code);
    } catch (err) {
      setError(messageForError(err, locale));
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!cityCode || !districtCode) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await storeApi.repairShipmentDestination(shipment.id, {
        cityCode: Number(cityCode),
        districtCode: Number(districtCode),
        explicitConfirm: true,
      });
      setNotice(res.providerResent ? t.savedResent : t.savedNotResent);
      setOpen(false);
      await onRepaired();
    } catch (err) {
      setError(messageForError(err, locale));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    // Gönderi yeniden yüklendiğinde (onarım/aksiyon sonrası) seçim durumunu koru;
    // yalnız kapalıyken eski hata/nota takılı kalmasın.
    if (!open) setError(null);
  }, [open, shipment.updatedAt]);

  const mappingBadge = useMemo(
    () =>
      hasCodes ? (
        <Badge tone="success">{t.matched}</Badge>
      ) : (
        <Badge tone={destinationFailed ? "danger" : "warning"}>{t.notMatched}</Badge>
      ),
    [hasCodes, destinationFailed, t],
  );

  return (
    <SurfaceCard title={t.title}>
      {destinationFailed ? (
        <Alert tone="warning" className="mb-3">
          {t.destinationFailed}
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="success" className="mb-3">
          {notice}
          <span className="mt-1 block text-[11px] opacity-80">{t.retryHint}</span>
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <span className="text-white/35">{t.city}</span>
        <span className="text-white/70">{shipment.recipientCityName ?? "—"}</span>
        <span className="text-white/35">{t.district}</span>
        <span className="text-white/70">{shipment.recipientDistrictName ?? "—"}</span>
        <span className="text-white/35">{t.cityCode}</span>
        <span className="font-mono text-white/70">
          {shipment.recipientCityCode && shipment.recipientCityCode > 0 ? shipment.recipientCityCode : t.noCode}
        </span>
        <span className="text-white/35">{t.districtCode}</span>
        <span className="font-mono text-white/70">
          {shipment.recipientDistrictCode && shipment.recipientDistrictCode > 0
            ? shipment.recipientDistrictCode
            : t.noCode}
        </span>
        {shipment.recipientAddress ? (
          <>
            <span className="text-white/35">{t.address}</span>
            <span className="text-white/55">{shipment.recipientAddress}</span>
          </>
        ) : null}
        <span className="text-white/35">CBS</span>
        <span>{mappingBadge}</span>
      </div>

      {!open ? (
        <Button className="mt-4" variant="secondary" onClick={() => void openPanel()} disabled={busy || !canRepair}>
          {t.repair}
        </Button>
      ) : (
        <div className="mt-4 space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          {busy && !cities ? <p className="text-[12px] text-white/35">{t.loading}</p> : null}
          {cities ? (
            <>
              <Select
                label={t.city}
                value={cityCode}
                onChange={(e) => void onCityChange(e.target.value)}
                options={[
                  { value: "", label: t.citySelect },
                  ...cities.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })),
                ]}
              />
              <Select
                label={t.district}
                value={districtCode}
                onChange={(e) => {
                  setDistrictCode(e.target.value);
                  setAutoMatchState(null);
                }}
                options={[
                  { value: "", label: t.districtSelect },
                  ...(districts ?? []).map((d) => ({ value: d.code, label: `${d.name} (${d.code})` })),
                ]}
              />
              {autoMatchState ? (
                <p className={`text-[11px] ${autoMatchState === "matched" ? "text-emerald-300/80" : "text-amber-300/80"}`}>
                  {autoMatchState === "matched" ? t.matched : t.notMatched}
                </p>
              ) : null}
              <p className="text-[11px] text-white/35">{t.limitation}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => cities && void autoMatch(cities)} disabled={busy}>
                  {t.autoMatch}
                </Button>
                <Button size="sm" onClick={() => void onSave()} disabled={busy || !cityCode || !districtCode}>
                  {busy ? t.saving : t.save}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                  {t.cancel}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </SurfaceCard>
  );
}
