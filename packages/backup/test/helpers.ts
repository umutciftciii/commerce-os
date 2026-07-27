import { writeFile, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { PgConnection, PgToolRunner } from "../src/pg.js";
import type { BackupConfig } from "../src/config.js";
import type { Logger } from "@commerce-os/logger";

export const TEST_KEY = randomBytes(32).toString("base64");

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/** pg_dump/pg_restore/psql'i taklit eden test runner'ı — gerçek DB gerektirmez. */
export function fakePg(opts: {
  dumpBytes?: Buffer | null;
  version?: string;
  onRestore?: (conn: PgConnection, sourcePath: string) => void;
  queryResults?: Record<string, string>;
} = {}): PgToolRunner {
  const calls: { reset: number; restore: number } = { reset: 0, restore: 0 };
  const runner: PgToolRunner & { calls: typeof calls } = {
    describe: "fake",
    calls,
    async dump(_conn, destPath) {
      const bytes = opts.dumpBytes === undefined ? Buffer.from("PGDMP-FAKE-CONTENT") : opts.dumpBytes;
      await writeFile(destPath, bytes ?? Buffer.alloc(0));
    },
    async restoreFromFile(conn, sourcePath) {
      calls.restore++;
      // Dosyanın çözülmüş dump olduğunu doğrulamak için okunur.
      await readFile(sourcePath);
      opts.onRestore?.(conn, sourcePath);
    },
    async query(_conn, sql) {
      return opts.queryResults?.[sql] ?? "0";
    },
    async serverVersion() {
      return opts.version ?? "16.14";
    },
    async resetPublicSchema() {
      calls.reset++;
    },
  };
  return runner;
}

export function baseConfig(overrides: Partial<BackupConfig> & { localDir: string }): BackupConfig {
  return {
    environment: "test",
    appEnv: "test",
    isProduction: false,
    databaseUrl: "postgresql://u:p@localhost:5432/db",
    pg: { mode: "direct", image: "postgres:16-alpine", format: "custom" },
    encryptionKey: TEST_KEY,
    storage: null,
    retention: { daily: 14, weekly: 8, monthly: 12, minKeep: 3 },
    requireOffsiteInProduction: false,
    scheduler: {
      enabled: false,
      intervalSeconds: 86400,
      verifyAfter: false,
      retentionApplyAfterBackup: false,
    },
    rpoTargetHours: 24,
    rtoTargetHours: 4,
    restoreVerificationMaxAgeHours: 336,
    ...overrides,
  };
}
