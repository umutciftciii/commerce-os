import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { PaymentConfigError } from "./types.js";

/**
 * F3B.2 — Payment credential encryption-at-rest.
 *
 * AES-256-GCM. Anahtar `PAYMENT_ENCRYPTION_KEY` env'inden gelir (32 byte; base64
 * ya da hex). Anahtar yoksa:
 *   - development/test: SABIT GUVENSIZ dev anahtari turetilir + yuksek sesli uyari
 *     (gercek secret saklama; yalnizca yerel gelistirme icin).
 *   - staging/production: hata firlatilir (odeme sifreleme islemi yapilmaz).
 *
 * Ciphertext formati: `v1:gcm:<iv_b64>:<tag_b64>:<ciphertext_b64>`.
 * Duz metin asla DB'ye yazilmaz; bu modul yalnizca route/servis katmaninda kullanilir.
 */

type AppEnv = "development" | "test" | "staging" | "production";

const CIPHER_PREFIX = "v1:gcm";
const DEV_FALLBACK_SEED = "commerce-os-insecure-dev-payment-key";

export interface SecretCipher {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
  /** Maskeli gosterim: yalnizca son 4 karakter, gerisi gizli. */
  mask(plain: string): string;
  /** Bu cipher guvensiz dev fallback anahtari mi kullaniyor? (uyari/UX icin) */
  readonly usingDevFallback: boolean;
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
  throw new PaymentConfigError(
    "PAYMENT_ENCRYPTION_KEY_INVALID",
    "PAYMENT_ENCRYPTION_KEY 32 byte olmali (base64 ya da 64 karakter hex).",
  );
}

function deriveDevKey(): Buffer {
  return createHash("sha256").update(DEV_FALLBACK_SEED).digest();
}

export function createSecretCipher(input: {
  key?: string | null;
  appEnv: AppEnv;
  warn?: (message: string) => void;
}): SecretCipher {
  let key: Buffer;
  let usingDevFallback = false;

  if (input.key && input.key.trim().length > 0) {
    key = decodeKey(input.key);
  } else if (input.appEnv === "development" || input.appEnv === "test") {
    key = deriveDevKey();
    usingDevFallback = true;
    input.warn?.(
      "PAYMENT_ENCRYPTION_KEY tanimli degil — GUVENSIZ dev fallback anahtari kullaniliyor. " +
        "Uretimde mutlaka PAYMENT_ENCRYPTION_KEY ayarlayin.",
    );
  } else {
    throw new PaymentConfigError(
      "PAYMENT_ENCRYPTION_KEY_MISSING",
      `PAYMENT_ENCRYPTION_KEY ${input.appEnv} ortaminda zorunludur.`,
    );
  }

  return {
    usingDevFallback,
    encrypt(plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
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
        throw new PaymentConfigError("PAYMENT_CIPHER_INVALID", "Beklenmeyen ciphertext formati.");
      }
      const iv = Buffer.from(parts[2]!, "base64");
      const tag = Buffer.from(parts[3]!, "base64");
      const ciphertext = Buffer.from(parts[4]!, "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
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
