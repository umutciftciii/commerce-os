import { describe, it, expect } from "vitest";
import { loadBackupConfig, checkBackupRunnable } from "../src/config.js";
import { randomBytes } from "node:crypto";

const KEY = randomBytes(32).toString("base64");

describe("loadBackupConfig", () => {
  it("boş-string env → default (TD-036 toleransı)", () => {
    const cfg = loadBackupConfig({
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      DATABASE_BACKUP_INTERVAL_SECONDS: "",
      DATABASE_BACKUP_ENABLED: "",
      DATABASE_BACKUP_RETENTION_DAILY: "",
    } as NodeJS.ProcessEnv);
    expect(cfg.scheduler.intervalSeconds).toBe(86400);
    expect(cfg.scheduler.enabled).toBe(false);
    expect(cfg.retention.daily).toBe(14);
  });

  it("S3 env eksikse storage null; hepsi varsa configured", () => {
    expect(loadBackupConfig({ DATABASE_URL: "postgresql://u:p@h/db" } as NodeJS.ProcessEnv).storage).toBeNull();
    const cfg = loadBackupConfig({
      DATABASE_URL: "postgresql://u:p@h/db",
      DATABASE_BACKUP_S3_BUCKET: "b",
      DATABASE_BACKUP_S3_ACCESS_KEY_ID: "ak",
      DATABASE_BACKUP_S3_SECRET_ACCESS_KEY: "sk",
      DATABASE_BACKUP_S3_ENDPOINT: "http://localhost:9000",
    } as NodeJS.ProcessEnv);
    expect(cfg.storage?.bucket).toBe("b");
    expect(cfg.storage?.forcePathStyle).toBe(true); // endpoint verildi → default true
  });

  it("production → requireOffsiteInProduction true", () => {
    const cfg = loadBackupConfig({ DATABASE_URL: "postgresql://u:p@h/db", APP_ENV: "production" } as NodeJS.ProcessEnv);
    expect(cfg.isProduction).toBe(true);
    expect(cfg.requireOffsiteInProduction).toBe(true);
  });

  it("retention alt sınır guard'ı (daily min 1)", () => {
    const cfg = loadBackupConfig({ DATABASE_URL: "postgresql://u:p@h/db", DATABASE_BACKUP_RETENTION_DAILY: "0" } as NodeJS.ProcessEnv);
    expect(cfg.retention.daily).toBe(1);
  });
});

describe("checkBackupRunnable (fail-closed)", () => {
  const dbUrl = "postgresql://u:p@localhost:5432/db";
  it("her şey tamamsa hata yok", () => {
    const cfg = loadBackupConfig({ DATABASE_URL: dbUrl, DATABASE_BACKUP_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv);
    expect(checkBackupRunnable(cfg)).toHaveLength(0);
  });
  it("DATABASE_URL yok → DATABASE_URL_MISSING", () => {
    const cfg = loadBackupConfig({ DATABASE_BACKUP_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv);
    expect(checkBackupRunnable(cfg).map((e) => e.code)).toContain("DATABASE_URL_MISSING");
  });
  it("encryption key yok → ENCRYPTION_KEY_MISSING", () => {
    const cfg = loadBackupConfig({ DATABASE_URL: dbUrl } as NodeJS.ProcessEnv);
    expect(checkBackupRunnable(cfg).map((e) => e.code)).toContain("ENCRYPTION_KEY_MISSING");
  });
  it("production + offsite yok → OFFSITE_REQUIRED", () => {
    const cfg = loadBackupConfig({ DATABASE_URL: dbUrl, DATABASE_BACKUP_ENCRYPTION_KEY: KEY, APP_ENV: "production" } as NodeJS.ProcessEnv);
    expect(checkBackupRunnable(cfg).map((e) => e.code)).toContain("OFFSITE_REQUIRED");
  });
});
