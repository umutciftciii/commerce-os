// TODO-165A (ADR-165A) — Product Data Governance: Brand (Marka) servisi (tek yazar).
//
// Store-scoped CRUD + arsivle/geri-al + secici (dual `?ids=` modu). Slug @commerce-os/utils
// `slugify`den turetilir; tekillik store-scoped (`@@unique([storeId, slug])`) ve cakisirsa
// AUTO-SUFFIX YOK — BRAND_SLUG_TAKEN firlatilir (cagiran taraf farkli isim/slug denemeli).
// logoMediaId/coverMediaId verildiginde MediaAsset'in AYNI magazaya ait oldugu dogrulanir
// (cross-tenant baglama reddi). Saf dogrulama + enjekte dataAccess (fake-DI testable).
//
// NOT: BRAND_ARCHIVED kodu HTTP haritasinda tanimlidir ama BU serviste update() arsivli
// markanin METADATA'sini duzenlemeyi ENGELLEMEZ (yalniz durum ACTIVE<->ARCHIVED gecisi
// archive()/restore() ile olur) — "arsivli markayi urune bagla" reddi ayri bir katmandadir
// (urun servisi, bu gorevin kapsami DISI).

import { slugify } from "@commerce-os/utils";
import type {
  BrandDataAccess,
  BrandListCriteria,
  BrandProductListCriteria,
  BrandProductRecord,
  BrandRecord,
  BrandSelectorCriteria,
  BrandStatus,
} from "./brand-data.js";

export type BrandErrorCode =
  | "BRAND_NOT_FOUND"
  | "BRAND_SLUG_TAKEN"
  | "BRAND_ARCHIVED"
  | "BRAND_MEDIA_CROSS_STORE"
  | "BRAND_NAME_REQUIRED";

export class BrandError extends Error {
  constructor(
    public code: BrandErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BrandError";
  }
}

export function brandErrorStatus(code: BrandErrorCode): number {
  switch (code) {
    case "BRAND_NOT_FOUND":
      return 404;
    case "BRAND_SLUG_TAKEN":
    case "BRAND_ARCHIVED":
      return 409;
    case "BRAND_MEDIA_CROSS_STORE":
      return 403;
    case "BRAND_NAME_REQUIRED":
    default:
      return 400;
  }
}

export interface BrandCreateInput {
  name: string;
  /** Manuel slug (opsiyonel) — verilmezse `name`den turetilir. */
  slug?: string;
  description?: string | null;
  logoMediaId?: string | null;
  coverMediaId?: string | null;
  websiteUrl?: string | null;
  status?: BrandStatus;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface BrandUpdateInput {
  name?: string;
  /** Verilirse slug DEĞİŞİR (store-scoped tekillik yeniden kontrol edilir). */
  slug?: string;
  description?: string | null;
  logoMediaId?: string | null;
  coverMediaId?: string | null;
  websiteUrl?: string | null;
  status?: BrandStatus;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface BrandService {
  list(storeId: string, criteria: BrandListCriteria): Promise<{ data: BrandRecord[]; total: number }>;
  get(storeId: string, id: string): Promise<BrandRecord>;
  create(storeId: string, input: BrandCreateInput): Promise<BrandRecord>;
  update(storeId: string, id: string, patch: BrandUpdateInput): Promise<BrandRecord>;
  archive(storeId: string, id: string): Promise<BrandRecord>;
  restore(storeId: string, id: string): Promise<BrandRecord>;
  selector(storeId: string, criteria: BrandSelectorCriteria): Promise<{ data: BrandRecord[]; total: number }>;
  productCount(storeId: string, brandId: string): Promise<number>;
  productsByBrand(storeId: string, brandIds: string[]): Promise<Map<string, number>>;
  /**
   * TODO-165A (ADR-165A) Task 15/16 gap — marka icin GERCEK urun listesi. Cagiran taraf
   * (route) ONCE `get()` ile tenant/varlik dogrulamasi yapar (cross-store id → BRAND_NOT_FOUND).
   */
  listProducts(
    storeId: string,
    brandId: string,
    criteria: BrandProductListCriteria,
  ): Promise<{ data: BrandProductRecord[]; total: number }>;
}

function requireName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new BrandError("BRAND_NAME_REQUIRED", "Brand name is required");
  }
  return trimmed;
}

export function createBrandService(data: BrandDataAccess): BrandService {
  async function requireBrand(storeId: string, id: string): Promise<BrandRecord> {
    const brand = await data.get(storeId, id);
    if (!brand) throw new BrandError("BRAND_NOT_FOUND", "Brand not found");
    return brand;
  }

  async function requireUniqueSlug(storeId: string, slug: string, excludeId?: string): Promise<void> {
    const existing = await data.findBySlug(storeId, slug);
    if (existing && existing.id !== excludeId) {
      throw new BrandError("BRAND_SLUG_TAKEN", `Slug already in use: ${slug}`, { slug });
    }
  }

  async function requireMediaOwnership(storeId: string, mediaId: string | null | undefined): Promise<void> {
    if (!mediaId) return;
    const owned = await data.mediaBelongsToStore(storeId, mediaId);
    if (!owned) {
      throw new BrandError("BRAND_MEDIA_CROSS_STORE", "Media asset does not belong to this store", {
        mediaId,
      });
    }
  }

  return {
    list: (storeId, criteria) => data.list(storeId, criteria),

    get: (storeId, id) => requireBrand(storeId, id),

    async create(storeId, input) {
      const name = requireName(input.name);
      const desiredSlug = slugify(input.slug?.trim() || name);
      await requireUniqueSlug(storeId, desiredSlug);
      await requireMediaOwnership(storeId, input.logoMediaId);
      await requireMediaOwnership(storeId, input.coverMediaId);

      return data.create({
        storeId,
        name,
        slug: desiredSlug,
        description: input.description ?? null,
        logoMediaId: input.logoMediaId ?? null,
        coverMediaId: input.coverMediaId ?? null,
        websiteUrl: input.websiteUrl ?? null,
        status: input.status ?? "ACTIVE",
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
      });
    },

    async update(storeId, id, patch) {
      // Tenant guard + varlik dogrulamasi. ARCHIVED marka icin de metadata duzenleme
      // izinlidir (bkz. dosya basi not) — burada BRAND_ARCHIVED FIRLATILMAZ.
      await requireBrand(storeId, id);

      const name = patch.name !== undefined ? requireName(patch.name) : undefined;

      let slug: string | undefined;
      if (patch.slug !== undefined) {
        slug = slugify(patch.slug);
        await requireUniqueSlug(storeId, slug, id);
      }

      if (patch.logoMediaId !== undefined) await requireMediaOwnership(storeId, patch.logoMediaId);
      if (patch.coverMediaId !== undefined) await requireMediaOwnership(storeId, patch.coverMediaId);

      return data.update(storeId, id, {
        name,
        slug,
        description: patch.description,
        logoMediaId: patch.logoMediaId,
        coverMediaId: patch.coverMediaId,
        websiteUrl: patch.websiteUrl,
        status: patch.status,
        seoTitle: patch.seoTitle,
        seoDescription: patch.seoDescription,
      });
    },

    async archive(storeId, id) {
      await requireBrand(storeId, id);
      return data.setStatus(storeId, id, "ARCHIVED");
    },

    async restore(storeId, id) {
      await requireBrand(storeId, id);
      return data.setStatus(storeId, id, "ACTIVE");
    },

    selector: (storeId, criteria) => data.selector(storeId, criteria),

    productCount: (storeId, brandId) => data.productCount(storeId, brandId),

    productsByBrand: (storeId, brandIds) => data.productsByBrand(storeId, brandIds),

    listProducts: (storeId, brandId, criteria) => data.listProducts(storeId, brandId, criteria),
  };
}
