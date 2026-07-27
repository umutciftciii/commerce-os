import { describe, it, expect } from "vitest";
import { loadBackupConfig } from "../src/config.js";
import { computeBackupHealth, isBackupHealthReady } from "../src/health.js";
import { BACKUP_QUEUE, DATABASE_BACKUP_JOB, RESTORE_VERIFICATION_JOB } from "../src/job-log.js";

const NOW = new Date("2026-07-28T12:00:00Z");
const now = () => NOW;
const KEY = Buffer.alloc(32, 1).toString("base64");

interface Seed {
  jobName?: string;
  outcome: string;
  ageHours: number;
  remoteVerified?: boolean;
  base?: string;
}

function memJobLog(seed: Seed[]) {
  const rows = seed.map((s, i) => ({
    id: `j${i}`,
    jobName: s.jobName ?? DATABASE_BACKUP_JOB,
    queueName: BACKUP_QUEUE,
    status: "COMPLETED",
    createdAt: new Date(NOW.getTime() - s.ageHours * 3_600_000),
    payload: {
      outcome: s.outcome,
      base: s.base,
      remoteVerified: s.remoteVerified,
      completedAt: new Date(NOW.getTime() - s.ageHours * 3_600_000).toISOString(),
    },
  }));
  return {
    queueJobLog: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async findMany({ where, take }: any) {
        return rows
          .filter((r) => r.jobName === where.jobName)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take);
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function cfg(env: Record<string, string> = {}) {
  return loadBackupConfig({ DATABASE_URL: "postgresql://u:p@localhost:5432/db", ...env } as NodeJS.ProcessEnv);
}

const prodOffsite = {
  APP_ENV: "production",
  DATABASE_BACKUP_ENCRYPTION_KEY: KEY,
  DATABASE_BACKUP_S3_BUCKET: "b",
  DATABASE_BACKUP_S3_ACCESS_KEY_ID: "ak",
  DATABASE_BACKUP_S3_SECRET_ACCESS_KEY: "sk",
  DATABASE_BACKUP_S3_ENDPOINT: "https://s3.example.com",
  DATABASE_BACKUP_VERIFY_AFTER: "true",
  DATABASE_BACKUP_VERIFY_TARGET_URL: "postgresql://u:p@verify:5432/db",
};

describe("computeBackupHealth", () => {
  it("encryption key yok → NOT_CONFIGURED", async () => {
    const health = await computeBackupHealth(memJobLog([]), cfg(), now);
    expect(health.status).toBe("NOT_CONFIGURED");
    expect(isBackupHealthReady(health.status)).toBe(false);
  });

  it("production + offsite yok → NOT_CONFIGURED", async () => {
    const health = await computeBackupHealth(
      memJobLog([{ outcome: "COMPLETED", ageHours: 1, remoteVerified: true }]),
      cfg({ APP_ENV: "production", DATABASE_BACKUP_ENCRYPTION_KEY: KEY }),
      now,
    );
    expect(health.status).toBe("NOT_CONFIGURED");
  });

  it("production: yalnız local (remoteVerified=false) backup → CRITICAL (remote yetersiz)", async () => {
    const health = await computeBackupHealth(
      memJobLog([{ outcome: "COMPLETED", ageHours: 1, remoteVerified: false }]),
      cfg(prodOffsite),
      now,
    );
    expect(health.status).toBe("CRITICAL");
  });

  it("production: remote backup RPO'yu aştı → CRITICAL", async () => {
    const health = await computeBackupHealth(
      memJobLog([{ outcome: "COMPLETED", ageHours: 30, remoteVerified: true }]), // rpo=24
      cfg(prodOffsite),
      now,
    );
    expect(health.status).toBe("CRITICAL");
  });

  it("production: taze remote backup ama verification yok/eski → DEGRADED", async () => {
    const health = await computeBackupHealth(
      memJobLog([{ outcome: "COMPLETED", ageHours: 2, remoteVerified: true }]),
      cfg(prodOffsite),
      now,
    );
    expect(health.status).toBe("DEGRADED"); // verification kaydı yok
  });

  it("production: taze remote backup + güncel verification → HEALTHY", async () => {
    const health = await computeBackupHealth(
      memJobLog([
        { outcome: "COMPLETED", ageHours: 2, remoteVerified: true, base: "production-x" },
        { jobName: RESTORE_VERIFICATION_JOB, outcome: "COMPLETED", ageHours: 5 },
      ]),
      cfg(prodOffsite),
      now,
    );
    expect(health.status).toBe("HEALTHY");
    expect(health.lastSuccessfulBackupBase).toBe("production-x");
    expect(isBackupHealthReady(health.status)).toBe(true);
  });

  it("production: en son deneme FAILED → DEGRADED", async () => {
    const health = await computeBackupHealth(
      memJobLog([
        { outcome: "FAILED", ageHours: 1 },
        { outcome: "COMPLETED", ageHours: 3, remoteVerified: true },
        { jobName: RESTORE_VERIFICATION_JOB, outcome: "COMPLETED", ageHours: 5 },
      ]),
      cfg(prodOffsite),
      now,
    );
    expect(health.status).toBe("DEGRADED");
  });
});
