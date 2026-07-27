/**
 * PB-2/PB-3 — Yerel dosya-sistemi storage adapter'ı.
 *
 * Kullanım: (1) birim testlerde S3 fake'i, (2) yerel "disk" katmanı, (3) MinIO'suz local smoke.
 * Kök dizin dışına yazma/okuma path-traversal guard'ı ile engellenir.
 */
import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { ListedObject, StorageAdapter } from "./types.js";

export function createLocalStorageAdapter(root: string): StorageAdapter {
  const rootAbs = path.resolve(root);

  function resolveKey(key: string): string {
    const target = path.resolve(rootAbs, key);
    const rel = path.relative(rootAbs, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`local storage: key kök dizin dışına çıkamaz (${JSON.stringify(key)}).`);
    }
    return target;
  }

  return {
    kind: "local",
    describe: `local://${rootAbs}`,
    async putFile(key, filePath, opts) {
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(filePath, target);
      const s = await stat(target);
      return { key, size: s.size, sha256: opts?.sha256 };
    },
    async getToFile(key, destPath) {
      const target = resolveKey(key);
      await mkdir(path.dirname(path.resolve(destPath)), { recursive: true });
      await copyFile(target, destPath);
    },
    async head(key) {
      try {
        const s = await stat(resolveKey(key));
        return { key, size: s.size };
      } catch {
        return null;
      }
    },
    async list(prefix) {
      const out: ListedObject[] = [];
      async function walk(dir: string): Promise<void> {
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          const abs = path.join(dir, e.name);
          if (e.isDirectory()) {
            await walk(abs);
          } else if (e.isFile()) {
            const key = path.relative(rootAbs, abs).split(path.sep).join("/");
            if (key.startsWith(prefix)) {
              const s = await stat(abs);
              out.push({ key, size: s.size, lastModified: s.mtime });
            }
          }
        }
      }
      await walk(rootAbs);
      return out.sort((a, b) => a.key.localeCompare(b.key));
    },
    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },
  };
}
