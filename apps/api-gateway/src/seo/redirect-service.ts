// TODO-166 (ADR-265) — Admin Slug & Redirect Management servisi (tek yazar + doğrulama).
//
// Manuel redirect güvenliği KATMANLI: (1) SAF domain doğrulaması (@commerce-os/utils
// validateManualRedirect: source≠target, güvenli-yerel-hedef, rezerve/canonical shadow,
// loop) → (2) CANLI-entity shadow (kaynak gerçek bir ürün/marka slug'ına denk gelemez;
// DB) → (3) kaynak tekilliği (@@unique([storeId, sourcePath])). Otomatik (slug-değişimi)
// redirect'ler kullanıcı tarafından SİLİNEMEZ ve source/target/type düzenlenemez — yalnız
// aktif/pasif. Saf doğrulama + enjekte dataAccess (fake-DI test edilebilir).

import {
  normalizeRedirectPath,
  buildRedirectIndex,
  resolveRedirect,
  validateManualRedirect,
  redirectEnumToStatus,
  type RedirectRule,
  type ManualRedirectValidationError,
} from "@commerce-os/utils";
import type {
  RedirectDataAccess,
  RedirectRecord,
  RedirectListCriteria,
  RedirectRuleRow,
  RedirectTypeValue,
} from "./redirect-data.js";

/** DB enum kuralları → SAF resolver kuralları (type: enum string → sayısal HTTP statü). */
function toResolverRules(rows: RedirectRuleRow[]): RedirectRule[] {
  return rows.map((r) => ({
    source: r.source,
    target: r.target,
    type: redirectEnumToStatus(r.type),
    enabled: r.enabled,
  }));
}

export type RedirectEntityType = "PRODUCT" | "CATEGORY" | "BRAND" | "OTHER";

export type RedirectErrorCode =
  | "REDIRECT_NOT_FOUND"
  | "REDIRECT_SOURCE_TAKEN"
  | "REDIRECT_INVALID_SOURCE"
  | "REDIRECT_INVALID_TARGET"
  | "REDIRECT_UNSAFE_TARGET"
  | "REDIRECT_SOURCE_EQUALS_TARGET"
  | "REDIRECT_RESERVED_ROUTE"
  | "REDIRECT_LOOP"
  | "REDIRECT_SHADOWS_LIVE"
  | "REDIRECT_AUTOMATIC_IMMUTABLE"
  | "REDIRECT_AUTOMATIC_DELETE_FORBIDDEN";

export class RedirectError extends Error {
  constructor(
    public code: RedirectErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RedirectError";
  }
}

export function redirectErrorStatus(code: RedirectErrorCode): number {
  switch (code) {
    case "REDIRECT_NOT_FOUND":
      return 404;
    case "REDIRECT_SOURCE_TAKEN":
    case "REDIRECT_LOOP":
    case "REDIRECT_SHADOWS_LIVE":
    case "REDIRECT_AUTOMATIC_IMMUTABLE":
    case "REDIRECT_AUTOMATIC_DELETE_FORBIDDEN":
      return 409;
    default:
      return 400;
  }
}

const MANUAL_ERROR_TO_CODE: Record<ManualRedirectValidationError, RedirectErrorCode> = {
  "invalid-source": "REDIRECT_INVALID_SOURCE",
  "invalid-target": "REDIRECT_INVALID_TARGET",
  "unsafe-target": "REDIRECT_UNSAFE_TARGET",
  "source-equals-target": "REDIRECT_SOURCE_EQUALS_TARGET",
  "reserved-route": "REDIRECT_RESERVED_ROUTE",
  loop: "REDIRECT_LOOP",
};

/** Redirect'in kaynak path şeklinden entity türünü türetir (kolon/filtre — DB'de tutulmaz). */
export function redirectEntityType(sourcePath: string): RedirectEntityType {
  const p = sourcePath.split(/[?#]/)[0];
  if (p.startsWith("/products/")) return "PRODUCT";
  if (p.startsWith("/markalar/")) return "BRAND";
  if (sourcePath.includes("category=") || p === "/products") return "CATEGORY";
  return "OTHER";
}

export interface RedirectView {
  id: string;
  sourcePath: string;
  targetPath: string;
  type: RedirectTypeValue;
  status: number;
  origin: "AUTOMATIC" | "MANUAL";
  entityType: RedirectEntityType;
  enabled: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RedirectDetailView extends RedirectView {
  resolvedTarget: string | null;
  chainLength: number;
  hasLoop: boolean;
}

export interface RedirectCreateInput {
  sourcePath: string;
  targetPath: string;
  type?: RedirectTypeValue;
  notes?: string;
  enabled?: boolean;
}

export interface RedirectUpdateInput {
  sourcePath?: string;
  targetPath?: string;
  type?: RedirectTypeValue;
  notes?: string | null;
  enabled?: boolean;
}

export interface RedirectService {
  list(
    storeId: string,
    criteria: RedirectListCriteria,
  ): Promise<{ data: RedirectView[]; total: number }>;
  getDetail(storeId: string, id: string): Promise<RedirectDetailView>;
  create(storeId: string, input: RedirectCreateInput): Promise<RedirectView>;
  update(storeId: string, id: string, patch: RedirectUpdateInput): Promise<RedirectView>;
  remove(storeId: string, id: string): Promise<void>;
}

function serialize(record: RedirectRecord): RedirectView {
  return {
    id: record.id,
    sourcePath: record.sourcePath,
    targetPath: record.targetPath,
    type: record.type,
    status: redirectEnumToStatus(record.type),
    origin: record.origin,
    entityType: redirectEntityType(record.sourcePath),
    enabled: record.enabled,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function createRedirectService(data: RedirectDataAccess): RedirectService {
  /** Kaynak path canlı bir ürün/marka detay sayfasını gölgeliyor mu (DB canlı kontrolü). */
  async function assertNotShadowingLiveEntity(storeId: string, normalizedSource: string): Promise<void> {
    const productMatch = normalizedSource.match(/^\/products\/([^/]+)$/);
    if (productMatch) {
      const slug = decodeURIComponent(productMatch[1]);
      if (await data.productSlugExists(storeId, slug)) {
        throw new RedirectError(
          "REDIRECT_SHADOWS_LIVE",
          "Source path shadows a live product page.",
          { sourcePath: normalizedSource },
        );
      }
    }
    const brandMatch = normalizedSource.match(/^\/markalar\/([^/]+)$/);
    if (brandMatch) {
      const slug = decodeURIComponent(brandMatch[1]);
      if (await data.brandSlugExists(storeId, slug)) {
        throw new RedirectError(
          "REDIRECT_SHADOWS_LIVE",
          "Source path shadows a live brand page.",
          { sourcePath: normalizedSource },
        );
      }
    }
  }

  return {
    async list(storeId, criteria) {
      const result = await data.list(storeId, criteria);
      return { data: result.data.map(serialize), total: result.total };
    },

    async getDetail(storeId, id) {
      const record = await data.get(storeId, id);
      if (!record) throw new RedirectError("REDIRECT_NOT_FOUND", "Redirect not found.");
      const rules = toResolverRules(await data.allRules(storeId));
      const index = buildRedirectIndex(rules);
      const normalizedSource = normalizeRedirectPath(record.sourcePath);
      const resolution = normalizedSource ? resolveRedirect(normalizedSource, index) : null;
      // Kaynak indexte var ama çözüm null → zincir başa döndü (loop) ya da kendine.
      const inIndex = normalizedSource ? index.has(normalizedSource) : false;
      const hasLoop = record.enabled && inIndex && resolution === null;
      return {
        ...serialize(record),
        resolvedTarget: resolution?.target ?? null,
        chainLength: resolution?.hops ?? 0,
        hasLoop,
      };
    },

    async create(storeId, input) {
      const validation = validateManualRedirect(
        { source: input.sourcePath, target: input.targetPath },
        { existingRules: toResolverRules(await data.allRules(storeId)) },
      );
      if (!validation.ok) {
        throw new RedirectError(MANUAL_ERROR_TO_CODE[validation.error], `Invalid redirect: ${validation.error}`);
      }
      // Kaynak eşleşme için NORMALIZE edilir (query düşer). Hedef ise query'yi KORUR (kategori
      // hedefi `/products?category=...` gibi) — yalnız trim + güvenli-yerel doğrulaması geçmiştir.
      const source = normalizeRedirectPath(input.sourcePath)!;
      const target = input.targetPath.trim();
      await assertNotShadowingLiveEntity(storeId, source);
      const existing = await data.findBySource(storeId, source);
      if (existing) {
        throw new RedirectError("REDIRECT_SOURCE_TAKEN", `A redirect already exists for source: ${source}`, {
          sourcePath: source,
        });
      }
      const record = await data.create({
        storeId,
        sourcePath: source,
        targetPath: target,
        type: input.type ?? "PERMANENT_301",
        origin: "MANUAL",
        enabled: input.enabled ?? true,
        notes: input.notes?.trim() ? input.notes.trim() : null,
      });
      return serialize(record);
    },

    async update(storeId, id, patch) {
      const existing = await data.get(storeId, id);
      if (!existing) throw new RedirectError("REDIRECT_NOT_FOUND", "Redirect not found.");

      const wantsStructuralChange =
        patch.sourcePath !== undefined ||
        patch.targetPath !== undefined ||
        patch.type !== undefined ||
        patch.notes !== undefined;

      // Otomatik redirect'ler yalnız aktif/pasif edilebilir (source/target/type/notes IMMUTABLE) —
      // slug-değişiminden türedikleri için canonical bütünlüğü korunur.
      if (existing.origin === "AUTOMATIC" && wantsStructuralChange) {
        throw new RedirectError(
          "REDIRECT_AUTOMATIC_IMMUTABLE",
          "Automatic (slug-change) redirects can only be enabled/disabled.",
        );
      }

      // Yalnız aktif/pasif değişimi → doğrulamaya gerek yok.
      if (!wantsStructuralChange) {
        const updated = await data.update(storeId, id, { enabled: patch.enabled });
        if (!updated) throw new RedirectError("REDIRECT_NOT_FOUND", "Redirect not found.");
        return serialize(updated);
      }

      const nextSource = patch.sourcePath ?? existing.sourcePath;
      const nextTarget = patch.targetPath ?? existing.targetPath;

      // Loop kontrolü mevcut kuralın KENDİSİNİ hariç tutar (kendi hedefini düzenlemek loop sayılmaz).
      const otherRules = toResolverRules(await data.allRules(storeId)).filter((r) => {
        const rs = normalizeRedirectPath(r.source);
        const es = normalizeRedirectPath(existing.sourcePath);
        return rs !== es;
      });
      const validation = validateManualRedirect(
        { source: nextSource, target: nextTarget },
        { existingRules: otherRules },
      );
      if (!validation.ok) {
        throw new RedirectError(MANUAL_ERROR_TO_CODE[validation.error], `Invalid redirect: ${validation.error}`);
      }
      const normalizedSource = normalizeRedirectPath(nextSource)!;
      // Hedef query'yi KORUR (yalnız kaynak eşleşme için normalize edilir).
      const storedTarget = nextTarget.trim();
      await assertNotShadowingLiveEntity(storeId, normalizedSource);

      // Kaynak değişiyorsa tekillik: başka bir kayıt aynı source'u tutmasın.
      if (normalizedSource !== normalizeRedirectPath(existing.sourcePath)) {
        const clash = await data.findBySource(storeId, normalizedSource);
        if (clash && clash.id !== id) {
          throw new RedirectError("REDIRECT_SOURCE_TAKEN", `A redirect already exists for source: ${normalizedSource}`);
        }
      }

      const updated = await data.update(storeId, id, {
        sourcePath: patch.sourcePath !== undefined ? normalizedSource : undefined,
        targetPath: patch.targetPath !== undefined ? storedTarget : undefined,
        type: patch.type,
        enabled: patch.enabled,
        notes:
          patch.notes === undefined ? undefined : patch.notes && patch.notes.trim() ? patch.notes.trim() : null,
      });
      if (!updated) throw new RedirectError("REDIRECT_NOT_FOUND", "Redirect not found.");
      return serialize(updated);
    },

    async remove(storeId, id) {
      const existing = await data.get(storeId, id);
      if (!existing) throw new RedirectError("REDIRECT_NOT_FOUND", "Redirect not found.");
      // Otomatik redirect'ler doğrudan SİLİNEMEZ (SlugHistory bütünlüğü) — yalnız pasifleştir.
      if (existing.origin === "AUTOMATIC") {
        throw new RedirectError(
          "REDIRECT_AUTOMATIC_DELETE_FORBIDDEN",
          "Automatic redirects cannot be deleted; disable them instead.",
        );
      }
      const removed = await data.remove(storeId, id);
      if (!removed) throw new RedirectError("REDIRECT_NOT_FOUND", "Redirect not found.");
    },
  };
}
