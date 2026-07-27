/**
 * PB-2/PB-3 — Backup manifest (yan metadata dosyası).
 *
 * Manifest, bir backup turunun kanıtıdır: ne, ne zaman, hangi PG sürümü/migration/commit, boyut, checksum,
 * şifreleme yöntemi, tool sürümü, status. SECRET / CONNECTION STRING İÇERMEZ (spec §3, §13). Backup'ın PII
 * içerdiği açıkça sınıflandırılır (spec §13).
 */

export const MANIFEST_SCHEMA_VERSION = 1;
export const BACKUP_TOOL_VERSION = "1.0.0";
export const PII_CLASSIFICATION = "CONTAINS_PII" as const;

export interface BackupManifest {
  schemaVersion: number;
  base: string;
  environment: string;
  status: "COMPLETED" | "FAILED";
  createdAt: string;
  completedAt: string;
  durationMs: number;
  postgresVersion: string;
  appCommitSha: string | null;
  migration: { count: number; latest: string | null };
  dump: {
    format: "custom" | "plain";
    objectKey: string;
    encryptedSize: number;
    checksumSha256: string;
  };
  /** method + envelope version + keyId (key rotation için). Key DEĞERİ ASLA manifestte bulunmaz. */
  encryption: { method: string; envelopeVersion: number; keyId: string };
  storage: { kind: string; describe: string };
  backupToolVersion: string;
  dataClassification: typeof PII_CLASSIFICATION;
}

export function buildManifest(input: Omit<BackupManifest, "schemaVersion" | "backupToolVersion" | "dataClassification">): BackupManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    backupToolVersion: BACKUP_TOOL_VERSION,
    dataClassification: PII_CLASSIFICATION,
    ...input,
  };
}

export function serializeManifest(manifest: BackupManifest): string {
  return JSON.stringify(manifest, null, 2) + "\n";
}

export function parseManifest(content: string): BackupManifest {
  const raw = JSON.parse(content) as Partial<BackupManifest>;
  if (
    typeof raw.base !== "string" ||
    typeof raw.environment !== "string" ||
    !raw.dump ||
    typeof raw.dump.checksumSha256 !== "string"
  ) {
    throw new Error("parseManifest: eksik/geçersiz manifest alanları.");
  }
  return raw as BackupManifest;
}

/**
 * Güvenlik guard'ı: manifest metni connection-string / bariz secret sızıntısı içermemeli. Test + runtime
 * doğrulaması (yanlışlıkla DB URL manifest'e girerse fail-closed).
 */
export function assertManifestHasNoSecrets(serialized: string): void {
  if (/[a-z][a-z0-9+.-]*:\/\/[^:/@\s]+:[^@\s]+@/i.test(serialized)) {
    throw new Error("Manifest bir connection-string / credential içeriyor — yazma reddedildi.");
  }
}
