/**
 * PB-2/PB-3 — Backup envanteri: bir storage adapter'ındaki objeleri "backup set"lerine (base) gruplar.
 *
 * Bir backup seti = aynı `<env>-<ts>` base'ini paylaşan artefaktlar (.dump.enc + .sha256 + .manifest.json).
 * Status: dump.enc VE manifest mevcutsa COMPLETED; aksi halde PARTIAL (yarım/başarısız → retention'a girmez).
 */
import { parseArtifactBase } from "./naming.js";
import type { RetentionItem } from "./retention.js";
import type { StorageAdapter } from "./storage/types.js";

export interface BackupSet {
  base: string;
  date: Date;
  status: "COMPLETED" | "PARTIAL";
  keys: string[];
}

export async function loadBackupSets(storage: StorageAdapter, prefix: string): Promise<BackupSet[]> {
  const objects = await storage.list(prefix);
  const byBase = new Map<string, { keys: string[]; date: Date; hasDump: boolean; hasManifest: boolean }>();

  for (const obj of objects) {
    const name = prefix && obj.key.startsWith(prefix) ? obj.key.slice(prefix.length).replace(/^\/+/, "") : obj.key;
    const parsed = parseArtifactBase(name);
    if (!parsed) continue;
    const base = `${parsed.environment}-${parsed.stamp}`;
    const entry = byBase.get(base) ?? { keys: [], date: parsed.date, hasDump: false, hasManifest: false };
    entry.keys.push(obj.key);
    if (name.endsWith(".dump.enc")) entry.hasDump = true;
    if (name.endsWith(".manifest.json")) entry.hasManifest = true;
    byBase.set(base, entry);
  }

  const sets: BackupSet[] = [];
  for (const [base, entry] of byBase) {
    sets.push({
      base,
      date: entry.date,
      status: entry.hasDump && entry.hasManifest ? "COMPLETED" : "PARTIAL",
      keys: entry.keys.sort(),
    });
  }
  return sets.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function backupSetsToRetentionItems(sets: BackupSet[]): RetentionItem[] {
  return sets.map((s) => ({ id: s.base, date: s.date, status: s.status === "COMPLETED" ? "COMPLETED" : "PARTIAL" }));
}
