import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  encryptFile,
  decryptFile,
  decodeBackupKey,
  readEnvelopeHeader,
  BackupCryptoError,
  ENVELOPE_VERSION,
} from "../src/crypto.js";
import { truncate } from "node:fs/promises";

const KEY = randomBytes(32).toString("base64");
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "cmos-crypto-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("decodeBackupKey", () => {
  it("hex64 ve base64 32-byte anahtarı kabul eder", () => {
    expect(decodeBackupKey(randomBytes(32).toString("hex"))).toHaveLength(32);
    expect(decodeBackupKey(randomBytes(32).toString("base64"))).toHaveLength(32);
  });
  it("boş anahtar → KEY_MISSING", () => {
    expect(() => decodeBackupKey("")).toThrow(BackupCryptoError);
    try {
      decodeBackupKey(undefined);
    } catch (e) {
      expect((e as BackupCryptoError).code).toBe("KEY_MISSING");
    }
  });
  it("geçersiz uzunluk → KEY_INVALID", () => {
    try {
      decodeBackupKey("dG9vc2hvcnQ="); // "tooshort"
    } catch (e) {
      expect((e as BackupCryptoError).code).toBe("KEY_INVALID");
    }
  });
});

describe("encryptFile/decryptFile", () => {
  it("roundtrip: içerik bit-birebir korunur", async () => {
    const src = path.join(dir, "plain");
    const enc = path.join(dir, "enc");
    const dec = path.join(dir, "dec");
    const data = randomBytes(1024 * 40); // >32k çok-chunk yol
    await writeFile(src, data);
    await encryptFile({ key: KEY, sourcePath: src, destPath: enc });
    // Şifreli dosya düz metinden farklı + header ekli.
    const encStat = await stat(enc);
    expect(encStat.size).toBeGreaterThan(data.length);
    await decryptFile({ key: KEY, sourcePath: enc, destPath: dec });
    expect(await readFile(dec)).toEqual(data);
  });

  it("yanlış anahtar → DECRYPT_FAILED", async () => {
    const src = path.join(dir, "plain");
    const enc = path.join(dir, "enc");
    await writeFile(src, "gizli veri");
    await encryptFile({ key: KEY, sourcePath: src, destPath: enc });
    await expect(
      decryptFile({ key: randomBytes(32).toString("base64"), sourcePath: enc, destPath: path.join(dir, "x") }),
    ).rejects.toMatchObject({ code: "DECRYPT_FAILED" });
  });

  it("kurcalanmış artefakt → DECRYPT_FAILED", async () => {
    const src = path.join(dir, "plain");
    const enc = path.join(dir, "enc");
    await writeFile(src, randomBytes(2048));
    await encryptFile({ key: KEY, sourcePath: src, destPath: enc });
    const buf = await readFile(enc);
    buf[30] = buf[30]! ^ 0xff; // ortadan bir bit çevir
    await writeFile(enc, buf);
    await expect(
      decryptFile({ key: KEY, sourcePath: enc, destPath: path.join(dir, "x") }),
    ).rejects.toMatchObject({ code: "DECRYPT_FAILED" });
  });

  it("bozuk başlık (MAGIC) → FORMAT_INVALID", async () => {
    const enc = path.join(dir, "enc");
    await writeFile(enc, Buffer.concat([Buffer.from("XXXXXXXX"), randomBytes(40)]));
    await expect(
      decryptFile({ key: KEY, sourcePath: enc, destPath: path.join(dir, "x") }),
    ).rejects.toMatchObject({ code: "FORMAT_INVALID" });
  });

  it("envelope keyId + version header'da taşınır ve okunur", async () => {
    const src = path.join(dir, "plain");
    const enc = path.join(dir, "enc");
    await writeFile(src, randomBytes(512));
    await encryptFile({ key: KEY, keyId: "prod-2026", sourcePath: src, destPath: enc });
    const header = await readEnvelopeHeader(enc);
    expect(header.version).toBe(ENVELOPE_VERSION);
    expect(header.keyId).toBe("prod-2026");
    const res = await decryptFile({ key: KEY, sourcePath: enc, destPath: path.join(dir, "dec") });
    expect(res.keyId).toBe("prod-2026");
  });

  it("truncate edilmiş dosya → FORMAT_INVALID/DECRYPT_FAILED (restore YOK)", async () => {
    const src = path.join(dir, "plain");
    const enc = path.join(dir, "enc");
    await writeFile(src, randomBytes(4096));
    await encryptFile({ key: KEY, sourcePath: src, destPath: enc });
    const { size } = await stat(enc);
    await truncate(enc, size - 100); // gövde + tag kısaltıldı
    await expect(
      decryptFile({ key: KEY, sourcePath: enc, destPath: path.join(dir, "x") }),
    ).rejects.toMatchObject({ name: "BackupCryptoError" });
  });
});
