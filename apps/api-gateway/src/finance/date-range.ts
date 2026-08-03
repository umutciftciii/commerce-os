/**
 * Financial Reporting (ADR-268 §5) — dönem/tarih-aralığı çözümü. SAF/deterministik.
 *
 * Hazır dönem preset'lerini (bugün/dün/son7/son30/buAy/geçenAy/buYıl) mağaza
 * timezone'unda `{dateFrom,dateTo}`'ya çevirir, sonra ORTAK bounded/tz-aware çözücü
 * `resolveRange` (ADR-178) ile UTC sınırlarına + zero-fill gün dizisine dönüştürür.
 * Ayrıca "önceki eşit-uzunluklu dönem" karşılaştırma aralığını üretir (ADR-268 §10).
 *
 * FX/timezone matematiği harici lib'siz; `getZonedDate` (ADR-132) + `resolveRange`
 * yeniden kullanılır — burada kopya tz kodu YOK.
 */
import { getZonedDate } from "../commercial-automation/timezone.js";
import { resolveRange, zonedDayString, type ResolvedRange } from "../influencers/analytics-range.js";

/** Desteklenen hazır dönemler (custom = açık dateFrom/dateTo). */
export const FINANCE_PERIOD_PRESETS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "custom",
] as const;
export type FinancePeriodPreset = (typeof FINANCE_PERIOD_PRESETS)[number];

/** Finansal raporlarda azami aralık (gün) — bounded tarama güvenliği (ADR-268 §14). */
export const FINANCE_MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** UTC takvim aritmetiğiyle YYYY-MM-DD'ye gün ekler (tz-bağımsız). */
function addDayStr(dayStr: string, delta: number): string {
  const t = Date.parse(`${dayStr}T00:00:00Z`) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Ayın son gününü (1..31) döndürür (y, m 1-tabanlı). */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface PresetRange {
  dateFrom: string;
  dateTo: string;
}

/**
 * Preset'i mağaza-tz'sinde {dateFrom,dateTo}'ya çevirir. `custom` verilen değerleri
 * (varsa) geçirir; yoksa son `DEFAULT_RANGE_DAYS` gün. Üst sınır bugünü (tz) aşamaz;
 * kesin kırpma `resolveRange`'de yapılır.
 */
export function resolvePresetRange(
  preset: FinancePeriodPreset,
  timezone: string,
  nowMs: number,
  custom?: { dateFrom?: string; dateTo?: string },
): PresetRange {
  const today = zonedDayString(nowMs, timezone);
  const { year, month } = getZonedDate(new Date(nowMs), timezone);
  switch (preset) {
    case "today":
      return { dateFrom: today, dateTo: today };
    case "yesterday": {
      const y = addDayStr(today, -1);
      return { dateFrom: y, dateTo: y };
    }
    case "last7":
      return { dateFrom: addDayStr(today, -6), dateTo: today };
    case "last30":
      return { dateFrom: addDayStr(today, -29), dateTo: today };
    case "thisMonth":
      return { dateFrom: `${year}-${pad2(month)}-01`, dateTo: today };
    case "lastMonth": {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const from = `${prevYear}-${pad2(prevMonth)}-01`;
      const to = `${prevYear}-${pad2(prevMonth)}-${pad2(lastDayOfMonth(prevYear, prevMonth))}`;
      return { dateFrom: from, dateTo: to };
    }
    case "thisYear":
      return { dateFrom: `${year}-01-01`, dateTo: today };
    case "custom":
    default:
      return {
        dateFrom: custom?.dateFrom ?? addDayStr(today, -(DEFAULT_RANGE_DAYS - 1)),
        dateTo: custom?.dateTo ?? today,
      };
  }
}

export interface ResolvedFinanceRange {
  current: ResolvedRange;
  /** Önceki eşit-uzunluklu dönem (karşılaştırma; ADR-268 §10). */
  previous: ResolvedRange;
  timezone: string;
}

/**
 * Preset + opsiyonel custom aralığı, bounded/tz-aware CURRENT + PREVIOUS aralıklarına
 * çözer. PREVIOUS = current'ın hemen öncesindeki eşit-gün-sayılı dönem.
 */
export function resolveFinanceRange(input: {
  preset: FinancePeriodPreset;
  timezone: string;
  nowMs: number;
  dateFrom?: string;
  dateTo?: string;
}): ResolvedFinanceRange {
  const tz = input.timezone || "Europe/Istanbul";
  const preset = resolvePresetRange(input.preset, tz, input.nowMs, {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  const current = resolveRange({
    dateFrom: preset.dateFrom,
    dateTo: preset.dateTo,
    timezone: tz,
    defaultDays: DEFAULT_RANGE_DAYS,
    maxDays: FINANCE_MAX_RANGE_DAYS,
    nowMs: input.nowMs,
  });

  const spanDays = Math.max(1, current.dayStrings.length);
  const curFrom = current.dayStrings[0]!;
  const prevTo = addDayStr(curFrom, -1);
  const prevFrom = addDayStr(prevTo, -(spanDays - 1));
  const previous = resolveRange({
    dateFrom: prevFrom,
    dateTo: prevTo,
    timezone: tz,
    defaultDays: spanDays,
    maxDays: FINANCE_MAX_RANGE_DAYS,
    nowMs: input.nowMs,
  });

  return { current, previous, timezone: tz };
}
