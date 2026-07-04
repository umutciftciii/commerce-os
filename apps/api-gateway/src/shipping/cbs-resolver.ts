import { ShippingConfigError } from "./errors.js";
import type {
  ShipmentRecipientInput,
  ShippingActionContext,
  ShippingGeoCity,
  ShippingGeoDistrict,
  ShippingProviderAdapter,
} from "./types.js";

/**
 * TODO-124 — CBS il/ilce kod cozumleyici (DHL/MNG varis subesi eslemesi).
 *
 * MNG, cityCode/districtCode gonderilmezse varis subesini districtName + adres
 * metninden tahmin etmeye calisir; tutarsiz/muglak adreslerde createOrder KABUL
 * edilir ama createbarcode 500 kod 20001 "VARIŞ ŞUBESİ BULUNAMADI" ile patlar
 * (OS-000053 vakasi). Bu modul saglayici cagrisindan ONCE CBS Info verisinden
 * kodlari cozer.
 *
 * Kurallar:
 *  - YALNIZ exact match (TR-guvenli normalize sonrasi). Fuzzy/benzerlik YOK —
 *    yanlis ilceye sessiz esleme, hic eslememekten KOTUdur.
 *  - Gecerli (>0) sakli kod varsa CBS'e sorulmadan aynen korunur (OS-000050 yolu).
 *  - 0/negatif/eksik kod ASLA gonderilmez (TODO-132 davranisi korunur).
 *  - CBS verisi konfig basina TTL cache'lenir; saglayici asiri CAGRILMAZ.
 *  - CBS'in kendisi erisilemezse (HTTP kapali/credential eksik/saglayici hatasi)
 *    cozumleme BLOKLAMAZ: CBS_UNAVAILABLE doner, cagiran isim-bazli eski
 *    davranisla devam edebilir (OS-000041/43 regresyonu korunur).
 */

/* ───────────────────────── TR-guvenli normalize ───────────────────────── */

const TR_FOLD_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/**
 * Sehir/ilce adini karsilastirma icin normalize eder:
 *  - trim + ardisik bosluklari tekle,
 *  - TR-duyarli kucuk harf ("ISTANBUL" → "ıstanbul", "İstanbul" → "istanbul"),
 *  - TR diakritik katlama (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u, â/î/û),
 *  - kalan kombinasyon isaretlerini (NFD) at.
 * "Üsküdar"/"uskudar"/"USKUDAR" ve "Küçükçekmece"/"kucukcekmece" ayni anahtara duser.
 */
export function normalizeGeoName(raw: string | null | undefined): string {
  const collapsed = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!collapsed) return "";
  const lowered = collapsed.toLocaleLowerCase("tr-TR");
  const folded = lowered.replace(/[çğıöşüâîû]/g, (ch) => TR_FOLD_MAP[ch] ?? ch);
  // Kalan aksanli karakterler (yabanci girisler) icin genel diakritik temizligi.
  return folded.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Kod gecerli mi: pozitif tamsayi. 0/negatif/NaN gecersizdir (0 ASLA gonderilmez). */
export function isValidGeoCode(code: number | null | undefined): code is number {
  return typeof code === "number" && Number.isInteger(code) && code > 0;
}

/* ───────────────────────── Cozumleme sonucu ───────────────────────── */

export type CbsResolutionStatus =
  /** Gecerli sakli kodlar korundu; CBS cagrisi yapilmadi. */
  | "ALREADY_CODED"
  /** CBS'ten exact match ile il+ilce kodu cozuldu. */
  | "MATCHED"
  /** Il adi CBS il listesinde eslesmedi. */
  | "CITY_NOT_MATCHED"
  /** Il eslesti ama ilce adi CBS ilce listesinde eslesmedi (veya muglak). */
  | "DISTRICT_NOT_MATCHED"
  /** Il/ilce metni eksik — cozumleme denenemedi (eski isim-bazli davranis). */
  | "INPUT_MISSING"
  /** CBS verisine ulasilamadi (HTTP kapali/credential eksik/saglayici hatasi). */
  | "CBS_UNAVAILABLE";

export interface CbsResolution {
  status: CbsResolutionStatus;
  cityCode: number | null;
  districtCode: number | null;
  /** Eslesme durumunda CBS'in KANONIK adi (snapshot'a yazilabilir). */
  cityName: string | null;
  districtName: string | null;
  /** CBS_UNAVAILABLE ise altta yatan sanitize ShippingConfigError kodu. */
  errorCode: string | null;
}

export interface CbsLookupTarget {
  /** Cache anahtari — providerConfig.id (mode/credential degisimi config'e baglidir). */
  cacheKey: string;
  adapter: ShippingProviderAdapter;
  context: ShippingActionContext;
}

export interface CbsLookupService {
  getCities(target: CbsLookupTarget): Promise<ShippingGeoCity[]>;
  getDistricts(target: CbsLookupTarget, cityCode: string): Promise<ShippingGeoDistrict[]>;
  /** Alici il/ilce metnini CBS kodlarina cozer (kurallar icin modul yorumuna bak). */
  resolveRecipientGeo(target: CbsLookupTarget, recipient: ShipmentRecipientInput): Promise<CbsResolution>;
  /**
   * Onarim akisi: admin'in sectigi kodlarin CBS'te GERCEKTEN var oldugunu dogrular ve
   * kanonik adlari dondurur. Bulunamazsa CBS_CODE_INVALID firlatir; CBS erisim hatasi
   * oldugu gibi yayilir (onarim, dogrulanamayan kodla KAYDEDILMEZ).
   */
  validateCodes(
    target: CbsLookupTarget,
    cityCode: number,
    districtCode: number,
  ): Promise<{ cityName: string; districtName: string }>;
}

interface CacheEntry<T> {
  expiresAtMs: number;
  value: T;
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 saat — CBS il/ilce listesi cok nadir degisir.

export function createCbsLookupService(options?: {
  ttlMs?: number;
  now?: () => number;
}): CbsLookupService {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const now = options?.now ?? Date.now;
  const cityCache = new Map<string, CacheEntry<ShippingGeoCity[]>>();
  const districtCache = new Map<string, CacheEntry<ShippingGeoDistrict[]>>();

  function fromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs <= now()) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  async function getCities(target: CbsLookupTarget): Promise<ShippingGeoCity[]> {
    const cached = fromCache(cityCache, target.cacheKey);
    if (cached) return cached;
    const result = await target.adapter.listGeoCities({ context: target.context });
    const cities = result.cities ?? [];
    // Bos liste cache'lenmez: gecici saglayici bosalmasi kalici "eslesmedi"ye donmesin.
    if (cities.length > 0) {
      cityCache.set(target.cacheKey, { expiresAtMs: now() + ttlMs, value: cities });
    }
    return cities;
  }

  async function getDistricts(target: CbsLookupTarget, cityCode: string): Promise<ShippingGeoDistrict[]> {
    const key = `${target.cacheKey}:${cityCode}`;
    const cached = fromCache(districtCache, key);
    if (cached) return cached;
    const result = await target.adapter.listGeoDistricts({ context: target.context, cityCode });
    const districts = result.districts ?? [];
    if (districts.length > 0) {
      districtCache.set(key, { expiresAtMs: now() + ttlMs, value: districts });
    }
    return districts;
  }

  /** Normalize edilmis ada gore TEK ve kesin eslesme; muglaklikta (farkli kodlu ciftler) null. */
  function exactMatch<T extends { code: string; name: string }>(items: T[], rawName: string): T | null {
    const key = normalizeGeoName(rawName);
    if (!key) return null;
    const matches = items.filter((item) => normalizeGeoName(item.name) === key);
    if (matches.length === 0) return null;
    const uniqueCodes = new Set(matches.map((m) => m.code));
    return uniqueCodes.size === 1 ? matches[0]! : null;
  }

  function toCode(raw: string): number | null {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  async function resolveRecipientGeo(
    target: CbsLookupTarget,
    recipient: ShipmentRecipientInput,
  ): Promise<CbsResolution> {
    const storedCity = isValidGeoCode(recipient.cityCode) ? recipient.cityCode : null;
    const storedDistrict = isValidGeoCode(recipient.districtCode) ? recipient.districtCode : null;
    // 1) Gecerli sakli kod cifti → CBS'e sorulmadan korunur (OS-000050 yolu).
    if (storedCity != null && storedDistrict != null) {
      return {
        status: "ALREADY_CODED",
        cityCode: storedCity,
        districtCode: storedDistrict,
        cityName: recipient.cityName ?? null,
        districtName: recipient.districtName ?? null,
        errorCode: null,
      };
    }

    const cityText = (recipient.cityName ?? "").trim();
    const districtText = (recipient.districtName ?? "").trim();
    // 2) Metin eksikse cozumleme DENENEMEZ; eski isim-bazli davranisa birak.
    if ((storedCity == null && !cityText) || !districtText) {
      return {
        status: "INPUT_MISSING",
        cityCode: storedCity,
        districtCode: null,
        cityName: null,
        districtName: null,
        errorCode: null,
      };
    }

    try {
      // 3) Il kodu: sakli gecerli kod varsa koru; yoksa CBS il listesinden exact match.
      let cityCode = storedCity;
      let cityName: string | null = null;
      if (cityCode == null) {
        const city = exactMatch(await getCities(target), cityText);
        if (!city) {
          return {
            status: "CITY_NOT_MATCHED",
            cityCode: null,
            districtCode: null,
            cityName: null,
            districtName: null,
            errorCode: null,
          };
        }
        cityCode = toCode(city.code);
        cityName = city.name;
        if (cityCode == null) {
          // CBS numerik olmayan kod dondurdu — guvenli taraf: eslesmedi say.
          return {
            status: "CITY_NOT_MATCHED",
            cityCode: null,
            districtCode: null,
            cityName: null,
            districtName: null,
            errorCode: null,
          };
        }
      }

      // 4) Ilce kodu: ilin CBS ilce listesinden exact match. Muglaklik = eslesmedi.
      const district = exactMatch(await getDistricts(target, String(cityCode)), districtText);
      const districtCode = district ? toCode(district.code) : null;
      if (!district || districtCode == null) {
        return {
          status: "DISTRICT_NOT_MATCHED",
          cityCode,
          districtCode: null,
          cityName,
          districtName: null,
          errorCode: null,
        };
      }

      return {
        status: "MATCHED",
        cityCode,
        districtCode,
        cityName: cityName ?? recipient.cityName ?? null,
        districtName: district.name,
        errorCode: null,
      };
    } catch (error) {
      // 5) CBS erisim hatasi cozumlemeyi BLOKLAMAZ (isim-bazli eski davranis surer).
      const errorCode = error instanceof ShippingConfigError ? error.code : "CBS_LOOKUP_FAILED";
      return {
        status: "CBS_UNAVAILABLE",
        cityCode: storedCity,
        districtCode: null,
        cityName: null,
        districtName: null,
        errorCode,
      };
    }
  }

  async function validateCodes(
    target: CbsLookupTarget,
    cityCode: number,
    districtCode: number,
  ): Promise<{ cityName: string; districtName: string }> {
    if (!isValidGeoCode(cityCode) || !isValidGeoCode(districtCode)) {
      throw new ShippingConfigError("CBS_CODE_INVALID", "Kargo il/ilçe kodu geçersiz.");
    }
    const city = (await getCities(target)).find((c) => toCode(c.code) === cityCode);
    if (!city) {
      throw new ShippingConfigError("CBS_CODE_INVALID", "Seçilen kargo il kodu CBS listesinde bulunamadı.");
    }
    const district = (await getDistricts(target, String(cityCode))).find(
      (d) => toCode(d.code) === districtCode,
    );
    if (!district) {
      throw new ShippingConfigError("CBS_CODE_INVALID", "Seçilen kargo ilçe kodu CBS listesinde bulunamadı.");
    }
    return { cityName: city.name, districtName: district.name };
  }

  return { getCities, getDistricts, resolveRecipientGeo, validateCodes };
}
