/**
 * PB-2/PB-3 — Gerçek restore aracı (demo re-seed DEĞİL).
 *
 * AKIŞ (spec §9): guard → (offsite indir) → checksum doğrula → decrypt → hedef reset → restore → cleanup.
 * Kurallar:
 *  - Yıkıcı; açık onay + hedef guard olmadan çalışmaz (bkz. guards.ts). Mevcut/production DB varsayılan korunur.
 *  - Checksum uyuşmazlığı / decrypt hatası → restore YAPILMAZ (fail-closed).
 *  - Temp dosyalar `finally`'de temizlenir; loglarda connection secret yoktur.
 */
import { mkdtemp, rm, stat, access } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Logger } from "@commerce-os/logger";
import { sha256File, checksumsMatch } from "./checksum.js";
import { decryptFile } from "./crypto.js";
import { assertRestoreTargetAllowed, type RestoreTargetGuardInput } from "./guards.js";
import { parsePgConnection, type PgToolRunner } from "./pg.js";
import type { StorageAdapter } from "./storage/types.js";

export class RestoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RestoreError";
    this.code = code;
  }
}

/**
 * SIGINT/SIGTERM temp cleanup (spec §5). Restore sırasında yaratılan geçici (decrypt edilmiş dump içeren)
 * dizinler sinyalde SENKRON silinir. Süreç exit'i EL DEĞİŞTİRİLMEZ (worker graceful shutdown korunur);
 * yalnız temp dosyalar temizlenir (finally da ayrıca temizler — idempotent).
 */
const activeRestoreTempDirs = new Set<string>();
let signalCleanupInstalled = false;
function installSignalCleanup(): void {
  if (signalCleanupInstalled) return;
  signalCleanupInstalled = true;
  const cleanup = () => {
    for (const dir of activeRestoreTempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* yut */
      }
    }
    activeRestoreTempDirs.clear();
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

export interface RestoreServiceDeps {
  pg: PgToolRunner;
  storage?: StorageAdapter | null;
  logger: Logger;
  now: () => Date;
}

export interface RestoreInput {
  /** Yerel şifreli artefakt yolu (objectKey ile birlikte kullanılmaz). */
  file?: string;
  /** Offsite'tan indirilecek obje anahtarı. */
  objectKey?: string;
  /** Beklenen sha256 (verilirse doğrulanır; yoksa remote metadata denenir). */
  expectedChecksum?: string;
  encryptionKey: string;
  targetUrl: string;
  format: "custom" | "plain";
  /** Restore öncesi hedefi boş public şemaya sıfırla (varsayılan true). */
  resetTarget?: boolean;
  guard: Omit<RestoreTargetGuardInput, "targetUrl">;
}

export interface RestoreResult {
  checksum: string;
  durationMs: number;
  timings: { downloadMs: number; decryptMs: number; restoreMs: number };
  targetHost: string;
}

export async function runRestore(deps: RestoreServiceDeps, input: RestoreInput): Promise<RestoreResult> {
  const { pg, storage, logger, now } = deps;
  const startedAt = now();

  // 1) Hedef guard'ı (yıkıcı onay + production/mevcut-DB koruması).
  assertRestoreTargetAllowed({ ...input.guard, targetUrl: input.targetUrl });

  if (!input.file && !input.objectKey) {
    throw new RestoreError("SOURCE_MISSING", "Restore kaynağı yok — --file ya da --object-key gerekli.");
  }

  const conn = parsePgConnection(input.targetUrl);
  installSignalCleanup();
  const work = await mkdtemp(path.join(tmpdir(), "cmos-restore-"));
  activeRestoreTempDirs.add(work);
  const encPath = input.file ?? path.join(work, "artifact.dump.enc");
  const rawPath = path.join(work, "artifact.dump");
  const timings = { downloadMs: 0, decryptMs: 0, restoreMs: 0 };

  try {
    // 2) Offsite'tan indir (objectKey verildiyse).
    if (input.objectKey) {
      if (!storage) throw new RestoreError("STORAGE_MISSING", "objectKey verildi ama storage adapter yok.");
      const t = now().getTime();
      const head = await storage.head(input.objectKey);
      if (!head) throw new RestoreError("REMOTE_MISSING", "Remote obje bulunamadı (HEAD null).");
      await storage.getToFile(input.objectKey, encPath);
      timings.downloadMs = now().getTime() - t;
      if (!input.expectedChecksum && head.sha256) input.expectedChecksum = head.sha256;
    } else {
      await access(encPath).catch(() => {
        throw new RestoreError("FILE_NOT_FOUND", "Restore dosyası bulunamadı.");
      });
    }

    // 3) Checksum doğrulaması (varsa).
    const checksum = await sha256File(encPath);
    if (input.expectedChecksum && !checksumsMatch(checksum, input.expectedChecksum)) {
      throw new RestoreError(
        "CHECKSUM_MISMATCH",
        "Artefakt checksum'ı beklenenle uyuşmuyor — restore reddedildi (bozuk/yanlış dosya).",
      );
    }

    // 4) Decrypt (tag doğrulaması burada; yanlış anahtar/kurcalanma → DECRYPT_FAILED).
    let t = now().getTime();
    await decryptFile({ key: input.encryptionKey, sourcePath: encPath, destPath: rawPath });
    timings.decryptMs = now().getTime() - t;
    const rawStat = await stat(rawPath);
    if (rawStat.size === 0) throw new RestoreError("EMPTY_DUMP", "Çözülen dump boş — restore reddedildi.");

    // 5) Hedefi boş şemaya sıfırla (guard'lar zaten geçti; açıkça resetlenmiş hedef).
    if (input.resetTarget !== false) {
      await pg.resetPublicSchema(conn);
    }

    // 6) Restore.
    t = now().getTime();
    await pg.restoreFromFile(conn, rawPath, input.format);
    timings.restoreMs = now().getTime() - t;

    logger.info("restore completed", {
      targetHost: conn.host,
      source: input.objectKey ? "offsite" : "local",
      restoreMs: timings.restoreMs,
    });

    return {
      checksum,
      durationMs: now().getTime() - startedAt.getTime(),
      timings,
      targetHost: conn.host,
    };
  } finally {
    // input.file harici (kullanıcının dosyası) silinmez; yalnız work dizini + türetilen raw.
    activeRestoreTempDirs.delete(work);
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
