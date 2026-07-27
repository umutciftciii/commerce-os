/**
 * PB-2/PB-3 — Prisma migration envanteri (manifest için: count + latest).
 * Yalnız dizin adlarını okur (SQL çalıştırmaz); DB'siz de çalışır.
 */
import { readdir } from "node:fs/promises";

const MIGRATION_DIR_RE = /^\d{14}_/;

export async function readMigrationInfo(
  migrationsDir: string,
): Promise<{ count: number; latest: string | null }> {
  let entries: string[] = [];
  try {
    const dirents = await readdir(migrationsDir, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory() && MIGRATION_DIR_RE.test(d.name)).map((d) => d.name);
  } catch {
    return { count: 0, latest: null };
  }
  entries.sort();
  return { count: entries.length, latest: entries.length ? entries[entries.length - 1]! : null };
}
