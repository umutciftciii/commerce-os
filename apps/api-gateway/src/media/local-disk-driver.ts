import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StorageDriver } from "./storage.js";

/**
 * ADR-065 — Local filesystem storage surucusu (Faz 1). Docker'da baseDir bir named
 * volume'a (media-data) mount edilir; rebuild'de dosyalar korunur.
 *
 * GUVENLIK: storageKey sunucu uretir (buildStorageKey), ama bu surucu IKINCI savunma
 * hatti olarak her key'i defansif dogrular. Uc katman (resolveSafe):
 *   1) Traversal token'lari (`..`, mutlak yol, NUL) → PATH_TRAVERSAL_BLOCKED
 *   2) Format regex (entityId'siz tek-segment .webp) → INVALID_STORAGE_KEY
 *   3) Mutlak yol sinir kontrolu (path.resolve baseDir disina cikamaz) → PATH_TRAVERSAL_BLOCKED
 */
// storeId segmenti tire (`-`) icerebilir: uretim cuid'leri [a-z0-9] olsa da
// seed/demo store id'leri hyphen tasir (or. "edm-store"). Tire traversal riski
// TASIMAZ (Katman 1 `..`/mutlak/NUL + Katman 3 baseDir sinir kontrolu ayridir);
// bu yuzden hyphen'e izin verilir, aksi halde hyphenli store'a upload 500 verir.
const STORAGE_KEY_PATTERN = /^stores\/[a-z0-9-]+\/(products|categories|hero|branding)\/[^/]+\.webp$/;

export type StorageKeyErrorCode = "INVALID_STORAGE_KEY" | "PATH_TRAVERSAL_BLOCKED";

export class StorageKeyError extends Error {
  readonly code: StorageKeyErrorCode;

  constructor(code: StorageKeyErrorCode, message: string) {
    super(message);
    this.name = "StorageKeyError";
    this.code = code;
  }
}

export class LocalDiskDriver implements StorageDriver {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  /** Key'i dogrular ve baseDir altindaki mutlak yolu doner; gecersizse firlatir. */
  private resolveSafe(key: string): string {
    // Katman 1 — acik traversal token'lari (path.resolve'dan ONCE, defansif).
    if (key.includes("..") || key.startsWith("/") || key.includes("\0")) {
      throw new StorageKeyError("PATH_TRAVERSAL_BLOCKED", `Path traversal engellendi: ${key}`);
    }
    // Katman 2 — format dogrulama (entityId'siz, tek segment, .webp uzantili).
    if (!STORAGE_KEY_PATTERN.test(key)) {
      throw new StorageKeyError("INVALID_STORAGE_KEY", `Gecersiz storage key: ${key}`);
    }
    // Katman 3 — mutlak yol sinir kontrolu (regex'i gecen edge/symlink durumlari).
    const full = path.resolve(this.baseDir, key);
    if (full !== this.baseDir && !full.startsWith(this.baseDir + path.sep)) {
      throw new StorageKeyError("PATH_TRAVERSAL_BLOCKED", `Path traversal engellendi: ${key}`);
    }
    return full;
  }

  // contentType StorageDriver imzasinda vardir (S3Driver Content-Type header'i icin
  // kullanacak); local disk'te uzanti zaten .webp oldugundan gerekmez, bu yuzden bu
  // implementasyonda parametre alinmaz (TS daha az parametreli metodu kabul eder).
  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolveSafe(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async delete(key: string): Promise<void> {
    const full = this.resolveSafe(key);
    try {
      await unlink(full);
    } catch (err) {
      // Dosya yoksa sessizce basarili (idempotent silme); diger hatalar yukselir.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const full = this.resolveSafe(key);
    try {
      await access(full);
      return true;
    } catch {
      return false;
    }
  }
}
