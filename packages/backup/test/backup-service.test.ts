import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runBackup } from "../src/backup-service.js";
import { createLocalStorageAdapter } from "../src/storage/local.js";
import { parseManifest, assertManifestHasNoSecrets } from "../src/manifest.js";
import type { StorageAdapter } from "../src/storage/types.js";
import { fakePg, baseConfig, silentLogger, TEST_KEY } from "./helpers.js";

let localDir: string;
let offsiteDir: string;
const now = () => new Date("2026-07-28T21:03:05Z");

beforeEach(async () => {
  localDir = await mkdtemp(path.join(tmpdir(), "cmos-bk-local-"));
  offsiteDir = await mkdtemp(path.join(tmpdir(), "cmos-bk-offsite-"));
});
afterEach(async () => {
  await rm(localDir, { recursive: true, force: true });
  await rm(offsiteDir, { recursive: true, force: true });
});

describe("runBackup", () => {
  it("başarı: encrypt + local artefakt + offsite upload + remote HEAD doğrulama", async () => {
    const storage = createLocalStorageAdapter(offsiteDir);
    const result = await runBackup({
      cfg: baseConfig({ localDir }),
      pg: fakePg(),
      storage,
      logger: silentLogger,
      now,
      migrationInfo: { count: 62, latest: "20260727160000_customer_erasure" },
    });
    expect(result.outcome).toBe("COMPLETED");
    expect(result.remoteVerified).toBe(true);
    expect(result.base).toBe("test-20260728T210305Z");

    // Local artefaktlar + offsite kopyalar mevcut.
    const localFiles = await readdir(localDir);
    expect(localFiles).toContain("test-20260728T210305Z.dump.enc");
    expect(localFiles).toContain("test-20260728T210305Z.dump.enc.sha256");
    expect(localFiles).toContain("test-20260728T210305Z.manifest.json");
    // Ham dump temp'i temizlendi (yalnız final artefaktlar).
    expect(localFiles.filter((f) => f.includes(".part") || f.endsWith(".raw"))).toHaveLength(0);
    const offsiteFiles = await readdir(offsiteDir);
    expect(offsiteFiles).toContain("test-20260728T210305Z.dump.enc");

    // Manifest: secret yok + PII sınıflandırması.
    const manifestJson = await readFile(path.join(localDir, "test-20260728T210305Z.manifest.json"), "utf8");
    assertManifestHasNoSecrets(manifestJson);
    const manifest = parseManifest(manifestJson);
    expect(manifest.status).toBe("COMPLETED");
    expect(manifest.migration.latest).toBe("20260727160000_customer_erasure");
    expect(manifest.encryption.method).toBe("AES-256-GCM");
  });

  it("zero-byte dump → EMPTY_DUMP + temp temizlenir", async () => {
    await expect(
      runBackup({
        cfg: baseConfig({ localDir }),
        pg: fakePg({ dumpBytes: null }),
        storage: createLocalStorageAdapter(offsiteDir),
        logger: silentLogger,
        now,
      }),
    ).rejects.toMatchObject({ code: "EMPTY_DUMP" });
    const localFiles = await readdir(localDir).catch(() => []);
    expect(localFiles.filter((f) => f.includes(".part") || f.endsWith(".raw"))).toHaveLength(0);
  });

  it("dump komut hatası propagate olur", async () => {
    const pg = fakePg();
    pg.dump = async () => {
      throw new Error("pg_dump: connection refused");
    };
    await expect(
      runBackup({ cfg: baseConfig({ localDir }), pg, storage: null, logger: silentLogger, now }),
    ).rejects.toThrow(/connection refused/);
  });

  it("encryption anahtarı yoksa fail-closed (ENCRYPTION_KEY_MISSING)", async () => {
    await expect(
      runBackup({
        cfg: baseConfig({ localDir, encryptionKey: undefined }),
        pg: fakePg(),
        storage: createLocalStorageAdapter(offsiteDir),
        logger: silentLogger,
        now,
      }),
    ).rejects.toMatchObject({ code: "ENCRYPTION_KEY_MISSING" });
  });

  it("production + offsite yok → OFFSITE_REQUIRED (yalnız-local başarısız)", async () => {
    await expect(
      runBackup({
        cfg: baseConfig({ localDir, isProduction: true, requireOffsiteInProduction: true, appEnv: "production" }),
        pg: fakePg(),
        storage: null,
        logger: silentLogger,
        now,
      }),
    ).rejects.toMatchObject({ code: "OFFSITE_REQUIRED" });
  });

  it("remote HEAD boyut uyuşmazlığı → REMOTE_SIZE_MISMATCH", async () => {
    const inner = createLocalStorageAdapter(offsiteDir);
    const badHead: StorageAdapter = {
      ...inner,
      async head(key) {
        const h = await inner.head(key);
        return h ? { ...h, size: h.size + 999 } : null;
      },
    };
    await expect(
      runBackup({ cfg: baseConfig({ localDir }), pg: fakePg(), storage: badHead, logger: silentLogger, now }),
    ).rejects.toMatchObject({ code: "REMOTE_SIZE_MISMATCH" });
  });

  it("dry-run: hiç artefakt üretmez, DRY_RUN döner", async () => {
    const result = await runBackup(
      { cfg: baseConfig({ localDir }), pg: fakePg(), storage: createLocalStorageAdapter(offsiteDir), logger: silentLogger, now },
      { dryRun: true },
    );
    expect(result.outcome).toBe("DRY_RUN");
    const localFiles = await readdir(localDir).catch(() => []);
    expect(localFiles).toHaveLength(0);
  });

  it("üretilen artefakt gerçekten çözülebilir (encrypt↔decrypt tutarlı)", async () => {
    const result = await runBackup({
      cfg: baseConfig({ localDir }),
      pg: fakePg({ dumpBytes: Buffer.from("KNOWN-DUMP-BODY-123") }),
      storage: createLocalStorageAdapter(offsiteDir),
      logger: silentLogger,
      now,
    });
    const { decryptFile } = await import("../src/crypto.js");
    const out = path.join(localDir, "decrypted");
    await decryptFile({ key: TEST_KEY, sourcePath: result.localPaths!.dump, destPath: out });
    expect(await readFile(out, "utf8")).toBe("KNOWN-DUMP-BODY-123");
  });
});
