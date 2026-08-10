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
