/**
 * Analytics tarih aralığı çözümü (ADR-178) — SAF/deterministik, birim-testli.
 *
 * Günlük seri gün sınırları STORE TIMEZONE'unda hesaplanır (API + UI aynı sınır). Aralık
 * bounded (`maxDays`); aşan aralık kırpılır. Zero-fill için tz-yerel gün dizisi (YYYY-MM-DD)
 * üretilir. Gelecek günler dizide YER ALMAZ (üst sınır bugüne kırpılır).
 *
 * DST/tz-offset `Intl.DateTimeFormat` ile hesaplanır (harici lib yok). `nowMs` enjekte
 * edilebilir (test). createdAt/attributedAt UTC saklanır; SQL'de
 * `(col AT TIME ZONE 'UTC') AT TIME ZONE tz` ile tz-yerel güne bucketlanır.
 */

export interface ResolvedRange {
  /** WHERE alt sınırı (dahil) — tz-yerel fromStr gününün 00:00'ı, UTC instant. */
  fromUtc: Date;
  /** WHERE üst sınırı (hariç) — tz-yerel toStr+1 gününün 00:00'ı, UTC instant. */
  toUtcExclusive: Date;
  /** Zero-fill için tz-yerel gün dizisi (YYYY-MM-DD, artan). */
  dayStrings: string[];
  timezone: string;
}

/** Bir UTC instant'ın verilen tz'deki offset'i (dakika; doğu pozitif). */
export function timezoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  let hour = get("hour");
  if (hour === 24) hour = 0; // bazı ortamlar 24:00 döndürür
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return Math.round((asIfUtc - utcMs) / 60000);
}

/** tz-yerel `YYYY-MM-DD` gün başlangıcının (00:00) UTC instant'ı. */
export function zonedDayStartUtc(dayStr: string, timeZone: string): Date {
  const guess = Date.parse(`${dayStr}T00:00:00Z`);
  // İki-geçiş: offset aralık sınırında değişebilir; ikinci geçiş kararlıdır.
  const off1 = timezoneOffsetMinutes(guess, timeZone);
  const t1 = guess - off1 * 60000;
  const off2 = timezoneOffsetMinutes(t1, timeZone);
  return new Date(guess - off2 * 60000);
}

/** `YYYY-MM-DD` doğrula. */
function isDayStr(v: string | undefined | null): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

/** UTC instant → tz-yerel `YYYY-MM-DD`. */
export function zonedDayString(utcMs: number, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return dtf.format(new Date(utcMs)); // en-CA → YYYY-MM-DD
}

/** İki gün-string arasındaki (dahil) günleri üretir (takvim aritmetiği, tz-bağımsız). */
export function enumerateDays(fromStr: string, toStr: string): string[] {
  const out: string[] = [];
  const from = new Date(`${fromStr}T00:00:00Z`).getTime();
  const to = new Date(`${toStr}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return out;
  for (let t = from; t <= to; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
    if (out.length > 400) break; // güvenlik
  }
  return out;
}

export interface ResolveRangeInput {
  dateFrom?: string;
  dateTo?: string;
  timezone: string;
  defaultDays: number;
  maxDays: number;
  nowMs: number;
}

/**
 * Bounded, tz-aware aralık çözer. `dateTo` yoksa bugün (tz); `dateFrom` yoksa `defaultDays`.
 * Aralık `maxDays`'i aşarsa alt sınır kırpılır. Üst sınır bugünü (tz) AŞAMAZ (gelecek gün yok).
 */
export function resolveRange(input: ResolveRangeInput): ResolvedRange {
  const tz = input.timezone || "Europe/Istanbul";
  const todayStr = zonedDayString(input.nowMs, tz);
  const maxDays = Math.max(1, Math.floor(input.maxDays));
  const defaultDays = Math.max(1, Math.min(Math.floor(input.defaultDays), maxDays));

  let toStr = isDayStr(input.dateTo) ? input.dateTo.trim() : todayStr;
  if (toStr > todayStr) toStr = todayStr; // gelecek yok

  const addDays = (str: string, delta: number) =>
    new Date(new Date(`${str}T00:00:00Z`).getTime() + delta * 86_400_000).toISOString().slice(0, 10);

  let fromStr = isDayStr(input.dateFrom) ? input.dateFrom.trim() : addDays(toStr, -(defaultDays - 1));
  if (fromStr > toStr) fromStr = toStr;
  // Bounded: aralık maxDays'i aşamaz → alt sınırı kırp.
  const spanDays = Math.round((Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / 86_400_000) + 1;
  if (spanDays > maxDays) fromStr = addDays(toStr, -(maxDays - 1));

  return {
    fromUtc: zonedDayStartUtc(fromStr, tz),
    toUtcExclusive: zonedDayStartUtc(addDays(toStr, 1), tz),
    dayStrings: enumerateDays(fromStr, toStr),
    timezone: tz,
  };
}
