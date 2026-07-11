import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalDiskDriver, StorageKeyError } from "../src/media/local-disk-driver.js";
import { buildStorageKey } from "../src/media/storage-key.js";

const VALID_KEY = "stores/store123/products/abc-uuid.webp";

describe("buildStorageKey", () => {
  it("entityId'siz dogru format uretir (products cogul)", () => {
    expect(buildStorageKey("store123", "PRODUCT", "abc-uuid")).toBe(
      "stores/store123/products/abc-uuid.webp",
    );
  });

  it("context segmentlerini dogru esler", () => {
    expect(buildStorageKey("s1", "CATEGORY", "u")).toBe("stores/s1/categories/u.webp");
    expect(buildStorageKey("s1", "HERO", "u")).toBe("stores/s1/hero/u.webp");
    expect(buildStorageKey("s1", "BRANDING", "u")).toBe("stores/s1/branding/u.webp");
  });

  it("uretilen key her zaman LocalDiskDriver regex'inden gecer (tur icin)", () => {
    // buildStorageKey ciktisi resolveSafe'te asla reddedilmemeli.
    const key = buildStorageKey("clabc123", "PRODUCT", "11111111-2222-3333");
    expect(key).toMatch(/^stores\/[a-z0-9]+\/products\/[^/]+\.webp$/);
  });
});

describe("LocalDiskDriver — path guvenligi (resolveSafe)", () => {
  let baseDir: string;
  let driver: LocalDiskDriver;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), "media-store-"));
    driver = new LocalDiskDriver(baseDir);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("../ iceren key → PATH_TRAVERSAL_BLOCKED", async () => {
    const evil = "stores/s1/products/../../../etc/passwd";
    await expect(driver.exists(evil)).rejects.toMatchObject({
      name: "StorageKeyError",
      code: "PATH_TRAVERSAL_BLOCKED",
    });
    await expect(driver.put(evil, Buffer.from("x"), "image/webp")).rejects.toMatchObject({
      code: "PATH_TRAVERSAL_BLOCKED",
    });
  });

  it("mutlak yol ile baslayan key → PATH_TRAVERSAL_BLOCKED", async () => {
    await expect(driver.exists("/etc/passwd")).rejects.toMatchObject({
      code: "PATH_TRAVERSAL_BLOCKED",
    });
  });

  it("entityId'li ESKI format (fazladan segment) → INVALID_STORAGE_KEY", async () => {
    // stores/{storeId}/products/{entityId}/{uuid}.webp — Adim 1/2'de terk edildi.
    await expect(
      driver.exists("stores/s1/products/entity1/abc-uuid.webp"),
    ).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
  });

  it("yanlis context → INVALID_STORAGE_KEY", async () => {
    await expect(driver.exists("stores/s1/avatars/u.webp")).rejects.toMatchObject({
      code: "INVALID_STORAGE_KEY",
    });
  });

  it(".webp olmayan uzanti → INVALID_STORAGE_KEY", async () => {
    await expect(driver.exists("stores/s1/products/u.png")).rejects.toMatchObject({
      code: "INVALID_STORAGE_KEY",
    });
  });

  it("firlatilan hata StorageKeyError ornegidir", async () => {
    await expect(driver.exists("stores/s1/products/../x.webp")).rejects.toBeInstanceOf(
      StorageKeyError,
    );
  });

  it("gecerli key → baseDir altinda dogru mutlak yola cozulur (put ile dolayli)", async () => {
    await driver.put(VALID_KEY, Buffer.from("hello"), "image/webp");
    const full = path.join(baseDir, VALID_KEY);
    const written = await readFile(full, "utf8");
    expect(written).toBe("hello");
    // Dosyanin baseDir sinirinda kaldigini teyit et.
    expect(full.startsWith(baseDir + path.sep)).toBe(true);
  });
});

describe("LocalDiskDriver — put/delete/exists (gercek fs)", () => {
  let baseDir: string;
  let driver: LocalDiskDriver;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), "media-store-"));
    driver = new LocalDiskDriver(baseDir);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("put ic ice dizinleri (mkdir -p) olusturur ve buffer'i yazar", async () => {
    expect(await driver.exists(VALID_KEY)).toBe(false);
    await driver.put(VALID_KEY, Buffer.from([1, 2, 3, 4]), "image/webp");
    expect(await driver.exists(VALID_KEY)).toBe(true);
    const info = await stat(path.join(baseDir, VALID_KEY));
    expect(info.size).toBe(4);
  });

  it("delete dosyayi siler", async () => {
    await driver.put(VALID_KEY, Buffer.from("x"), "image/webp");
    expect(await driver.exists(VALID_KEY)).toBe(true);
    await driver.delete(VALID_KEY);
    expect(await driver.exists(VALID_KEY)).toBe(false);
  });

  it("delete olmayan dosyada sessizce basarili (idempotent, ENOENT tolere)", async () => {
    await expect(driver.delete(VALID_KEY)).resolves.toBeUndefined();
  });

  it("exists olmayan dosya icin false doner", async () => {
    expect(await driver.exists("stores/s9/hero/none.webp")).toBe(false);
  });
});
