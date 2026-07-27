import { describe, it, expect } from "vitest";
import { parsePgConnection, createDirectPgToolRunner, createDockerPgToolRunner } from "../src/pg.js";
import { sha256File } from "../src/checksum.js";
import { formatChecksumFile, parseChecksumFile, checksumsMatch } from "../src/checksum.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("parsePgConnection", () => {
  it("URL'i bileşenlere çözer (parola decode)", () => {
    const c = parsePgConnection("postgresql://user:p%40ss@db.host:5433/appdb?sslmode=require");
    expect(c).toMatchObject({ host: "db.host", port: 5433, user: "user", password: "p@ss", database: "appdb", sslmode: "require" });
  });
  it("özel karakterli db adı TEK alan olarak kalır (shell'e bölünmez)", () => {
    // Enjeksiyon-benzeri değer bir arg-array elemanı olarak taşınır; parse onu parçalamaz.
    const c = parsePgConnection("postgresql://u:p@localhost/db%3B%20DROP");
    expect(c.database).toBe("db; DROP");
  });
  it("postgres olmayan şema reddedilir", () => {
    expect(() => parsePgConnection("mysql://u:p@h/db")).toThrow();
  });
});

describe("pg runner describe (secret sızmaz)", () => {
  it("direct/docker describe parola içermez", () => {
    expect(createDirectPgToolRunner().describe).toBe("direct(PATH)");
    expect(createDockerPgToolRunner({ image: "postgres:16-alpine" }).describe).not.toMatch(/password|pass/i);
  });
});

describe("checksum yardımcıları", () => {
  it("sha256File + format/parse roundtrip", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cmos-sum-"));
    try {
      const f = path.join(dir, "x");
      await writeFile(f, "hello");
      const hex = await sha256File(f);
      expect(hex).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
      const line = formatChecksumFile(hex, "x");
      expect(parseChecksumFile(line)).toBe(hex);
      expect(checksumsMatch(hex, hex.toUpperCase())).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
