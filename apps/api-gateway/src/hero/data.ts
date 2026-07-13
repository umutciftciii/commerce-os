/**
 * ADR-065 (Faz 2/Dilim 5) — Ana sayfa hero slide veri erisimi.
 *
 * HeroSlide COKLU kayittir (tam CRUD); her slide birincil entity, media yalnizca
 * bir alani. Tum sorgular store-scoped'tur; baska magazanin slide'i GORUNMEZ (404).
 *
 * Bu checkpoint (A) yalniz CRUD temeli: create/read/update/delete. Siralama
 * (reorder) ve yayin gecisi (publish/unpublish) ayri checkpoint'lerdir; bu yuzden
 * status daima sunucu default'u DRAFT ile create edilir. position sunucu tarafinda
 * atanir (mevcut max+1) — istemci gondermez.
 *
 * R5: deleteHeroSlide yalniz HeroSlide satirini siler; bagli MediaAsset'e DOKUNMAZ
 * (media baska yerde de kullanilabilir; media'nin kendisini silmek ayri akis +
 * 409 MEDIA_IN_USE guard'i). Prisma'daki media onDelete:Cascade yalniz media->slide
 * yonundedir; slide silince media silinmez.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import { heroSlideSchema, publicHeroSlideSchema, type ContentStatus } from "@commerce-os/contracts";
// mediaUrl'u storageKey'den turetmek icin (kategori imageUrl / urun galeri url
// deseniyle tutarli). "storageKey sakla, URL turet" ilkesi.
import { resolveMediaUrl } from "../media/url.js";

export type HeroSlideRecord = {
  id: string;
  mediaId: string;
  position: number;
  status: ContentStatus;
  headline: string | null;
  subtext: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  media: { storageKey: string };
};

// mediaUrl'u turetmek icin media.storageKey relation'i her zaman cekilir.
const heroSlideSelect = {
  id: true,
  mediaId: true,
  position: true,
  status: true,
  headline: true,
  subtext: true,
  ctaLabel: true,
  ctaHref: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  updatedAt: true,
  media: { select: { storageKey: true } },
} satisfies Prisma.HeroSlideSelect;

// Route katmanindan gelen normalize edilmis create girdisi (startsAt/endsAt zaten
// Date | null'a cevrilmis). position burada YOK — sunucu max+1 ile atar.
export interface HeroSlideCreateInput {
  mediaId: string;
  status?: ContentStatus;
  headline?: string | null;
  subtext?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export interface HeroSlideUpdateInput {
  mediaId?: string;
  status?: ContentStatus;
  headline?: string | null;
  subtext?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export interface HeroDataAccess {
  listHeroSlides(storeId: string): Promise<HeroSlideRecord[]>;
  // ADR-065 (Faz 3/Site Kabuğu) — Public vitrin: yalniz PUBLISHED slide'lar,
  // position ASC. DRAFT DB SORGUSUNDA elenir (route'ta degil) → hic yuklenmez;
  // @@index([storeId, status]) kullanilir. Admin listHeroSlides tum durumlari doner.
  listPublishedHeroSlides(storeId: string): Promise<HeroSlideRecord[]>;
  findHeroSlideById(storeId: string, id: string): Promise<HeroSlideRecord | null>;
  // Media guard icin: mediaId ayni store'a ait mi + context'i ne? Bulunamazsa null.
  findMediaAssetById(
    storeId: string,
    mediaId: string,
  ): Promise<{ id: string; context: string } | null>;
  createHeroSlide(storeId: string, input: HeroSlideCreateInput): Promise<HeroSlideRecord>;
  updateHeroSlide(
    storeId: string,
    id: string,
    input: HeroSlideUpdateInput,
  ): Promise<HeroSlideRecord | null>;
  // R5: yalniz slide kaydini siler. Bulunamazsa false (404'e cevrilir).
  deleteHeroSlide(storeId: string, id: string): Promise<boolean>;
  // Checkpoint B — sirali id listesine gore position=index yazar. id-seti mevcut
  // slide setiyle BIREBIR eslesmezse "MISMATCH" (silme YOK; galeri diff'inin aksine).
  reorderHeroSlides(storeId: string, orderedIds: string[]): Promise<HeroSlideRecord[] | "MISMATCH">;
  // Checkpoint C — yayin durumu gecisi (DRAFT<->PUBLISHED). Bulunamazsa null.
  setHeroSlideStatus(
    storeId: string,
    id: string,
    status: ContentStatus,
  ): Promise<HeroSlideRecord | null>;
}

export function createPrismaHeroDataAccess(): HeroDataAccess {
  return {
    listHeroSlides: (storeId) =>
      prisma.heroSlide.findMany({
        where: { storeId },
        orderBy: { position: "asc" },
        select: heroSlideSelect,
      }),
    // ADR-065 (Faz 3/Site Kabuğu) — public carousel. status="PUBLISHED" WHERE
    // filtresi DB seviyesindedir; DRAFT satirlar hic okunmaz (route filtresi degil).
    listPublishedHeroSlides: (storeId) =>
      prisma.heroSlide.findMany({
        where: { storeId, status: "PUBLISHED" },
        orderBy: { position: "asc" },
        select: heroSlideSelect,
      }),
    findHeroSlideById: (storeId, id) =>
      prisma.heroSlide.findFirst({ where: { id, storeId }, select: heroSlideSelect }),
    findMediaAssetById: (storeId, mediaId) =>
      prisma.mediaAsset.findFirst({
        where: { id: mediaId, storeId },
        select: { id: true, context: true },
      }),
    // position = mevcut max+1 (sona ekle). Transaction icinde okunup yazilir; hero
    // dusuk hacimli oldugundan bu yeterli (siralama ayri checkpoint'te ele alinir).
    createHeroSlide: (storeId, input) =>
      prisma.$transaction(async (transaction) => {
        const max = await transaction.heroSlide.aggregate({
          where: { storeId },
          _max: { position: true },
        });
        return transaction.heroSlide.create({
          data: {
            storeId,
            position: (max._max.position ?? -1) + 1,
            mediaId: input.mediaId,
            status: input.status ?? "DRAFT",
            headline: input.headline ?? null,
            subtext: input.subtext ?? null,
            ctaLabel: input.ctaLabel ?? null,
            ctaHref: input.ctaHref ?? null,
            startsAt: input.startsAt ?? null,
            endsAt: input.endsAt ?? null,
          },
          select: heroSlideSelect,
        });
      }),
    updateHeroSlide: async (storeId, id, input) => {
      try {
        // where: { id, storeId } — id PK, storeId ek tenant filtresi (kategori
        // updateCategory deseni). Store eslesmezse P2025 -> null (izolasyon).
        return await prisma.heroSlide.update({
          where: { id, storeId },
          data: input,
          select: heroSlideSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return null;
        }
        throw error;
      }
    },
    deleteHeroSlide: async (storeId, id) => {
      try {
        await prisma.heroSlide.delete({ where: { id, storeId } });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return false;
        }
        throw error;
      }
    },
    // Checkpoint B — position=index. Mevcut id-seti transaction icinde okunur ve
    // gonderilen sirali listeyle BIREBIR karsilastirilir (orderedIds contract'ta
    // unique; length === mevcut sayi + hepsi mevcut → esit set). Uyumsuzsa hicbir
    // yazim yapmadan "MISMATCH" doner (silme YOK).
    reorderHeroSlides: (storeId, orderedIds) =>
      prisma.$transaction(async (transaction) => {
        const existing = await transaction.heroSlide.findMany({
          where: { storeId },
          select: { id: true },
        });
        const existingIds = new Set(existing.map((slide) => slide.id));
        if (orderedIds.length !== existingIds.size || !orderedIds.every((id) => existingIds.has(id))) {
          return "MISMATCH" as const;
        }
        for (const [index, id] of orderedIds.entries()) {
          await transaction.heroSlide.update({
            where: { id },
            data: { position: index },
            select: { id: true },
          });
        }
        return transaction.heroSlide.findMany({
          where: { storeId },
          orderBy: { position: "asc" },
          select: heroSlideSelect,
        });
      }),
    setHeroSlideStatus: async (storeId, id, status) => {
      try {
        return await prisma.heroSlide.update({
          where: { id, storeId },
          data: { status },
          select: heroSlideSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return null;
        }
        throw error;
      }
    },
  };
}

// mediaUrl runtime'da storageKey'den turetilir; startsAt/endsAt ISO string'e cevrilir
// (semada var, Dilim 5 UI'i yonetmez ama response'ta dogru serialize edilir).
export function serializeHeroSlide(record: HeroSlideRecord, baseUrl?: string) {
  return heroSlideSchema.parse({
    id: record.id,
    mediaId: record.mediaId,
    mediaUrl: resolveMediaUrl(baseUrl, record.media.storageKey),
    position: record.position,
    status: record.status,
    headline: record.headline,
    subtext: record.subtext,
    ctaLabel: record.ctaLabel,
    ctaHref: record.ctaHref,
    startsAt: record.startsAt ? record.startsAt.toISOString() : null,
    endsAt: record.endsAt ? record.endsAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

/**
 * ADR-065 (Faz 3/Site Kabuğu) — Public hero slide projeksiyonu (ALLOWLIST).
 * mediaUrl storageKey'den turetilir; `key` opaque slide id (React list key).
 * `mediaId`, `status`, zamanlama (startsAt/endsAt) ve createdAt/updatedAt BILINCLI
 * olarak TASINMAZ — admin serializeHeroSlide bunlari tasir, public karsiligi
 * tasimaz. publicHeroSlideSchema.parse cikti allowlist'ini ikinci kez garanti eder
 * (urun galerisi buildPublicProduct deseniyle tutarli).
 */
export function serializePublicHeroSlide(record: HeroSlideRecord, baseUrl?: string) {
  return publicHeroSlideSchema.parse({
    key: record.id,
    mediaUrl: resolveMediaUrl(baseUrl, record.media.storageKey),
    headline: record.headline,
    subtext: record.subtext,
    ctaLabel: record.ctaLabel,
    ctaHref: record.ctaHref,
    position: record.position,
  });
}
