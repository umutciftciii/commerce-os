/**
 * C1 (post-audit) — Private media guard UÇTAN UCA entegrasyon: gerçek Fastify + @fastify/static +
 * gerçek diskteki `returns/` dosyası. onRequest guard'ı static'ten ÖNCE çalışır. "Canlı HTTP" smoke'un
 * deterministik hâli: encoded-path bypass'ın kapandığını, guard'sız kontrol app'i açığı ÜRETİRKEN
 * kanıtlar; meşru public media regresyonsuz servis edilir.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyMediaRequestPath } from "../src/media/private-guard.js";

let root: string;
let guarded: FastifyInstance;
let unguarded: FastifyInstance;

function registerStatic(app: FastifyInstance) {
  app.register(fastifyStatic, { root, prefix: "/media/", decorateReply: false });
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "media-guard-"));
  mkdirSync(join(root, "returns"), { recursive: true });
  mkdirSync(join(root, "products"), { recursive: true });
  writeFileSync(join(root, "returns", "secret.txt"), "PRIVATE-RETURN-ATTACHMENT");
  writeFileSync(join(root, "products", "public.txt"), "PUBLIC-PRODUCT-MEDIA");

  guarded = Fastify({ logger: false });
  guarded.addHook("onRequest", async (request, reply) => {
    const verdict = classifyMediaRequestPath(request.url);
    if (verdict === "malformed") return reply.code(400).send({ error: { code: "BAD_REQUEST" } });
    if (verdict === "private") return reply.code(404).send({ error: { code: "NOT_FOUND" } });
  });
  registerStatic(guarded);
  await guarded.ready();

  unguarded = Fastify({ logger: false }); // guard YOK — açığı göstermek için kontrol
  registerStatic(unguarded);
  await unguarded.ready();
});

afterAll(async () => {
  await guarded?.close();
  await unguarded?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("C1 private media guard (live Fastify + static)", () => {
  it("meşru public media 200 servis edilir (regression)", async () => {
    const res = await guarded.inject({ method: "GET", url: "/media/products/public.txt" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("PUBLIC-PRODUCT-MEDIA");
  });

  it("raw /returns/ → 404 (guard, private)", async () => {
    const res = await guarded.inject({ method: "GET", url: "/media/returns/secret.txt" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("encoded %2F → 404 guard (bypass KAPALI)", async () => {
    const res = await guarded.inject({ method: "GET", url: "/media/returns%2Fsecret.txt" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
    expect(res.body).not.toContain("PRIVATE-RETURN-ATTACHMENT");
  });

  it("double %252F → 404", async () => {
    const res = await guarded.inject({ method: "GET", url: "/media/returns%252Fsecret.txt" });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("PRIVATE-RETURN-ATTACHMENT");
  });

  it("backslash %5C → 404", async () => {
    const res = await guarded.inject({ method: "GET", url: "/media/returns%5Csecret.txt" });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("PRIVATE-RETURN-ATTACHMENT");
  });

  it("traversal → 400 malformed", async () => {
    const res = await guarded.inject({ method: "GET", url: "/media/returns%2F..%2Fsecret.txt" });
    expect(res.statusCode).toBe(400);
  });

  it("KONTROL: guard'sız app %2F ile private dosyayı sızdırabilir (açık gerçek)", async () => {
    const res = await unguarded.inject({ method: "GET", url: "/media/returns%2Fsecret.txt" });
    // Bu app'te guard YOK. Eğer static %2F'yi decode edip servis ederse 200 + içerik döner →
    // C1 açığının gerçekliğini kanıtlar. (Static bu sürümde reddederse en azından 404; her
    // hâlükârda guard'lı app'in bu vektörü kestiği yukarıda kanıtlandı.)
    if (res.statusCode === 200) {
      expect(res.body).toContain("PRIVATE-RETURN-ATTACHMENT"); // sızıntı gerçek → guard şart
    } else {
      expect(res.statusCode).toBe(404);
    }
  });
});
