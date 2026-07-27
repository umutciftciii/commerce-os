/**
 * PB-2/PB-3 — Client-side backup şifreleme (streaming AES-256-GCM) + AÇIK ENVELOPE.
 *
 * TASARIM (spec §3, §5):
 *  - Node yerleşik `crypto` AES-256-GCM (streaming; büyük dump belleğe alınmaz). Standart/belgelenmiş —
 *    ÖZEL KRİPTO DEĞİL. Anahtar `DATABASE_BACKUP_ENCRYPTION_KEY` (tam 32 byte; base64 veya 64-hex; başka
 *    uzunluk fail-closed). AYRI domain — payment/shipping'e FALLBACK YOK. Anahtar yoksa → fail-closed.
 *
 * ENVELOPE (açıkça tanımlı; key rotation'a hazır — version + keyId taşır, key DEĞERİ taşımaz):
 *   MAGIC(6="CMOSBK") | VERSION(1) | KEYID_LEN(1) | KEYID(n) | NONCE/IV(12) | CIPHERTEXT(...) | TAG(16)
 *  - Her backup için YENİ rastgele nonce (nonce reuse YOK).
 *  - GCM auth tag dosya SONUNDA; decrypt önce header+tag'i okur, restore ÖNCESİ tag'i doğrular.
 *  - Bozuk/kurcalanmış/truncate edilmiş ciphertext → tag doğrulaması BAŞARISIZ → DECRYPT_FAILED (restore YOK).
 *  - Yanlış anahtar → kontrollü DECRYPT_FAILED. Bozuk MAGIC/VERSION → FORMAT_INVALID.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, stat, writeFile } from "node:fs/promises";

export const ENCRYPTION_METHOD = "AES-256-GCM";
export const ENVELOPE_VERSION = 2;
export const DEFAULT_KEY_ID = "default";
const MAGIC = Buffer.from("CMOSBK", "ascii"); // 6 byte
const IV_LEN = 12;
const TAG_LEN = 16;
const FIXED_PREFIX_LEN = MAGIC.length + 1 + 1; // MAGIC + VERSION(1) + KEYID_LEN(1) = 8

export class BackupCryptoError extends Error {
  readonly code: "KEY_MISSING" | "KEY_INVALID" | "DECRYPT_FAILED" | "FORMAT_INVALID";
  constructor(code: BackupCryptoError["code"], message: string) {
    super(message);
    this.name = "BackupCryptoError";
    this.code = code;
  }
}

/** Anahtarı TAM 32 byte'a çözer (hex64 ya da base64). Geçersizse KEY_INVALID; boşsa KEY_MISSING. */
export function decodeBackupKey(raw: string | null | undefined): Buffer {
  if (!raw || raw.trim().length === 0) {
    throw new BackupCryptoError(
      "KEY_MISSING",
      "DATABASE_BACKUP_ENCRYPTION_KEY tanımlı değil — backup şifrelenemez (fail-closed).",
    );
  }
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  const buf = Buffer.from(trimmed, "base64");
  if (buf.length === 32) return buf;
  throw new BackupCryptoError(
    "KEY_INVALID",
    "DATABASE_BACKUP_ENCRYPTION_KEY TAM 32 byte olmalı (base64 ya da 64 karakter hex).",
  );
}

export function assertEncryptionUsable(raw: string | null | undefined): void {
  decodeBackupKey(raw);
}

function normalizeKeyId(keyId?: string): Buffer {
  const id = (keyId ?? DEFAULT_KEY_ID).trim() || DEFAULT_KEY_ID;
  const buf = Buffer.from(id, "ascii");
  if (buf.length > 255) throw new BackupCryptoError("FORMAT_INVALID", "keyId 255 byte'ı aşamaz.");
  return buf;
}

async function pipeWithBackpressure(
  source: NodeJS.ReadableStream,
  transform: NodeJS.ReadWriteStream,
  out: NodeJS.WritableStream,
  onEnd: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (err: unknown) => reject(err instanceof Error ? err : new Error(String(err)));
    source.on("error", fail);
    transform.on("error", fail);
    out.on("error", fail);
    transform.on("data", (chunk: Buffer) => {
      if (!out.write(chunk)) {
        transform.pause();
        out.once("drain", () => transform.resume());
      }
    });
    transform.on("end", () => {
      try {
        onEnd();
        out.end();
      } catch (err) {
        fail(err);
      }
    });
    out.on("finish", () => resolve());
    source.pipe(transform as unknown as NodeJS.WritableStream, { end: true });
  });
}

/** Düz dosyayı şifreli envelope'a streaming şifreler (fail-closed anahtar; version+keyId header). */
export async function encryptFile(input: {
  key: string | null | undefined;
  keyId?: string;
  sourcePath: string;
  destPath: string;
}): Promise<void> {
  const keyBuf = decodeBackupKey(input.key);
  const keyIdBuf = normalizeKeyId(input.keyId);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", keyBuf, iv);
  const out = createWriteStream(input.destPath, { mode: 0o600 });
  const header = Buffer.concat([
    MAGIC,
    Buffer.from([ENVELOPE_VERSION, keyIdBuf.length]),
    keyIdBuf,
    iv,
  ]);
  out.write(header);
  await pipeWithBackpressure(createReadStream(input.sourcePath), cipher, out, () => {
    out.write(cipher.getAuthTag());
  });
}

export interface EnvelopeHeader {
  version: number;
  keyId: string;
  headerLen: number;
}

/** Envelope header'ını okur (version + keyId + header uzunluğu). Bozuksa FORMAT_INVALID. */
export async function readEnvelopeHeader(sourcePath: string): Promise<EnvelopeHeader> {
  const fh = await open(sourcePath, "r");
  try {
    const prefix = Buffer.alloc(FIXED_PREFIX_LEN);
    const { bytesRead } = await fh.read(prefix, 0, FIXED_PREFIX_LEN, 0);
    if (bytesRead < FIXED_PREFIX_LEN || !prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new BackupCryptoError("FORMAT_INVALID", "Beklenmeyen backup şifreleme başlığı (MAGIC uyuşmuyor).");
    }
    const version = prefix[MAGIC.length]!;
    const keyIdLen = prefix[MAGIC.length + 1]!;
    if (version !== ENVELOPE_VERSION) {
      throw new BackupCryptoError("FORMAT_INVALID", `Desteklenmeyen envelope sürümü: ${version}.`);
    }
    const keyIdBuf = Buffer.alloc(keyIdLen);
    if (keyIdLen > 0) await fh.read(keyIdBuf, 0, keyIdLen, FIXED_PREFIX_LEN);
    return { version, keyId: keyIdBuf.toString("ascii"), headerLen: FIXED_PREFIX_LEN + keyIdLen + IV_LEN };
  } finally {
    await fh.close();
  }
}

/** Şifreli envelope'u düz dosyaya streaming çözer. Tag doğrulanamazsa/truncate → DECRYPT_FAILED. */
export async function decryptFile(input: {
  key: string | null | undefined;
  sourcePath: string;
  destPath: string;
}): Promise<{ keyId: string; version: number }> {
  const keyBuf = decodeBackupKey(input.key);
  const envelope = await readEnvelopeHeader(input.sourcePath);
  const { size } = await stat(input.sourcePath);
  if (size < envelope.headerLen + TAG_LEN) {
    throw new BackupCryptoError("FORMAT_INVALID", "Şifreli artefakt çok kısa / truncate (başlık+tag sığmıyor).");
  }

  // IV header içinde; TAG dosya sonunda.
  const fh = await open(input.sourcePath, "r");
  let iv: Buffer;
  let tag: Buffer;
  try {
    iv = Buffer.alloc(IV_LEN);
    await fh.read(iv, 0, IV_LEN, envelope.headerLen - IV_LEN);
    tag = Buffer.alloc(TAG_LEN);
    await fh.read(tag, 0, TAG_LEN, size - TAG_LEN);
  } finally {
    await fh.close();
  }

  const decipher = createDecipheriv("aes-256-gcm", keyBuf, iv);
  decipher.setAuthTag(tag);

  // Boş gövde (0-byte düz metin): tag'i doğrula, boş çıktı yaz.
  if (size === envelope.headerLen + TAG_LEN) {
    try {
      decipher.final();
    } catch {
      throw new BackupCryptoError("DECRYPT_FAILED", decryptFailMessage());
    }
    await writeFile(input.destPath, Buffer.alloc(0), { mode: 0o600 });
    return { keyId: envelope.keyId, version: envelope.version };
  }

  const out = createWriteStream(input.destPath, { mode: 0o600 });
  const body = createReadStream(input.sourcePath, { start: envelope.headerLen, end: size - TAG_LEN - 1 });
  try {
    await pipeWithBackpressure(body, decipher, out, () => {});
  } catch (err) {
    if (err instanceof BackupCryptoError) throw err;
    throw new BackupCryptoError("DECRYPT_FAILED", decryptFailMessage());
  }
  return { keyId: envelope.keyId, version: envelope.version };
}

function decryptFailMessage(): string {
  return "Backup çözülemedi — yanlış anahtar veya bozuk/kurcalanmış/truncate edilmiş artefakt (GCM doğrulaması başarısız).";
}
