import { describe, it, expect } from "vitest";
import {
  buildManifest,
  serializeManifest,
  parseManifest,
  assertManifestHasNoSecrets,
  PII_CLASSIFICATION,
} from "../src/manifest.js";
import { redactSecrets, redactConnectionStrings, redactError } from "../src/redaction.js";

function sampleManifest() {
  return buildManifest({
    base: "production-20260728T210305Z",
    environment: "production",
    status: "COMPLETED",
    createdAt: "2026-07-28T21:03:05.000Z",
    completedAt: "2026-07-28T21:04:05.000Z",
    durationMs: 60000,
    postgresVersion: "16.14",
    appCommitSha: "abc1234",
    migration: { count: 62, latest: "20260727160000_customer_erasure" },
    dump: { format: "custom", objectKey: "backups/production-...dump.enc", encryptedSize: 12345, checksumSha256: "a".repeat(64) },
    encryption: { method: "AES-256-GCM", envelopeVersion: 2, keyId: "default" },
    storage: { kind: "s3", describe: "s3://bucket @ host" },
  });
}

describe("manifest", () => {
  it("PII sınıflandırması + tool sürümü set edilir", () => {
    const m = sampleManifest();
    expect(m.dataClassification).toBe(PII_CLASSIFICATION);
    expect(m.backupToolVersion).toBeTruthy();
    expect(m.schemaVersion).toBe(1);
  });

  it("serialize→parse roundtrip", () => {
    const m = sampleManifest();
    const parsed = parseManifest(serializeManifest(m));
    expect(parsed.base).toBe(m.base);
    expect(parsed.dump.checksumSha256).toBe(m.dump.checksumSha256);
  });

  it("connection-string içeren manifest reddedilir", () => {
    const poisoned = JSON.stringify({ ...sampleManifest(), leak: "postgresql://user:pass@host:5432/db" });
    expect(() => assertManifestHasNoSecrets(poisoned)).toThrow();
  });

  it("temiz manifest geçer", () => {
    expect(() => assertManifestHasNoSecrets(serializeManifest(sampleManifest()))).not.toThrow();
  });
});

describe("redaction", () => {
  it("connection string kimlik bilgisini maskeler", () => {
    const out = redactConnectionStrings("bağlan: postgresql://admin:s3cr3t@db:5432/app şimdi");
    expect(out).not.toContain("s3cr3t");
    expect(out).not.toContain("admin");
    expect(out).toContain("db:5432");
  });

  it("bilinen secret'ları temizler", () => {
    const out = redactSecrets("key=SUPERSECRETVALUE123", ["SUPERSECRETVALUE123"]);
    expect(out).not.toContain("SUPERSECRETVALUE123");
  });

  it("redactError stack içermez ve secret'ı temizler", () => {
    const e = new Error("failed with postgresql://u:pw@h/db and KEY=TOPSECRET99");
    const safe = redactError(e, ["TOPSECRET99"]);
    expect(safe.message).not.toContain("TOPSECRET99");
    expect(safe.message).not.toContain("pw@");
    expect(safe).not.toHaveProperty("stack");
  });
});
