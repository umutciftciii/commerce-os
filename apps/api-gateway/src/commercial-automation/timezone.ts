/**
 * TODO-161A.1 (ADR-132) — Timezone-aware dönem sınırı yardımcıları (SAF, prisma/fastify yok).
 *
 * Repo'da luxon/date-fns YOK → tüm timezone matematiği `Intl.DateTimeFormat` üzerine kurulu. Amaç:
 * bir UTC instant'ın verilen IANA timezone'daki "duvar saati" (wall-clock) karşılığını bulmak ve
 * gün/hafta/ay sınırlarını (o timezone'da 00:00) yeniden UTC instant'a çevirmek. DST geçişleri
 * (offset değişimi) tek-adım düzeltme ile ele alınır.
 *
 * Neden UTC değil store timezone? Haftalık/aylık settlement dönemleri store'un takvimine göre
 * kapanmalıdır ("önceki takvim ayı", "kapanmış hafta"); aksi halde UTC gece yarısı Türkiye'de
 * 03:00'e denk gelir ve dönem sınırları yanlış güne kayar (ADR-132).
 */

interface ZonedDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

/**
 * Verilen UTC instant'ta timezone'un UTC offset'i (ms). offset = (duvar saati UTC gibi okunduğunda) - UTC.
 * Örn. Europe/Istanbul için +03:00 → +10_800_000.
 */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asLocalUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return asLocalUtc - utcMs;
}

/**
 * Bir timezone'daki duvar saatini (yıl/ay/gün + saat/dk/sn) gerçek UTC instant'a çevirir.
 * DST kenarında offset iki-adım düzeltilir (tahmini instant'ta offset → düzeltilmiş instant'ta offset).
 */
export function zonedWallTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = tzOffsetMs(asUtc, timeZone);
  let utc = asUtc - offset1;
  const offset2 = tzOffsetMs(utc, timeZone);
  if (offset2 !== offset1) utc = asUtc - offset2;
  return new Date(utc);
}

/** Verilen UTC instant'ın timezone'daki takvim tarihini (yıl/ay/gün) döndürür. */
export function getZonedDate(instant: Date, timeZone: string): ZonedDate {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) map[p.type] = p.value;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

/** Takvim tarihine (tz-bağımsız) gün ekler/çıkarır; yıl/ay/gün taşmasını doğru yönetir. */
function addCalendarDays(date: ZonedDate, days: number): ZonedDate {
  const t = Date.UTC(date.year, date.month - 1, date.day) + days * 86_400_000;
  const d = new Date(t);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** ISO haftanın günü (Pazartesi=1 … Pazar=7) — takvim tarihinden (tz-bağımsız). */
function isoWeekday(date: ZonedDate): number {
  const dow = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay(); // 0=Paz … 6=Cts
  return ((dow + 6) % 7) + 1;
}

export interface Period {
  /** dahil (inclusive) alt sınır — UTC instant */
  periodStart: Date;
  /** hariç (exclusive) üst sınır — UTC instant */
  periodEnd: Date;
}

/**
 * `now` anına göre store timezone'unda EN SON KAPANMIŞ ISO haftası (Pazartesi 00:00 → sonraki
 * Pazartesi 00:00, hariç). Açık (içinde bulunulan) hafta işlenmez.
 */
export function lastClosedWeekPeriod(now: Date, timeZone: string): Period {
  const today = getZonedDate(now, timeZone);
  const daysFromMonday = isoWeekday(today) - 1;
  const thisWeekMonday = addCalendarDays(today, -daysFromMonday);
  const prevWeekMonday = addCalendarDays(thisWeekMonday, -7);
  return {
    periodStart: zonedWallTimeToUtc(timeZone, prevWeekMonday.year, prevWeekMonday.month, prevWeekMonday.day),
    periodEnd: zonedWallTimeToUtc(timeZone, thisWeekMonday.year, thisWeekMonday.month, thisWeekMonday.day),
  };
}

/**
 * `now` anına göre store timezone'unda ÖNCEKİ TAKVİM AYI (ayın 1'i 00:00 → içinde bulunulan ayın 1'i
 * 00:00, hariç). İçinde bulunulan ay kapanmadan işlenmez (zaten önceki ay hedeflenir).
 */
export function previousCalendarMonthPeriod(now: Date, timeZone: string): Period {
  const today = getZonedDate(now, timeZone);
  const prevMonthYear = today.month === 1 ? today.year - 1 : today.year;
  const prevMonth = today.month === 1 ? 12 : today.month - 1;
  return {
    periodStart: zonedWallTimeToUtc(timeZone, prevMonthYear, prevMonth, 1),
    periodEnd: zonedWallTimeToUtc(timeZone, today.year, today.month, 1),
  };
}

/** Verilen IANA timezone adı geçerli mi (Intl reddetmiyor mu)? Geçersizse fallback için kullanılır. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
