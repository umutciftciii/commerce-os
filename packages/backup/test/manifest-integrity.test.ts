import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { buildManifest } from "../src/manifest.js";
import {
  signManifest,
  verifyAndParseManifest,
  assertManifestEnvironment,
  ManifestIntegrityError,
} from "../src/manifest-integrity.js";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");

function sample(environment = "production") {
  return buildManifest({
    base: `${environment}-20260728T210305Z`,
    environment,
    status: "COMPLETED",
    createdAt: "2026-07-28T21:03:05.000Z",
    completedAt: "2026-07-28T21:04:05.000Z",
    durationMs: 60000,
    postgresVersion: "16.14",
    appCommitSha: "abc1234",
    migration: { count: 62, latest: "20260727160000_customer_erasure" },
    dump: { format: "custom", objectKey: "k", encryptedSize: 12345, checksumSha256: "a".repeat(64) },
    encryption: { method: "AES-256-GCM", envelopeVersion: 2, keyId: "default" },
    storage: { kind: "s3", describe: "s3://bucket @ host" },
  });
}

describe("manifest HMAC integrity", () => {
  it("sign→verify roundtrip", () => {
    const signed = signManifest(sample(), KEY);
    const parsed = verifyAndParseManifest(signed, KEY);
    expect(parsed.environment).toBe("production");
    expect(parsed.dump.checksumSha256).toBe("a".repeat(64));
  });

  it("imzalı JSON integrity.hmac içerir; key değeri İÇERMEZ", () => {
    const signed = signManifest(sample(), KEY);
    expect(signed).toContain('"integrity"');
    expect(signed).toContain('"HMAC-SHA256"');
    expect(signed).not.toContain(KEY);
  });

  it("environment kurcalanırsa HMAC uyuşmaz → reddedilir (checksum/env guard atlatılamaz)", () => {
    const signed = signManifest(sample("production"), KEY);
    const tampered = signed.replace('"production"', '"staging"');
    expect(() => verifyAndParseManifest(tampered, KEY)).toThrow(ManifestIntegrityError);
  });

  it("checksum kurcalanırsa reddedilir", () => {
    const signed = signManifest(sample(), KEY);
    const tampered = signed.replace("a".repeat(64), "b".repeat(64));
    expect(() => verifyAndParseManifest(tampered, KEY)).toThrow(ManifestIntegrityError);
  });

  it("yanlış anahtar → reddedilir", () => {
    const signed = signManifest(sample(), KEY);
    expect(() => verifyAndParseManifest(signed, OTHER_KEY)).toThrow(ManifestIntegrityError);
  });

  it("integrity alanı yok (imzasız) → reddedilir", () => {
    const unsigned = JSON.stringify(sample());
    expect(() => verifyAndParseManifest(unsigned, KEY)).toThrow(ManifestIntegrityError);
  });

  it("assertManifestEnvironment: uyuşmazlık → hata; eşleşme → geçer", () => {
    const m = verifyAndParseManifest(signManifest(sample("production"), KEY), KEY);
    expect(() => assertManifestEnvironment(m, "staging")).toThrow(ManifestIntegrityError);
    expect(() => assertManifestEnvironment(m, "production")).not.toThrow();
  });
});
