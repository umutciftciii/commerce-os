/**
 * TODO-178 — Store→Platform Request SLA state (SAF modul; Product Support `sla.ts` PARİTESİ,
 * tablo/enum reuse YOK — yalnız desen). Read-time türetilir (kalıcı breach flag YOK).
 *
 * Kurallar (öncelik sırası):
 *   1) met (firstResponseMetAt/resolvedAt dolu) veya request terminal → DONE
 *   2) now > dueAt                                                    → OVERDUE
 *   3) now, dueAt ile aynı UTC takvim gününde                         → DUE_TODAY
 *   4) aksi                                                           → INSIDE
 *
 * Aynı-gün kıyası UTC üzerindendir (deterministik). Etiketler admin UI'da yerelleştirilir (Faz C/D).
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
 * Live (aktif) cycle = EN YÜKSEK `cycle` snapshot'ı. Reopen her seferinde cycle+1'li yeni snapshot
 * ekler; SLA yalnızca bu en yüksek cycle üzerinden okunur. Historical cycle'lar audit için korunur.
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
 * Inbox `slaRisk` filtresinin KANONİK referansı: yalnız live cycle'da first-response VEYA resolution
 * OVERDUE mı (aktif request varsayımı → isTerminal=false). DB where'i aynı invariantı Prisma-native
 * ifade eder (`resolvedAt:null` = live cycle). Reopen'lı request'lerde false-positive yok.
 */
export function isLiveCycleAtSlaRisk(snaps: readonly SlaSnapshotLike[], now: Date): boolean {
  const live = liveSlaSnapshot(snaps);
  if (!live) return false;
  return (
    slaStateFor(live.firstResponseDueAt, live.firstResponseMetAt, now, false) === "OVERDUE" ||
    slaStateFor(live.resolutionDueAt, live.resolvedAt, now, false) === "OVERDUE"
  );
}
