import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBackupCycleRunner } from "../src/cycle-runner.js";
import type { StoreJobLocker, LockOutcome } from "@commerce-os/db";
import { baseConfig, silentLogger } from "./helpers.js";

let localDir: string;
const now = () => new Date("2026-07-28T21:03:05Z");

function memJobLog() {
  const rows: Array<Record<string, unknown> & { id: string; createdAt: Date; jobName: string; queueName: string }> = [];
  let seq = 0;
  return {
    rows,
    client: {
      queueJobLog: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async create({ data, select }: any) {
          seq++;
          const row = { id: `j${seq}`, createdAt: new Date(2026, 0, 1, 0, 0, seq), ...data };
          rows.push(row);
          return select ? { id: row.id } : row;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async update({ where, data }: any) {
          const r = rows.find((x) => x.id === where.id)!;
          Object.assign(r, data);
          return r;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async findMany({ where, take }: any) {
          return rows
            .filter((r) => r.jobName === where.jobName && r.queueName === where.queueName)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, take);
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

function lock(acquired: boolean): StoreJobLocker {
  return async <T>(_jt: string, _sid: string, fn: () => Promise<T>): Promise<LockOutcome<T>> =>
    acquired ? { acquired: true, result: await fn() } : { acquired: false };
}

beforeEach(async () => {
  localDir = await mkdtemp(path.join(tmpdir(), "cmos-cyc-"));
});
afterEach(async () => {
  await rm(localDir, { recursive: true, force: true });
});

describe("createBackupCycleRunner", () => {
  it("başarı: STARTED→COMPLETED tek satır; summary COMPLETED", async () => {
    const { client, rows } = memJobLog();
    const runner = createBackupCycleRunner({
      backupConfig: baseConfig({ localDir }),
      logger: silentLogger,
      jobLog: client,
      lock: lock(true),
      runBackupFn: async () => ({ base: "test-x", remoteVerified: true, report: { base: "test-x", remoteVerified: true } }),
      now,
    });
    const summary = await runner.runCycle("SCHEDULED");
    expect(summary.outcome).toBe("COMPLETED");
    const backupRows = rows.filter((r) => r.jobName === "database-backup");
    expect(backupRows).toHaveLength(1); // STARTED create → COMPLETED update (duplicate yok)
    expect((backupRows[0]!.payload as { outcome: string }).outcome).toBe("COMPLETED");
  });

  it("kilit alınamaz → SKIPPED_LOCKED", async () => {
    const { client, rows } = memJobLog();
    const runner = createBackupCycleRunner({
      backupConfig: baseConfig({ localDir }),
      logger: silentLogger,
      jobLog: client,
      lock: lock(false),
      runBackupFn: async () => ({ base: "x", remoteVerified: true, report: {} }),
      now,
    });
    const summary = await runner.runCycle("MANUAL");
    expect(summary.outcome).toBe("SKIPPED_LOCKED");
    expect((rows[0]!.payload as { outcome: string }).outcome).toBe("SKIPPED_LOCKED");
  });

  it("backup hata → FAILED + redakte error (secret yok)", async () => {
    const { client, rows } = memJobLog();
    const runner = createBackupCycleRunner({
      backupConfig: baseConfig({ localDir, databaseUrl: "postgresql://u:secretpw@localhost/db" }),
      logger: silentLogger,
      jobLog: client,
      lock: lock(true),
      runBackupFn: async () => {
        throw new Error("pg_dump failed postgresql://u:secretpw@localhost/db");
      },
      now,
    });
    const summary = await runner.runCycle("MANUAL");
    expect(summary.outcome).toBe("FAILED");
    const failed = rows.find((r) => (r.payload as { outcome?: string })?.outcome === "FAILED")!;
    expect(JSON.stringify(failed.error)).not.toContain("secretpw");
  });

  it("dry-run → DRY_RUN", async () => {
    const { client } = memJobLog();
    const runner = createBackupCycleRunner({
      backupConfig: baseConfig({ localDir }),
      logger: silentLogger,
      jobLog: client,
      lock: lock(true),
      runBackupFn: async () => ({ base: "x", remoteVerified: false, report: {} }),
      now,
    });
    const summary = await runner.runCycle("MANUAL", { dryRun: true });
    expect(summary.outcome).toBe("DRY_RUN");
  });
});
