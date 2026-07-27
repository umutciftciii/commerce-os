import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalStorageAdapter } from "../src/storage/local.js";
import { runRetention } from "../src/retention-service.js";
import { silentLogger } from "./helpers.js";

let dir: string;

/** Verilen base için tam (COMPLETED) artefakt üçlüsü yaz. */
async function writeSet(root: string, base: string, complete = true): Promise<void> {
  await writeFile(path.join(root, `${base}.dump.enc`), "enc");
  await writeFile(path.join(root, `${base}.dump.enc.sha256`), "sum");
  if (complete) await writeFile(path.join(root, `${base}.manifest.json`), "{}");
}

function base(dayIso: string): string {
  return `test-${dayIso}`;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "cmos-ret-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("runRetention", () => {
  const bases = [
    base("20260720T120000Z"),
    base("20260721T120000Z"),
    base("20260722T120000Z"),
    base("20260723T120000Z"),
    base("20260724T120000Z"),
  ];

  it("dry-run: hiçbir dosya silinmez, purge planı raporlanır", async () => {
    for (const b of bases) await writeSet(dir, b);
    const report = await runRetention({
      offsite: createLocalStorageAdapter(dir),
      prefix: "",
      policy: { daily: 2, weekly: 0, monthly: 0, minKeep: 1 },
      dryRun: true,
      logger: silentLogger,
    });
    expect(report.dryRun).toBe(true);
    expect(report.offsite.retained).toHaveLength(2);
    expect(report.offsite.purged.length).toBe(3);
    expect(report.offsite.purged.every((p) => p.deleted === false)).toBe(true);
    // Dosyalar duruyor.
    expect((await readdir(dir)).length).toBe(bases.length * 3);
  });

  it("apply: purge edilecek setlerin tüm dosyaları silinir; en yeni korunur", async () => {
    for (const b of bases) await writeSet(dir, b);
    const report = await runRetention({
      offsite: createLocalStorageAdapter(dir),
      prefix: "",
      policy: { daily: 2, weekly: 0, monthly: 0, minKeep: 1 },
      dryRun: false,
      logger: silentLogger,
    });
    expect(report.offsite.purged.every((p) => p.deleted === true)).toBe(true);
    const remaining = await readdir(dir);
    // En yeni iki gün (24, 23) korunur → 2*3 dosya.
    expect(remaining.some((f) => f.includes("20260724T120000Z"))).toBe(true);
    expect(remaining.some((f) => f.includes("20260720T120000Z"))).toBe(false);
    expect(remaining.length).toBe(2 * 3);
  });

  it("yarım set (manifest yok) retention'a girmez → incomplete", async () => {
    for (const b of bases.slice(0, 2)) await writeSet(dir, b);
    await writeSet(dir, base("20260725T120000Z"), false); // manifest yok → PARTIAL
    const report = await runRetention({
      offsite: createLocalStorageAdapter(dir),
      prefix: "",
      policy: { daily: 14, weekly: 8, monthly: 12, minKeep: 1 },
      dryRun: true,
      logger: silentLogger,
    });
    expect(report.offsite.incomplete).toContain("test-20260725T120000Z");
    expect(report.offsite.retained).not.toContain("test-20260725T120000Z");
  });

  it("local dahil edilince parity raporlanır", async () => {
    const offsiteDir = dir;
    const localDir = await mkdtemp(path.join(tmpdir(), "cmos-ret-local-"));
    try {
      await writeSet(offsiteDir, bases[0]!);
      await writeSet(offsiteDir, bases[1]!);
      await writeSet(localDir, bases[1]!);
      await writeSet(localDir, bases[2]!); // yalnız local
      const report = await runRetention({
        offsite: createLocalStorageAdapter(offsiteDir),
        prefix: "",
        policy: { daily: 14, weekly: 8, monthly: 12, minKeep: 1 },
        dryRun: true,
        local: { adapter: createLocalStorageAdapter(localDir), prefix: "" },
        logger: silentLogger,
      });
      expect(report.parity?.onlyLocal).toContain(bases[2]);
      expect(report.parity?.onlyRemote).toContain(bases[0]);
    } finally {
      await rm(localDir, { recursive: true, force: true });
    }
  });
});
