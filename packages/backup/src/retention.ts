/**
 * PB-2/PB-3 — Retention politikası (Grandfather-Father-Son, SAF + deterministik).
 *
 * Politika (spec §7): günlük N / haftalık N / aylık N katmanları. Kurallar:
 *  - Yalnız BAŞARILI (COMPLETED) backup'lar sayılır; başarısız/yarım olanlar retention hesabına GİRMEZ
 *    (ayrı olarak "temizlenebilir çöp" işaretlenir ama tier korumasına dahil değildir).
 *  - En yeni başarılı backup ASLA purge edilmez (min-guard).
 *  - Deterministik: her katmanda distinct period'ın EN YENİ backup'ı korunur.
 *  - Clock/timezone UTC.
 * SAF fonksiyon: DB/IO yok → tam birim-test edilebilir. Silme kararını üretir, silmez.
 */

export interface RetentionItem {
  /** Sıralama/gösterim anahtarı (obje key ya da base ad). */
  id: string;
  date: Date;
  status: "COMPLETED" | "FAILED" | "PARTIAL";
}

export interface RetentionPolicy {
  daily: number;
  weekly: number;
  monthly: number;
  /** En yeni başarılı N backup her koşulda korunur (alt sınır guard'ı). */
  minKeep: number;
}

export interface RetentionDecision {
  retain: RetentionItem[];
  /** Politika gereği artık gerekmeyen BAŞARILI backup'lar. */
  purge: RetentionItem[];
  /** Başarısız/yarım — retention'a girmez, temizlenebilir (ayrı sınıf). */
  incomplete: RetentionItem[];
  reasons: Record<string, string[]>;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** ISO-8601 hafta anahtarı (UTC): `YYYY-Www`. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Pazar=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // en yakın Perşembe
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

/** Bir katman için: desc sıralı listeden ilk `count` distinct period'ın en-yeni backup'ını seçer. */
function selectTier(
  sortedDesc: RetentionItem[],
  count: number,
  keyFn: (d: Date) => string,
  retain: Set<string>,
  reasons: Record<string, string[]>,
  tierLabel: string,
): void {
  if (count <= 0) return;
  const seen = new Set<string>();
  for (const item of sortedDesc) {
    const k = keyFn(item.date);
    if (seen.has(k)) continue; // period'ın en-yenisi zaten alındı
    seen.add(k);
    if (seen.size > count) break;
    retain.add(item.id);
    (reasons[item.id] ??= []).push(`${tierLabel}:${k}`);
  }
}

export function selectRetention(items: RetentionItem[], policy: RetentionPolicy): RetentionDecision {
  const incomplete = items.filter((i) => i.status !== "COMPLETED");
  const completed = items
    .filter((i) => i.status === "COMPLETED")
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const retain = new Set<string>();
  const reasons: Record<string, string[]> = {};

  // Min-guard: en yeni N (ve dolayısıyla en yenisi) her zaman korunur.
  const minKeep = Math.max(0, policy.minKeep);
  completed.slice(0, minKeep).forEach((i) => {
    retain.add(i.id);
    (reasons[i.id] ??= []).push("min-keep");
  });

  selectTier(completed, policy.daily, dayKey, retain, reasons, "daily");
  selectTier(completed, policy.weekly, isoWeekKey, retain, reasons, "weekly");
  selectTier(completed, policy.monthly, monthKey, retain, reasons, "monthly");

  const retainList = completed.filter((i) => retain.has(i.id));
  const purge = completed.filter((i) => !retain.has(i.id));
  return { retain: retainList, purge, incomplete, reasons };
}
