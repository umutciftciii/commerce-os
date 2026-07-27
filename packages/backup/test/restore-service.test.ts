import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { runRestore } from "../src/restore-service.js";
import { encryptFile } from "../src/crypto.js";
import { sha256File } from "../src/checksum.js";
import { fakePg, silentLogger, TEST_KEY } from "./helpers.js";

let dir: string;
const now = () => new Date("2026-07-28T21:03:05Z");
const TARGET = "postgresql://u:p@localhost:5433/restore_target";

async function makeArtifact(bytes: Buffer): Promise<{ enc: string; checksum: string }> {
  const raw = path.join(dir, "raw");
  const enc = path.join(dir, "artifact.dump.enc");
  await writeFile(raw, bytes);
  await encryptFile({ key: TEST_KEY, sourcePath: raw, destPath: enc });
  return { enc, checksum: await sha256File(enc) };
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "cmos-restore-t-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("runRestore", () => {
  const guard = { confirmDestructive: true, allowlistHosts: ["localhost"] };

  it("başarı: hedef reset + restore çağrılır", async () => {
    const { enc, checksum } = await makeArtifact(Buffer.from("PGDMP-FAKE"));
    const pg = fakePg() as ReturnType<typeof fakePg> & { calls: { reset: number; restore: number } };
    const result = await runRestore(
      { pg, logger: silentLogger, now },
      { file: enc, expectedChecksum: checksum, encryptionKey: TEST_KEY, targetUrl: TARGET, format: "custom", guard },
    );
    expect(result.targetHost).toBe("localhost");
    expect(pg.calls.reset).toBe(1);
    expect(pg.calls.restore).toBe(1);
  });

  it("onaysız → guard hatası (restore çalışmaz)", async () => {
    const { enc } = await makeArtifact(Buffer.from("x"));
    const pg = fakePg() as ReturnType<typeof fakePg> & { calls: { restore: number } };
    await expect(
      runRestore(
        { pg, logger: silentLogger, now },
        { file: enc, encryptionKey: TEST_KEY, targetUrl: TARGET, format: "custom", guard: { confirmDestructive: false } },
      ),
    ).rejects.toMatchObject({ code: "DESTRUCTIVE_CONFIRM_REQUIRED" });
    expect(pg.calls.restore).toBe(0);
  });

  it("checksum uyuşmazlığı → CHECKSUM_MISMATCH (restore yok)", async () => {
    const { enc } = await makeArtifact(Buffer.from("data"));
    const pg = fakePg() as ReturnType<typeof fakePg> & { calls: { restore: number } };
    await expect(
      runRestore(
        { pg, logger: silentLogger, now },
        { file: enc, expectedChecksum: "b".repeat(64), encryptionKey: TEST_KEY, targetUrl: TARGET, format: "custom", guard },
      ),
    ).rejects.toMatchObject({ code: "CHECKSUM_MISMATCH" });
    expect(pg.calls.restore).toBe(0);
  });

  it("yanlış anahtar → DECRYPT_FAILED (restore yok)", async () => {
    const { enc, checksum } = await makeArtifact(Buffer.from("data"));
    const pg = fakePg() as ReturnType<typeof fakePg> & { calls: { restore: number } };
    await expect(
      runRestore(
        { pg, logger: silentLogger, now },
        {
          file: enc,
          expectedChecksum: checksum,
          encryptionKey: randomBytes(32).toString("base64"),
          targetUrl: TARGET,
          format: "custom",
          guard,
        },
      ),
    ).rejects.toMatchObject({ code: "DECRYPT_FAILED" });
    expect(pg.calls.restore).toBe(0);
  });

  it("boş çözülmüş dump → EMPTY_DUMP", async () => {
    const { enc, checksum } = await makeArtifact(Buffer.alloc(0));
    const pg = fakePg();
    await expect(
      runRestore(
        { pg, logger: silentLogger, now },
        { file: enc, expectedChecksum: checksum, encryptionKey: TEST_KEY, targetUrl: TARGET, format: "custom", guard },
      ),
    ).rejects.toMatchObject({ code: "EMPTY_DUMP" });
  });

  it("--no-reset: hedef reset edilmez", async () => {
    const { enc, checksum } = await makeArtifact(Buffer.from("x"));
    const pg = fakePg() as ReturnType<typeof fakePg> & { calls: { reset: number } };
    await runRestore(
      { pg, logger: silentLogger, now },
      { file: enc, expectedChecksum: checksum, encryptionKey: TEST_KEY, targetUrl: TARGET, format: "custom", resetTarget: false, guard },
    );
    expect(pg.calls.reset).toBe(0);
  });
});
