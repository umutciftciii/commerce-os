import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ShippingConfigError } from "./errors.js";

/**
 * F3C.1 — Shipping credential encryption-at-rest.
 *
 * AES-256-GCM. Anahtar `SHIPPING_ENCRYPTION_KEY` env'inden gelir (32 byte; base64
 * ya da hex). Payment'tan AYRI bir domain anahtaridir; `PAYMENT_ENCRYPTION_KEY`'e
 * FALLBACK YOKTUR.
 *
 * Anahtar yoksa HICBIR ortamda (development/test/staging/production) guvensiz/
 * hardcoded fallback kullanilmaz: cipher kurulamaz ve `CONFIG_MISSING` firlatilir.
 * Cipher lazy kurulur (yalnizca credential save/test/decrypt aninda), boylece
 * anahtar yokken diger shipping islemleri (config listeleme vb.) calismaya devam eder.
 *
 * Ciphertext formati: `v1:gcm:<iv_b64>:<tag_b64>:<ciphertext_b64>`.
 * Duz metin asla DB'ye yazilmaz; bu modul yalnizca route/servis katmaninda kullanilir.
 */

const CIPHER_PREFIX = "v1:gcm";

export interface ShippingSecretCipher {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
  /** Maskeli gosterim: yalnizca son 4 karakter, gerisi gizli. */
  mask(plain: string): string;
}

function decodeKey(raw: string): Buffer {
  const trimmed = raw.trim();
  // 64 karakter hex => 32 byte.
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  // Aksi halde base64 dene.
  const buf = Buffer.from(trimmed, "base64");
  if (buf.length === 32) {
    return buf;
  }
  throw new ShippingConfigError(
    "CONFIG_INVALID",
    "SHIPPING_ENCRYPTION_KEY 32 byte olmali (base64 ya da 64 karakter hex).",
  );
}

/**
 * Anahtar varsa cipher kurar; yoksa `CONFIG_MISSING` firlatir. FALLBACK YOK.
 */
export function createShippingSecretCipher(key?: string | null): ShippingSecretCipher {
  if (!key || key.trim().length === 0) {
    throw new ShippingConfigError(
      "CONFIG_MISSING",
      "SHIPPING_ENCRYPTION_KEY tanimli degil — kargo credential sifreleme islemi yapilamaz.",
    );
  }
  const keyBuf = decodeKey(key);

  return {
    encrypt(plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", keyBuf, iv);
      const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [
        CIPHER_PREFIX,
        iv.toString("base64"),
        tag.toString("base64"),
        ciphertext.toString("base64"),
      ].join(":");
    },
    decrypt(value: string): string {
      const parts = value.split(":");
      // v1:gcm:<iv>:<tag>:<ct> => 5 parca.
      if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== CIPHER_PREFIX) {
        throw new ShippingConfigError("CONFIG_INVALID", "Beklenmeyen ciphertext formati.");
      }
      const iv = Buffer.from(parts[2]!, "base64");
      const tag = Buffer.from(parts[3]!, "base64");
      const ciphertext = Buffer.from(parts[4]!, "base64");
      const decipher = createDecipheriv("aes-256-gcm", keyBuf, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plain.toString("utf8");
    },
    mask(plain: string): string {
      if (!plain) {
        return "";
      }
      if (plain.length <= 4) {
        return "••••";
      }
      return `••••${plain.slice(-4)}`;
    },
  };
}
