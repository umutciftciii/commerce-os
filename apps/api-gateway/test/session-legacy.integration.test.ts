/**
 * M1 / T1 (post-audit) — Legacy session cutover GERÇEK-DB entegrasyon testi.
 *
 * Migration `policyVersion` kolonu + ADR-271 policy'sinin BİRLİKTE davranışını gerçek DB satırlarına
 * karşı doğrular: pre-ADR (legacy) oturum deploy'da düşmez, absolute korunur, ilk aktivitede native'e
 * terfi eder ve absolute'u aşmaz, expired legacy dirilmez. (Saf policy testleri config'te.)
 *
 * DATABASE_URL verilmezse SKIP (CI-safe).
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@commerce-os/db";
import {
  DEFAULT_SESSION_POLICY,
  effectiveAbsolute,
  isLegacySession,
  isSessionValid,
} from "@commerce-os/config";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const P = DEFAULT_SESSION_POLICY;
const HOUR = 60 * 60 * 1000;

describe.skipIf(!hasTestDb)("Legacy session cutover (live DB)", () => {
  let storeId: string | null = null;
  afterEach(async () => {
    if (storeId) await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    storeId = null;
  });

  /** Legacy (policyVersion=0) bir CustomerSession seed'ler; lastActivityAt/absolute ayarlanabilir. */
  async function seedLegacySession(opts: { lastActivityAt: Date; absoluteExpiresAt: Date }) {
    const sfx = randomUUID().slice(0, 12);
    storeId = `test-store-${sfx}`;
    const customerId = `test-cust-${sfx}`;
    await prisma.store.create({ data: { id: storeId, name: `S ${sfx}`, slug: `s-${sfx}` } });
    await prisma.customer.create({ data: { id: customerId, storeId, email: `c-${sfx}@x.test`, status: "ACTIVE" } });
    const session = await prisma.customerSession.create({
      data: {
        id: `test-sess-${sfx}`,
        storeId,
        customerId,
        tokenHash: `hash-${sfx}`,
        expiresAt: opts.absoluteExpiresAt,
        lastActivityAt: opts.lastActivityAt,
        absoluteExpiresAt: opts.absoluteExpiresAt,
        rememberMe: false,
        policyVersion: 0, // pre-ADR (grandfathered) satır
      },
    });
    return session.id;
  }

  async function reload(id: string) {
    const s = await prisma.customerSession.findUniqueOrThrow({
      where: { id },
      select: { lastActivityAt: true, absoluteExpiresAt: true, expiresAt: true, rememberMe: true, revokedAt: true, policyVersion: true },
    });
    return s;
  }

  it("legacy satır DB'de policyVersion=0 (grandfathered) olarak tanınır", async () => {
    const now = new Date();
    const id = await seedLegacySession({ lastActivityAt: new Date(now.getTime() - 2 * HOUR), absoluteExpiresAt: new Date(now.getTime() + HOUR) });
    const s = await reload(id);
    expect(isLegacySession(s)).toBe(true);
  });

  it("cutover: idle çok eski OLSA BİLE absolute içinde GEÇERLİ (silent logout YOK)", async () => {
    const now = new Date();
    // lastActivityAt 2 saat önce (native idle 30dk'yi aşar) ama absolute 1 saat ileride.
    const id = await seedLegacySession({ lastActivityAt: new Date(now.getTime() - 2 * HOUR), absoluteExpiresAt: new Date(now.getTime() + HOUR) });
    const s = await reload(id);
    expect(isSessionValid(P, s, now)).toBe(true);
  });

  it("ilk aktivitede native'e terfi + taze idle; absolute ASMAZ", async () => {
    const now = new Date();
    const absolute = new Date(now.getTime() + HOUR);
    const id = await seedLegacySession({ lastActivityAt: new Date(now.getTime() - 2 * HOUR), absoluteExpiresAt: absolute });
    // Promotion (touchSessionActivity(promote=true) davranışı): policyVersion=1 + lastActivityAt=now.
    await prisma.customerSession.updateMany({ where: { id, revokedAt: null }, data: { lastActivityAt: now, policyVersion: 1 } });
    const s = await reload(id);
    expect(isLegacySession(s)).toBe(false); // artık native
    expect(s.policyVersion).toBe(1);
    expect(effectiveAbsolute(s).getTime()).toBe(absolute.getTime()); // absolute DEĞİŞMEDİ
    expect(isSessionValid(P, s, now)).toBe(true);
  });

  it("expired legacy (absolute geçmişte) GEÇERSİZ — dirilmez", async () => {
    const now = new Date();
    const id = await seedLegacySession({ lastActivityAt: new Date(now.getTime() - 3 * HOUR), absoluteExpiresAt: new Date(now.getTime() - HOUR) });
    const s = await reload(id);
    expect(isSessionValid(P, s, now)).toBe(false);
  });

  it("revoked legacy GEÇERSİZ", async () => {
    const now = new Date();
    const id = await seedLegacySession({ lastActivityAt: now, absoluteExpiresAt: new Date(now.getTime() + HOUR) });
    await prisma.customerSession.update({ where: { id }, data: { revokedAt: now } });
    const s = await reload(id);
    expect(isSessionValid(P, s, now)).toBe(false);
  });
});
