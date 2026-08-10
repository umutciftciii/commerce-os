/**
 * ADR-289 (TODO-177) §5 — SLA state (SAF modul; recovery `slaState` paritesi).
 *
 * Read-time turetilir (kalici breach flag YOK). Kurallar (oncelik sirasi):
 *   1) met (firstResponseMetAt/resolvedAt dolu) veya ticket terminal → DONE
 *   2) now > dueAt                                                   → OVERDUE
 *   3) now, dueAt ile ayni UTC takvim gununde                        → DUE_TODAY
 *   4) aksi                                                          → INSIDE
 *
 * NOT: ayni-gun kiyasi UTC uzerindendir (deterministik). Store-admin UI etiketleri
 * `ticket-labels.ts` tarafindan yerellestirilir (INSIDE/DUE_TODAY/OVERDUE/DONE → tr/en + tone).
 */

export type SlaStateKind = "INSIDE" | "DUE_TODAY" | "OVERDUE" | "DONE";

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function slaStateFor(
  dueAt: Date,
  metAt: Date | null,
  now: Date,
  isTerminal: boolean,
): SlaStateKind {
  if (metAt != null || isTerminal) return "DONE";
  if (now.getTime() > dueAt.getTime()) return "OVERDUE";
  if (sameUtcDay(now, dueAt)) return "DUE_TODAY";
  return "INSIDE";
}

/**
 * TD-177-2 — Live (aktif) cycle = EN YÜKSEK `cycle` snapshot'ı. Reopen her seferinde cycle+1'li
 * yeni snapshot ekler; SLA yalnızca bu en yüksek cycle üzerinden okunur (serialize/inbox item ile
 * aynı tanım). Historical cycle'lar audit için korunur ama aktif KPI olarak sunulmaz.
 */
export function liveSlaSnapshot<T extends { cycle: number }>(snaps: readonly T[]): T | null {
  if (snaps.length === 0) return null;
  return snaps.reduce((a, b) => (b.cycle > a.cycle ? b : a));
}

interface SlaSnapshotLike {
  cycle: number;
  firstResponseDueAt: Date;
  firstResponseMetAt: Date | null;
  resolutionDueAt: Date;
  resolvedAt: Date | null;
}

/**
 * TD-177-2 — Inbox `slaRisk` filtresinin KANONİK referansı: yalnız live cycle'da first-response
 * VEYA resolution OVERDUE mı (aktif ticket varsayımı → isTerminal=false). Bu, inbox SLA rozetiyle
 * (live snapshot + `slaStateFor` "OVERDUE") birebir aynı kavramdır; DB where'i aynı invariantı
 * Prisma-native ifade eder (`resolvedAt:null` = live cycle). Historical overdue-resolved cycle'lar
 * live seçimiyle elenir → reopen'lı ticket'larda false-positive yok.
 */
export function isLiveCycleAtSlaRisk(snaps: readonly SlaSnapshotLike[], now: Date): boolean {
  const live = liveSlaSnapshot(snaps);
  if (!live) return false;
  return (
    slaStateFor(live.firstResponseDueAt, live.firstResponseMetAt, now, false) === "OVERDUE" ||
    slaStateFor(live.resolutionDueAt, live.resolvedAt, now, false) === "OVERDUE"
  );
}
