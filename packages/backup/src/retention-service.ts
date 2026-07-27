/**
 * PB-2/PB-3 — Retention uygulaması (offsite + local, dry-run, batch, audit, parity).
 *
 * Kurallar (spec §7):
 *  - En yeni başarılı backup asla purge edilmez (selectRetention min-guard'ı).
 *  - Başarısız/yarım (PARTIAL) setler retention'a girmez; ayrı raporlanır (temizlenebilir çöp).
 *  - dry-run varsayılan; APPLY explicit. Silme batch + audit'li.
 *  - local ve remote inventory karşılaştırılır (parity).
 */
import type { Logger } from "@commerce-os/logger";
import { loadBackupSets, backupSetsToRetentionItems, type BackupSet } from "./inventory.js";
import { selectRetention, type RetentionPolicy } from "./retention.js";
import type { StorageAdapter } from "./storage/types.js";

export interface RetentionRunInput {
  offsite: StorageAdapter;
  prefix: string;
  policy: RetentionPolicy;
  dryRun: boolean;
  /** Verilirse local artefaktlar da aynı politikayla budanır + parity raporlanır. */
  local?: { adapter: StorageAdapter; prefix: string };
  logger: Logger;
}

export interface RetentionRunReport {
  dryRun: boolean;
  offsite: {
    total: number;
    retained: string[];
    purged: Array<{ base: string; keys: string[]; deleted: boolean }>;
    incomplete: string[];
  };
  local?: {
    total: number;
    retained: string[];
    purged: Array<{ base: string; keys: string[]; deleted: boolean }>;
    incomplete: string[];
  };
  parity?: { onlyLocal: string[]; onlyRemote: string[] };
}

async function applyRetention(
  storage: StorageAdapter,
  prefix: string,
  policy: RetentionPolicy,
  dryRun: boolean,
): Promise<{ sets: BackupSet[]; report: RetentionRunReport["offsite"] }> {
  const sets = await loadBackupSets(storage, prefix);
  const decision = selectRetention(backupSetsToRetentionItems(sets), policy);
  const keysByBase = new Map(sets.map((s) => [s.base, s.keys]));

  const purged: RetentionRunReport["offsite"]["purged"] = [];
  for (const item of decision.purge) {
    const keys = keysByBase.get(item.id) ?? [];
    if (!dryRun) {
      for (const key of keys) await storage.delete(key);
    }
    purged.push({ base: item.id, keys, deleted: !dryRun });
  }

  return {
    sets,
    report: {
      total: sets.length,
      retained: decision.retain.map((r) => r.id),
      purged,
      incomplete: decision.incomplete.map((i) => i.id),
    },
  };
}

export async function runRetention(input: RetentionRunInput): Promise<RetentionRunReport> {
  const { offsite, prefix, policy, dryRun, logger } = input;
  const offsiteRun = await applyRetention(offsite, prefix, policy, dryRun);

  const report: RetentionRunReport = { dryRun, offsite: offsiteRun.report };

  if (input.local) {
    const localRun = await applyRetention(input.local.adapter, input.local.prefix, policy, dryRun);
    report.local = localRun.report;

    const remoteBases = new Set(offsiteRun.sets.map((s) => s.base));
    const localBases = new Set(localRun.sets.map((s) => s.base));
    report.parity = {
      onlyLocal: [...localBases].filter((b) => !remoteBases.has(b)).sort(),
      onlyRemote: [...remoteBases].filter((b) => !localBases.has(b)).sort(),
    };
  }

  logger.info("retention run finished", {
    dryRun,
    offsiteTotal: report.offsite.total,
    offsitePurge: report.offsite.purged.length,
    offsiteIncomplete: report.offsite.incomplete.length,
    parityDrift: report.parity ? report.parity.onlyLocal.length + report.parity.onlyRemote.length : 0,
  });
  return report;
}
