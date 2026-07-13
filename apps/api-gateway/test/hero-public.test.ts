import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ADR-065 (Faz 3/Site Kabuğu) — Public hero veri erisimi + projeksiyon birim
 * testleri. İki ALLOWLIST/izolasyon garantisi:
 *  1. listPublishedHeroSlides DB SORGUSUNDA status="PUBLISHED" filtreler → DRAFT
 *     hic yuklenmez (route filtresi degil; sizinti kokten imkansiz).
 *  2. serializePublicHeroSlide yalniz public-safe alanlari tasir; mediaId/status/
 *     zamanlama/timestamp'ler BILINCLI olarak DISARIDA.
 */

// data.ts -> @commerce-os/db (prisma) import eder; heroSlide.findMany'yi hoisted
// mock ile enjekte ediyoruz (gercek prisma init'i olmadan sorgu argumanini dogrula).
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@commerce-os/db", () => ({ prisma: { heroSlide: { findMany } } }));

const { createPrismaHeroDataAccess, serializePublicHeroSlide } = await import("../src/hero/data.js");

// Tam admin kaydi — DRAFT-ozel ve ic alanlar (mediaId/status/startsAt/timestamp)
// dahil; public serializer bunlari DUSURMELI.
const RECORD = {
  id: "hero_1",
  mediaId: "media_1",
  position: 2,
  status: "PUBLISHED" as const,
  headline: "Yaz koleksiyonu",
  subtext: "Yeni sezon",
  ctaLabel: "Keşfet",
  ctaHref: "/products",
  startsAt: new Date("2026-07-01T00:00:00.000Z"),
  endsAt: new Date("2026-08-01T00:00:00.000Z"),
  createdAt: new Date("2026-07-11T00:00:00.000Z"),
  updatedAt: new Date("2026-07-11T00:00:00.000Z"),
  media: { storageKey: "stores/store_123/hero/abc.webp" },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("serializePublicHeroSlide (ALLOWLIST)", () => {
  it("yalniz public-safe alanlari tasir; mediaId/status/zamanlama/timestamp SIZMAZ", () => {
    const out = serializePublicHeroSlide(RECORD, undefined);

    // Cikti anahtar seti BIREBIR allowlist (fazla/eksik yok).
    expect(Object.keys(out).sort()).toEqual(
      ["ctaHref", "ctaLabel", "headline", "key", "mediaUrl", "position", "subtext"].sort(),
    );
    // Hassas/ic alanlar KESINLIKLE yok.
    for (const leaked of ["mediaId", "status", "startsAt", "endsAt", "createdAt", "updatedAt"]) {
      expect(out).not.toHaveProperty(leaked);
    }
    // key = opaque slide id; mediaUrl storageKey'den turetilir; position korunur.
    expect(out).toEqual({
      key: "hero_1",
      mediaUrl: "/media/stores/store_123/hero/abc.webp",
      headline: "Yaz koleksiyonu",
      subtext: "Yeni sezon",
      ctaLabel: "Keşfet",
      ctaHref: "/products",
      position: 2,
    });
  });

  it("mediaBaseUrl verilince mutlak URL turetir (CDN kokune isaret)", () => {
    const out = serializePublicHeroSlide(RECORD, "https://cdn.example.com");
    expect(out.mediaUrl).toBe("https://cdn.example.com/stores/store_123/hero/abc.webp");
  });
});

describe("listPublishedHeroSlides (DB-seviyesi PUBLISHED filtresi)", () => {
  it("where status=PUBLISHED + position ASC; DRAFT satirlar sorgu tarafinda elenir", async () => {
    findMany.mockResolvedValue([RECORD]);
    const data = createPrismaHeroDataAccess();

    const result = await data.listPublishedHeroSlides("store_123");

    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0];
    // KRITIK: WHERE status="PUBLISHED" → DRAFT hic okunmaz (route filtresi degil).
    expect(arg.where).toEqual({ storeId: "store_123", status: "PUBLISHED" });
    expect(arg.orderBy).toEqual({ position: "asc" });
    expect(result).toEqual([RECORD]);
  });
});
