/**
 * PB-2/PB-3 — Manifest bütünlüğü (HMAC-SHA256).
 *
 * Manifest, şifreli backup dosyasından AYRI olduğundan tek başına değiştirilebilir. Bir saldırgan/kaza
 * manifest'teki `environment` ya da `dump.checksumSha256` alanını değiştirerek cross-environment ya da
 * checksum guard'ını atlatabilir. Bunu engellemek için manifest, backup encryption anahtarından TÜRETİLEN
 * ayrı bir MAC anahtarıyla HMAC'lenir (spec §4). Manifest kurcalanırsa HMAC uyuşmaz → restore/verify reddeder.
 *
 * MAC anahtarı = HMAC(encryptionKey, "commerce-os-backup-manifest-mac-v1") → şifreleme ve MAC domain'leri ayrık.
 * Key DEĞERİ manifestte YER ALMAZ; yalnız keyId (encryption.keyId) rotation için taşınır.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { decodeBackupKey } from "./crypto.js";
import { serializeManifest, type BackupManifest } from "./manifest.js";

const MAC_INFO = "commerce-os-backup-manifest-mac-v1";

export interface ManifestIntegrity {
  alg: "HMAC-SHA256";
  hmac: string;
}

function deriveMacKey(encryptionKey: string | null | undefined): Buffer {
  const keyBuf = decodeBackupKey(encryptionKey); // 32 byte (fail-closed)
  return createHmac("sha256", keyBuf).update(MAC_INFO).digest();
}

/** Manifest'i imzalar → integrity alanı EKLENMİŞ JSON string döndürür (diske bu yazılır). */
export function signManifest(manifest: BackupManifest, encryptionKey: string | null | undefined): string {
  const macKey = deriveMacKey(encryptionKey);
  const canonical = serializeManifest(manifest); // integrity YOK
  const hmac = createHmac("sha256", macKey).update(canonical).digest("hex");
  const signed = { ...manifest, integrity: { alg: "HMAC-SHA256", hmac } satisfies ManifestIntegrity };
  return JSON.stringify(signed, null, 2) + "\n";
}

export class ManifestIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestIntegrityError";
  }
}

/**
 * İmzalı manifest string'ini doğrular. HMAC yoksa/uyuşmazsa ManifestIntegrityError (fail-closed).
 * Başarıda integrity'siz BackupManifest döndürür.
 */
export function verifyAndParseManifest(
  serialized: string,
  encryptionKey: string | null | undefined,
): BackupManifest {
  const parsed = JSON.parse(serialized) as Record<string, unknown> & { integrity?: ManifestIntegrity };
  const integrity = parsed.integrity;
  if (!integrity || typeof integrity.hmac !== "string") {
    throw new ManifestIntegrityError("Manifest HMAC (integrity) alanı yok — imzasız manifest reddedildi.");
  }
  const { integrity: _omit, ...manifest } = parsed;
  void _omit;
  const macKey = deriveMacKey(encryptionKey);
  const canonical = serializeManifest(manifest as unknown as BackupManifest);
  const expected = createHmac("sha256", macKey).update(canonical).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(integrity.hmac, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ManifestIntegrityError("Manifest HMAC uyuşmuyor — kurcalanmış manifest reddedildi.");
  }
  return manifest as unknown as BackupManifest;
}

/**
 * Manifest ortamı ile beklenen (hedef) ortamı karşılaştırır. Uyuşmazsa hata (cross-environment guard).
 * Manifest HMAC ile korunduğundan environment değeri kurcalanamaz.
 */
export function assertManifestEnvironment(manifest: BackupManifest, expectedEnvironment: string): void {
  if (manifest.environment !== expectedEnvironment) {
    throw new ManifestIntegrityError(
      `Manifest ortamı (${manifest.environment}) hedef ortamla (${expectedEnvironment}) uyuşmuyor — cross-environment restore reddedildi.`,
    );
  }
}
