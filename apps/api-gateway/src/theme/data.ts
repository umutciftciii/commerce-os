/**
 * TODO-158B (ADR-087) — Enterprise Theme Engine veri erişimi.
 *
 * Store-scoped Design Token temalarının tek veri erişim otoritesi. Görsel kimlik
 * VERSİYONLU JSON belgesinde (`ThemeVersion.document` — bkz. @commerce-os/theme)
 * yaşar; token şeması DB'de değil belgede tutulur → yeni token grubu/anahtarı =
 * migration'sız.
 *
 * Değişmezler (servis katmanınca uygulanır):
 *  - Mağaza başına YALNIZ bir Theme "PUBLISHED" (vitrin onu kullanır).
 *  - Theme başına YALNIZ bir ThemeVersion "DRAFT" (üzerinde çalışılan) ve YALNIZ
 *    bir "PUBLISHED". Her publish YENİ versiyon üretir (immutable snapshot).
 *  - Tüm sorgular {storeId} scoped; başka mağazanın teması GÖRÜNMEZ (404).
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import {
  THEME_LIBRARY_STORE_NAME,
  THEME_LIBRARY_STORE_PURPOSE,
  THEME_LIBRARY_STORE_SLUG,
} from "@commerce-os/theme";

export type ThemeVersionRecord = {
  id: string;
  version: number;
  status: string;
  schemaVersion: number;
  label: string | null;
  notes: string | null;
  document: Prisma.JsonValue;
  // TODO-164 — layout/slot config + snapshot alanları.
  config: Prisma.JsonValue;
  themeKey: string | null;
  layoutPreset: string | null;
  // TODO-164B Dilim 2 (TD-162) — logo/favicon DRAFT staging + publish asset snapshot.
  stagedLogoMediaId: string | null;
  stagedFaviconMediaId: string | null;
  assetSnapshot: Prisma.JsonValue | null;
  publishedBy: string | null;
  createdAt: Date;
  publishedAt: Date | null;
};

export type ThemeRecord = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  source: string | null;
  // TODO-164 — theme-key / layout preset / theme API sürümü.
  themeKey: string;
  layoutPreset: string;
  themeApiVersion: number;
  // TODO-164A — builder kimlik alanları (audit/görünürlük).
  duplicatedFrom: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  // TODO-164B — rol ayrımı + override policy alanları.
  ownerScope: string;
  overridePolicy: Prisma.JsonValue | null;
  sourceThemeId: string | null;
  sourceThemeVersion: number | null;
  // TODO-164B Dilim 2 — override policy revizyon sayacı.
  policyRevision: number;
  createdAt: Date;
  updatedAt: Date;
  versions: ThemeVersionRecord[];
};

const versionSelect = {
  id: true,
  version: true,
  status: true,
  schemaVersion: true,
  label: true,
  notes: true,
  document: true,
  config: true,
  themeKey: true,
  layoutPreset: true,
  stagedLogoMediaId: true,
  stagedFaviconMediaId: true,
  assetSnapshot: true,
  publishedBy: true,
  createdAt: true,
  publishedAt: true,
} satisfies Prisma.ThemeVersionSelect;

const themeSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  source: true,
  themeKey: true,
  layoutPreset: true,
  themeApiVersion: true,
  duplicatedFrom: true,
  createdBy: true,
  updatedBy: true,
  ownerScope: true,
  overridePolicy: true,
  sourceThemeId: true,
  sourceThemeVersion: true,
  policyRevision: true,
  createdAt: true,
  updatedAt: true,
  versions: { select: versionSelect, orderBy: { version: "desc" as const } },
} satisfies Prisma.ThemeSelect;

export interface CreateThemeInput {
  name: string;
  description?: string | null;
  source: string | null;
  schemaVersion: number;
  // Opak JSON belge (ThemeDocument); route katmanı @commerce-os/theme ile doğrular.
  document: unknown;
  // TODO-164 — theme-key / layout preset / config (route @commerce-os/theme ile doğrular).
  themeKey: string;
  layoutPreset: string;
  themeApiVersion: number;
  config: unknown;
  // TODO-164A — builder kimlik alanları (opsiyonel; audit).
  createdBy?: string | null;
  duplicatedFrom?: string | null;
  // TODO-164B Dilim 2 — platform template'i için "PLATFORM" (varsayılan "STORE").
  ownerScope?: string;
}

/** TODO-164 — PUBLISHED tema + versiyon config'i (vitrin resolver girdisi). */
export interface PublishedThemeState {
  document: Prisma.JsonValue;
  schemaVersion: number;
  config: Prisma.JsonValue;
  themeKey: string;
  layoutPreset: string;
  themeApiVersion: number;
  publishedVersion: number;
  publishedAt: Date | null;
}

/**
 * TODO-164 — Fleet "Tema Yönetimi" tablosu satırı (mağaza + yayınlı tema özeti).
 * Yayınlı teması olmayan mağaza da döner (aktif = base). ALLOWLIST özet; ham belge
 * TAŞINMAZ (yalnız config'ten themeKey/slot uyumluluğu türetilir).
 */
export interface ThemeBindingSummaryRow {
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeStatus: string;
  themeKey: string | null;
  layoutPreset: string | null;
  themeApiVersion: number | null;
  publishedConfig: Prisma.JsonValue | null;
  publishedVersion: number | null;
}

export interface ThemeDataAccess {
  listThemes(storeId: string): Promise<ThemeRecord[]>;
  getTheme(storeId: string, themeId: string): Promise<ThemeRecord | null>;
  createTheme(storeId: string, input: CreateThemeInput): Promise<ThemeRecord>;
  updateThemeMeta(
    storeId: string,
    themeId: string,
    patch: { name?: string; description?: string | null },
  ): Promise<ThemeRecord | null>;
  deleteTheme(storeId: string, themeId: string): Promise<boolean>;
  /** TODO-164A — Tema kopyala: aktif (draft>published) config+document snapshot'ını
   *  YENİ kimliğe kopyalar (DRAFT, tek versiyon). history/audit KOPYALANMAZ. */
  duplicateTheme(
    storeId: string,
    themeId: string,
    input: { name: string; createdBy?: string | null },
  ): Promise<ThemeRecord | null>;
  /** TODO-164A — Temayı arşivle (PUBLISHED arşivlenemez → null döner yerine dokunmaz). */
  archiveTheme(
    storeId: string,
    themeId: string,
    input?: { updatedBy?: string | null },
  ): Promise<ThemeRecord | null>;
  /** Mevcut DRAFT versiyonun belgesini + config'ini günceller (yoksa yeni draft yaratır). */
  saveDraft(
    storeId: string,
    themeId: string,
    input: {
      document: unknown;
      schemaVersion: number;
      label?: string | null;
      config?: unknown;
      themeKey?: string;
      layoutPreset?: string;
    },
  ): Promise<ThemeRecord | null>;
  /** Publish: draft → PUBLISHED, eski published → ARCHIVED, tek published tema
   *  değişmezini uygula, düzenlemeye devam için yeni DRAFT snapshot üret. */
  publishTheme(
    storeId: string,
    themeId: string,
    input: { notes?: string | null; publishedBy?: string | null },
  ): Promise<ThemeRecord | null>;
  /** Rollback: verilen versiyonun belgesini + config'ini yeni DRAFT olarak geri yükler. */
  rollbackToVersion(
    storeId: string,
    themeId: string,
    version: number,
  ): Promise<ThemeRecord | null>;
  /** Vitrin: mağazanın PUBLISHED temasının PUBLISHED versiyon durumu (belge + config). */
  getPublishedState(storeId: string): Promise<PublishedThemeState | null>;
  /** Platform Admin: mağazanın PUBLISHED (yoksa en güncel) temasına theme-key atar;
   *  yeni PUBLISHED versiyon üretir (immutable snapshot korunur). */
  assignThemeBinding(
    storeId: string,
    input: {
      themeKey: string;
      layoutPreset: string;
      themeApiVersion: number;
      publishedBy?: string | null;
      // TODO-164 fix — atanan temanın TOKEN belgesi (renk paleti). Verilirse mevcut
      // belge yerine BU kullanılır (atama tam temayı uygular: renk + düzen).
      document?: unknown;
      schemaVersion?: number;
      // TODO-164B — atama sırasında mağaza override policy'si (opsiyonel). Verilirse
      // Theme.overridePolicy'ye yazılır; Store Admin alan yetkileri buradan gelir.
      overridePolicy?: unknown;
    },
  ): Promise<ThemeRecord | null>;
  /** Platform Admin fleet: TÜM mağazalar + yayınlı tema özeti ("Tema Yönetimi" tablosu). */
  listThemeBindingSummaries(): Promise<ThemeBindingSummaryRow[]>;

  // ── TODO-164B Dilim 2 — Platform Theme Library / Designer / Rollout ──────────
  /** Platform tema kütüphanesi sistem mağazasını get-or-create eder (systemPurpose). */
  ensureThemeLibraryStore(): Promise<{ id: string }>;
  /** Override policy'yi yazar + policyRevision++ (audit). Mevcut tema verisini SİLMEZ. */
  setOverridePolicy(storeId: string, themeId: string, policy: unknown): Promise<ThemeRecord | null>;
  /** TD-162 — logo/favicon DRAFT staging. Mevcut DRAFT versiyona sahneler (StoreSettings'e
   *  publish'e kadar DOKUNMAZ). null → o alanın staging'ini temizler. */
  stageThemeAssets(
    storeId: string,
    themeId: string,
    input: { logoMediaId?: string | null; faviconMediaId?: string | null },
  ): Promise<ThemeRecord | null>;
  /** Platform template'in published snapshot'ını HEDEF mağazaya kopyalar (yeni PUBLISHED
   *  + DRAFT sürüm; sourceThemeId/sourceThemeVersion + overridePolicy yazar). Template ile
   *  runtime bağı KURMAZ. Başka mağazayı etkilemez. */
  assignTemplateToStore(
    targetStoreId: string,
    input: {
      sourceThemeId: string;
      sourceThemeVersion: number;
      document: unknown;
      schemaVersion: number;
      config: unknown;
      themeKey: string;
      layoutPreset: string;
      themeApiVersion: number;
      overridePolicy?: unknown;
      publishedBy?: string | null;
      label?: string;
    },
  ): Promise<ThemeRecord | null>;
  /** Bir template'i kullanan mağazalar + türetildikleri sürüm (usage + update-pending). */
  listTemplateUsage(templateThemeId: string): Promise<TemplateUsageRow[]>;
  /** Atanabilir mağazalar (sistem mağazaları HARİÇ) + mevcut published tema source bağı. */
  listAssignableStores(): Promise<AssignableStoreRow[]>;
}

/** Atama hedefi olabilecek mağaza satırı (sistem mağazaları hariç). */
export interface AssignableStoreRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  sourceThemeId: string | null;
  sourceThemeVersion: number | null;
}

/** Bir platform template'ini kullanan mağaza satırı (kullanım + update-available hesabı). */
export interface TemplateUsageRow {
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeStatus: string;
  sourceThemeVersion: number | null;
}

/**
 * TODO-164B Dilim 2 (hardening) — staged logo/favicon media referansı geçersizse
 * publish/stage kontrollü DOMAIN hatası verir (ham Prisma/FK 500 DEĞİL). `code`:
 *   THEME_MEDIA_NOT_FOUND  — media yok (silinmiş dahil; hard-delete → satır yok).
 *   THEME_MEDIA_NOT_OWNED  — media başka mağazaya ait (tema mağazası ≠ media mağazası).
 *   THEME_MEDIA_INVALID    — media görsel değil (mimeType image/* değil) — logo/favicon olamaz.
 * Ham constraint adı/stack TAŞIMAZ (yalnız code + field).
 */
export class ThemeMediaError extends Error {
  readonly code: "THEME_MEDIA_NOT_FOUND" | "THEME_MEDIA_NOT_OWNED" | "THEME_MEDIA_INVALID";
  readonly field: "logo" | "favicon";
  constructor(code: ThemeMediaError["code"], field: ThemeMediaError["field"]) {
    super(`${code}:${field}`);
    this.name = "ThemeMediaError";
    this.code = code;
    this.field = field;
  }
}

/**
 * Bir asset referansını tema mağazasına göre doğrular. `client` bir Prisma/tx client'ı
 * olabilir (transaction içi güvenli doğrulama). null → sorun yok; aksi halde ThemeMediaError.
 */
async function assertAssetOwnership(
  client: Prisma.TransactionClient,
  themeStoreId: string,
  mediaId: string | null | undefined,
  field: "logo" | "favicon",
): Promise<void> {
  if (mediaId == null) return;
  const media = await client.mediaAsset.findUnique({
    where: { id: mediaId },
    select: { storeId: true, mimeType: true },
  });
  if (!media) throw new ThemeMediaError("THEME_MEDIA_NOT_FOUND", field);
  if (media.storeId !== themeStoreId) throw new ThemeMediaError("THEME_MEDIA_NOT_OWNED", field);
  if (!media.mimeType.startsWith("image/")) throw new ThemeMediaError("THEME_MEDIA_INVALID", field);
}

function currentDraft(theme: ThemeRecord): ThemeVersionRecord | undefined {
  return theme.versions.find((v) => v.status === "DRAFT");
}
function currentPublished(theme: ThemeRecord): ThemeVersionRecord | undefined {
  return theme.versions.find((v) => v.status === "PUBLISHED");
}

export function createPrismaThemeDataAccess(): ThemeDataAccess {
  return {
    async listThemes(storeId) {
      return prisma.theme.findMany({
        where: { storeId },
        select: themeSelect,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      });
    },

    async getTheme(storeId, themeId) {
      return prisma.theme.findFirst({
        where: { id: themeId, storeId },
        select: themeSelect,
      });
    },

    async createTheme(storeId, input) {
      return prisma.theme.create({
        data: {
          storeId,
          name: input.name,
          description: input.description ?? null,
          source: input.source,
          status: "DRAFT",
          themeKey: input.themeKey,
          layoutPreset: input.layoutPreset,
          themeApiVersion: input.themeApiVersion,
          duplicatedFrom: input.duplicatedFrom ?? null,
          createdBy: input.createdBy ?? null,
          updatedBy: input.createdBy ?? null,
          ...(input.ownerScope !== undefined ? { ownerScope: input.ownerScope } : {}),
          versions: {
            create: {
              storeId,
              version: 1,
              status: "DRAFT",
              schemaVersion: input.schemaVersion,
              document: input.document as Prisma.InputJsonValue,
              config: input.config as Prisma.InputJsonValue,
              themeKey: input.themeKey,
              layoutPreset: input.layoutPreset,
            },
          },
        },
        select: themeSelect,
      });
    },

    async updateThemeMeta(storeId, themeId, patch) {
      const data: Prisma.ThemeUpdateManyMutationInput = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.description !== undefined) data.description = patch.description;
      const result = await prisma.theme.updateMany({ where: { id: themeId, storeId }, data });
      if (result.count === 0) return null;
      return prisma.theme.findFirst({ where: { id: themeId, storeId }, select: themeSelect });
    },

    async deleteTheme(storeId, themeId) {
      const result = await prisma.theme.deleteMany({ where: { id: themeId, storeId } });
      return result.count > 0;
    },

    async duplicateTheme(storeId, themeId, input) {
      const theme = await prisma.theme.findFirst({
        where: { id: themeId, storeId },
        select: themeSelect,
      });
      if (!theme) return null;
      // Kopya kaynağı: aktif düzenlenebilir belge (draft öncelikli, yoksa published).
      const source = currentDraft(theme) ?? currentPublished(theme) ?? theme.versions[0];
      if (!source) return null;
      // YENİ kimlik; status DRAFT; tek versiyon (v1); history/audit KOPYALANMAZ.
      return prisma.theme.create({
        data: {
          storeId,
          name: input.name,
          description: theme.description,
          source: `duplicate:${theme.id}`,
          status: "DRAFT",
          themeKey: theme.themeKey,
          layoutPreset: theme.layoutPreset,
          themeApiVersion: theme.themeApiVersion,
          duplicatedFrom: theme.id,
          createdBy: input.createdBy ?? null,
          updatedBy: input.createdBy ?? null,
          versions: {
            create: {
              storeId,
              version: 1,
              status: "DRAFT",
              schemaVersion: source.schemaVersion,
              document: source.document as Prisma.InputJsonValue,
              config: source.config as Prisma.InputJsonValue,
              themeKey: source.themeKey,
              layoutPreset: source.layoutPreset,
              label: "duplicate",
            },
          },
        },
        select: themeSelect,
      });
    },

    async archiveTheme(storeId, themeId, input) {
      const theme = await prisma.theme.findFirst({
        where: { id: themeId, storeId },
        select: { id: true, status: true },
      });
      if (!theme) return null;
      // PUBLISHED tema arşivlenemez (önce başka tema publish edilmeli).
      if (theme.status === "PUBLISHED") return null;
      await prisma.theme.update({
        where: { id: themeId },
        data: { status: "ARCHIVED", ...(input?.updatedBy ? { updatedBy: input.updatedBy } : {}) },
      });
      return prisma.theme.findFirst({ where: { id: themeId, storeId }, select: themeSelect });
    },

    async saveDraft(storeId, themeId, input) {
      const theme = await prisma.theme.findFirst({
        where: { id: themeId, storeId },
        select: themeSelect,
      });
      if (!theme) return null;
      const draft = currentDraft(theme);
      const configPatch =
        input.config !== undefined ? { config: input.config as Prisma.InputJsonValue } : {};
      // themeKey/layoutPreset config'ten türetilir; Theme seviyesinde de senkron tutulur.
      const themeBindingPatch: Prisma.ThemeUpdateInput = {};
      if (input.themeKey !== undefined) themeBindingPatch.themeKey = input.themeKey;
      if (input.layoutPreset !== undefined) themeBindingPatch.layoutPreset = input.layoutPreset;
      if (draft) {
        await prisma.themeVersion.update({
          where: { id: draft.id },
          data: {
            document: input.document as Prisma.InputJsonValue,
            schemaVersion: input.schemaVersion,
            ...configPatch,
            ...(input.themeKey !== undefined ? { themeKey: input.themeKey } : {}),
            ...(input.layoutPreset !== undefined ? { layoutPreset: input.layoutPreset } : {}),
            ...(input.label !== undefined ? { label: input.label } : {}),
          },
        });
      } else {
        const nextVersion = (theme.versions[0]?.version ?? 0) + 1;
        await prisma.themeVersion.create({
          data: {
            themeId,
            storeId,
            version: nextVersion,
            status: "DRAFT",
            schemaVersion: input.schemaVersion,
            document: input.document as Prisma.InputJsonValue,
            config: (input.config ?? {}) as Prisma.InputJsonValue,
            themeKey: input.themeKey ?? null,
            layoutPreset: input.layoutPreset ?? null,
            label: input.label ?? null,
          },
        });
      }
      if (Object.keys(themeBindingPatch).length > 0) {
        await prisma.theme.update({ where: { id: themeId }, data: themeBindingPatch });
      }
      return prisma.theme.findFirst({ where: { id: themeId, storeId }, select: themeSelect });
    },

    async publishTheme(storeId, themeId, input) {
      return prisma.$transaction(async (tx) => {
        const theme = await tx.theme.findFirst({
          where: { id: themeId, storeId },
          select: themeSelect,
        });
        if (!theme) return null;
        const draft = currentDraft(theme);
        if (!draft) return null;
        const previouslyPublished = currentPublished(theme);
        const now = new Date();

        // Eski published → ARCHIVED (immutable snapshot korunur).
        if (previouslyPublished) {
          await tx.themeVersion.update({
            where: { id: previouslyPublished.id },
            data: { status: "ARCHIVED" },
          });
        }
        // TD-162 — logo/favicon DRAFT staging ATOMİK publish. Kalıcı otorite StoreSettings.
        // Bu txn içinde: (1) mevcut StoreSettings asset görünümünü oku, (2) staged değerleri
        // uygula (varsa), (3) bu sürümün SUNDUĞU asset görünümünü `assetSnapshot`'a yaz
        // (rollback bu snapshot'a döner). Publish başka bir adımda başarısız olursa TÜM txn
        // geri alınır → StoreSettings DEĞİŞMEZ.
        const settings = await tx.storeSettings.findUnique({
          where: { storeId },
          select: { logoMediaId: true, faviconMediaId: true },
        });
        const hasStagedLogo = draft.stagedLogoMediaId !== null && draft.stagedLogoMediaId !== undefined;
        const hasStagedFavicon =
          draft.stagedFaviconMediaId !== null && draft.stagedFaviconMediaId !== undefined;
        // HARDENING — staged media'yı StoreSettings'e yazmadan ÖNCE txn içinde doğrula.
        // Geçersizse ThemeMediaError fırlar → tüm txn geri alınır (StoreSettings/ThemeVersion
        // DEĞİŞMEZ, kısmi update YOK) ve route kontrollü 4xx döner (ham FK 500 sızmaz).
        if (hasStagedLogo) await assertAssetOwnership(tx, storeId, draft.stagedLogoMediaId, "logo");
        if (hasStagedFavicon) await assertAssetOwnership(tx, storeId, draft.stagedFaviconMediaId, "favicon");
        const finalLogo = hasStagedLogo ? draft.stagedLogoMediaId : (settings?.logoMediaId ?? null);
        const finalFavicon = hasStagedFavicon
          ? draft.stagedFaviconMediaId
          : (settings?.faviconMediaId ?? null);
        if (hasStagedLogo || hasStagedFavicon) {
          await tx.storeSettings.upsert({
            where: { storeId },
            create: { storeId, logoMediaId: finalLogo, faviconMediaId: finalFavicon },
            update: {
              ...(hasStagedLogo ? { logoMediaId: finalLogo } : {}),
              ...(hasStagedFavicon ? { faviconMediaId: finalFavicon } : {}),
            },
          });
        }
        const assetSnapshot = { logoMediaId: finalLogo, faviconMediaId: finalFavicon };
        // Draft → PUBLISHED (publishedBy audit; PII taşımaz — yalnız id).
        await tx.themeVersion.update({
          where: { id: draft.id },
          data: {
            status: "PUBLISHED",
            publishedAt: now,
            publishedBy: input.publishedBy ?? null,
            assetSnapshot: assetSnapshot as Prisma.InputJsonValue,
            // Staging artık uygulandı → published sürümde temizle.
            stagedLogoMediaId: null,
            stagedFaviconMediaId: null,
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
        });
        // Mağaza başına tek PUBLISHED tema: diğer published temalar → ARCHIVED.
        await tx.theme.updateMany({
          where: { storeId, status: "PUBLISHED", id: { not: themeId } },
          data: { status: "ARCHIVED" },
        });
        // Theme seviyesinde theme-key/layout preset published draft'tan senkronlanır.
        await tx.theme.update({
          where: { id: themeId },
          data: {
            status: "PUBLISHED",
            ...(draft.themeKey ? { themeKey: draft.themeKey } : {}),
            ...(draft.layoutPreset ? { layoutPreset: draft.layoutPreset } : {}),
          },
        });
        // Düzenlemeye devam için yeni DRAFT snapshot (published belge + config kopyası).
        const nextVersion = (theme.versions[0]?.version ?? 0) + 1;
        await tx.themeVersion.create({
          data: {
            themeId,
            storeId,
            version: nextVersion,
            status: "DRAFT",
            schemaVersion: draft.schemaVersion,
            document: draft.document as Prisma.InputJsonValue,
            config: draft.config as Prisma.InputJsonValue,
            themeKey: draft.themeKey,
            layoutPreset: draft.layoutPreset,
          },
        });
        return tx.theme.findFirst({ where: { id: themeId, storeId }, select: themeSelect });
      });
    },

    async rollbackToVersion(storeId, themeId, version) {
      return prisma.$transaction(async (tx) => {
        const theme = await tx.theme.findFirst({
          where: { id: themeId, storeId },
          select: themeSelect,
        });
        if (!theme) return null;
        const target = theme.versions.find((v) => v.version === version);
        if (!target) return null;
        const draft = currentDraft(theme);
        if (draft) {
          await tx.themeVersion.update({
            where: { id: draft.id },
            data: {
              document: target.document as Prisma.InputJsonValue,
              schemaVersion: target.schemaVersion,
              config: target.config as Prisma.InputJsonValue,
              themeKey: target.themeKey,
              layoutPreset: target.layoutPreset,
              label: `rollback:v${version}`,
            },
          });
        } else {
          const nextVersion = (theme.versions[0]?.version ?? 0) + 1;
          await tx.themeVersion.create({
            data: {
              themeId,
              storeId,
              version: nextVersion,
              status: "DRAFT",
              schemaVersion: target.schemaVersion,
              document: target.document as Prisma.InputJsonValue,
              config: target.config as Prisma.InputJsonValue,
              themeKey: target.themeKey,
              layoutPreset: target.layoutPreset,
              label: `rollback:v${version}`,
            },
          });
        }
        // Theme seviyesi binding rollback hedefinin snapshot'ına döner (varsa).
        await tx.theme.update({
          where: { id: themeId },
          data: {
            ...(target.themeKey ? { themeKey: target.themeKey } : {}),
            ...(target.layoutPreset ? { layoutPreset: target.layoutPreset } : {}),
          },
        });
        // TD-162 — rollback hedef sürümün SUNDUĞU logo/favicon snapshot'ına döner (varsa).
        // Böylece marka görseli de sürümle tutarlı geri gelir (atomik, aynı txn).
        const snap = target.assetSnapshot as { logoMediaId?: unknown; faviconMediaId?: unknown } | null;
        if (snap && typeof snap === "object") {
          const logoMediaId = typeof snap.logoMediaId === "string" ? snap.logoMediaId : null;
          const faviconMediaId = typeof snap.faviconMediaId === "string" ? snap.faviconMediaId : null;
          await tx.storeSettings.upsert({
            where: { storeId },
            create: { storeId, logoMediaId, faviconMediaId },
            update: { logoMediaId, faviconMediaId },
          });
        }
        return tx.theme.findFirst({ where: { id: themeId, storeId }, select: themeSelect });
      });
    },

    async getPublishedState(storeId) {
      const version = await prisma.themeVersion.findFirst({
        where: { storeId, status: "PUBLISHED", theme: { status: "PUBLISHED" } },
        select: {
          document: true,
          schemaVersion: true,
          config: true,
          version: true,
          publishedAt: true,
          theme: { select: { themeKey: true, layoutPreset: true, themeApiVersion: true } },
        },
        orderBy: { publishedAt: "desc" },
      });
      if (!version) return null;
      return {
        document: version.document,
        schemaVersion: version.schemaVersion,
        config: version.config,
        themeKey: version.theme.themeKey,
        layoutPreset: version.theme.layoutPreset,
        themeApiVersion: version.theme.themeApiVersion,
        publishedVersion: version.version,
        publishedAt: version.publishedAt,
      };
    },

    async assignThemeBinding(storeId, input) {
      return prisma.$transaction(async (tx) => {
        // PUBLISHED tema; yoksa en güncel tema (platform admin atama için hedef).
        const theme =
          (await tx.theme.findFirst({
            where: { storeId, status: "PUBLISHED" },
            select: themeSelect,
          })) ??
          (await tx.theme.findFirst({
            where: { storeId },
            select: themeSelect,
            orderBy: { updatedAt: "desc" },
          }));
        if (!theme) return null;
        const published = currentPublished(theme);
        const draft = currentDraft(theme);
        // Snapshot alınacak belge/config kaynağı: published > draft.
        const sourceVersion = published ?? draft;
        if (!sourceVersion) return null;
        const now = new Date();
        // Yeni binding config'i (slot override sıfırlanır — atama layout preset'i belirler).
        const newConfig = {
          themeKey: input.themeKey,
          layoutPreset: input.layoutPreset,
          slots: {},
        } as Prisma.InputJsonValue;
        // TODO-164 fix — atanan temanın TOKEN belgesi (renk paleti) verildiyse ONU kullan;
        // yoksa geriye-uyumlu olarak kaynak sürümün belgesini kopyala. Böylece atama TAM
        // temayı uygular (renk + düzen), yalnız düzeni değil.
        const assignedDocument = (
          input.document !== undefined ? input.document : sourceVersion.document
        ) as Prisma.InputJsonValue;
        const assignedSchemaVersion = input.schemaVersion ?? sourceVersion.schemaVersion;

        // Eski published → ARCHIVED.
        if (published) {
          await tx.themeVersion.update({ where: { id: published.id }, data: { status: "ARCHIVED" } });
        }
        const nextVersion = (theme.versions[0]?.version ?? 0) + 1;
        // Yeni PUBLISHED versiyon (immutable snapshot).
        await tx.themeVersion.create({
          data: {
            themeId: theme.id,
            storeId,
            version: nextVersion,
            status: "PUBLISHED",
            schemaVersion: assignedSchemaVersion,
            document: assignedDocument,
            config: newConfig,
            themeKey: input.themeKey,
            layoutPreset: input.layoutPreset,
            publishedBy: input.publishedBy ?? null,
            publishedAt: now,
            label: `assign:${input.themeKey}`,
          },
        });
        // Mağaza başına tek PUBLISHED tema.
        await tx.theme.updateMany({
          where: { storeId, status: "PUBLISHED", id: { not: theme.id } },
          data: { status: "ARCHIVED" },
        });
        await tx.theme.update({
          where: { id: theme.id },
          data: {
            status: "PUBLISHED",
            themeKey: input.themeKey,
            layoutPreset: input.layoutPreset,
            themeApiVersion: input.themeApiVersion,
            // TODO-164B — atama override policy'yi de yazar (verildiyse).
            ...(input.overridePolicy !== undefined
              ? { overridePolicy: input.overridePolicy as Prisma.InputJsonValue }
              : {}),
          },
        });
        // Düzenlemeye devam için yeni DRAFT snapshot (atanan tema belgesiyle).
        await tx.themeVersion.create({
          data: {
            themeId: theme.id,
            storeId,
            version: nextVersion + 1,
            status: "DRAFT",
            schemaVersion: assignedSchemaVersion,
            document: assignedDocument,
            config: newConfig,
            themeKey: input.themeKey,
            layoutPreset: input.layoutPreset,
          },
        });
        return tx.theme.findFirst({ where: { id: theme.id, storeId }, select: themeSelect });
      });
    },

    async listThemeBindingSummaries() {
      // Tüm mağazalar + (varsa) PUBLISHED tema + onun PUBLISHED versiyon config'i.
      // Yayınlı teması olmayan mağaza da döner (aktif = base). Tek sorgu (N+1 yok).
      // TODO-164B (ADR-232) — sistem mağazaları (systemPurpose ≠ null; ör. tema
      // kütüphanesi) fleet tablosundan KESİNLİKLE dışlanır.
      const stores = await prisma.store.findMany({
        where: { systemPurpose: null },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          themes: {
            where: { status: "PUBLISHED" },
            select: {
              themeKey: true,
              layoutPreset: true,
              themeApiVersion: true,
              versions: {
                where: { status: "PUBLISHED" },
                select: { config: true, version: true },
                take: 1,
              },
            },
            take: 1,
          },
        },
        orderBy: { createdAt: "asc" },
      });
      return stores.map((s) => {
        const theme = s.themes[0];
        const version = theme?.versions[0];
        return {
          storeId: s.id,
          storeName: s.name,
          storeSlug: s.slug,
          storeStatus: String(s.status),
          themeKey: theme?.themeKey ?? null,
          layoutPreset: theme?.layoutPreset ?? null,
          themeApiVersion: theme?.themeApiVersion ?? null,
          publishedConfig: version?.config ?? null,
          publishedVersion: version?.version ?? null,
        };
      });
    },

    // ── TODO-164B Dilim 2 — Platform Theme Library ────────────────────────────
    async ensureThemeLibraryStore() {
      const existing = await prisma.store.findFirst({
        where: { systemPurpose: THEME_LIBRARY_STORE_PURPOSE },
        select: { id: true },
      });
      if (existing) return existing;
      // Deterministik slug ile get-or-create (yarış durumunda unique slug korur).
      const created = await prisma.store.upsert({
        where: { slug: THEME_LIBRARY_STORE_SLUG },
        create: {
          name: THEME_LIBRARY_STORE_NAME,
          slug: THEME_LIBRARY_STORE_SLUG,
          status: "ACTIVE",
          systemPurpose: THEME_LIBRARY_STORE_PURPOSE,
        },
        update: { systemPurpose: THEME_LIBRARY_STORE_PURPOSE },
        select: { id: true },
      });
      return created;
    },

    async setOverridePolicy(storeId, themeId, policy) {
      const result = await prisma.theme.updateMany({
        where: { id: themeId, storeId },
        data: {
          overridePolicy: policy as Prisma.InputJsonValue,
          policyRevision: { increment: 1 },
        },
      });
      if (result.count === 0) return null;
      return prisma.theme.findFirst({ where: { id: themeId, storeId }, select: themeSelect });
    },

    async stageThemeAssets(storeId, themeId, input) {
      const theme = await prisma.theme.findFirst({ where: { id: themeId, storeId }, select: themeSelect });
      if (!theme) return null;
      const draft = currentDraft(theme);
      if (!draft) return null;
      // HARDENING — sahnelenen media'yı ERKEN doğrula (yok/başka mağaza/görsel değil →
      // ThemeMediaError; route kontrollü 4xx döner). null = staging temizleme (izinli).
      if (input.logoMediaId != null) await assertAssetOwnership(prisma, storeId, input.logoMediaId, "logo");
      if (input.faviconMediaId != null) await assertAssetOwnership(prisma, storeId, input.faviconMediaId, "favicon");
      await prisma.themeVersion.update({
        where: { id: draft.id },
        data: {
          ...(input.logoMediaId !== undefined ? { stagedLogoMediaId: input.logoMediaId } : {}),
          ...(input.faviconMediaId !== undefined ? { stagedFaviconMediaId: input.faviconMediaId } : {}),
        },
      });
      return prisma.theme.findFirst({ where: { id: themeId, storeId }, select: themeSelect });
    },

    async assignTemplateToStore(targetStoreId, input) {
      return prisma.$transaction(async (tx) => {
        // Hedef mağazanın PUBLISHED (yoksa en güncel) teması — atama hedefi.
        const theme =
          (await tx.theme.findFirst({ where: { storeId: targetStoreId, status: "PUBLISHED" }, select: themeSelect })) ??
          (await tx.theme.findFirst({ where: { storeId: targetStoreId }, select: themeSelect, orderBy: { updatedAt: "desc" } }));
        if (!theme) return null;
        const published = currentPublished(theme);
        const now = new Date();
        const doc = input.document as Prisma.InputJsonValue;
        const cfg = input.config as Prisma.InputJsonValue;
        if (published) {
          await tx.themeVersion.update({ where: { id: published.id }, data: { status: "ARCHIVED" } });
        }
        const nextVersion = (theme.versions[0]?.version ?? 0) + 1;
        // Yeni PUBLISHED versiyon (template snapshot'ının immutable kopyası).
        await tx.themeVersion.create({
          data: {
            themeId: theme.id,
            storeId: targetStoreId,
            version: nextVersion,
            status: "PUBLISHED",
            schemaVersion: input.schemaVersion,
            document: doc,
            config: cfg,
            themeKey: input.themeKey,
            layoutPreset: input.layoutPreset,
            publishedBy: input.publishedBy ?? null,
            publishedAt: now,
            label: input.label ?? `template:${input.sourceThemeId}@${input.sourceThemeVersion}`,
          },
        });
        await tx.theme.updateMany({
          where: { storeId: targetStoreId, status: "PUBLISHED", id: { not: theme.id } },
          data: { status: "ARCHIVED" },
        });
        await tx.theme.update({
          where: { id: theme.id },
          data: {
            status: "PUBLISHED",
            themeKey: input.themeKey,
            layoutPreset: input.layoutPreset,
            themeApiVersion: input.themeApiVersion,
            // Template bağı (update-available hesabı) — runtime bağı DEĞİL, sürüm işareti.
            sourceThemeId: input.sourceThemeId,
            sourceThemeVersion: input.sourceThemeVersion,
            ...(input.overridePolicy !== undefined
              ? { overridePolicy: input.overridePolicy as Prisma.InputJsonValue, policyRevision: { increment: 1 } }
              : {}),
          },
        });
        // Düzenlemeye devam için yeni DRAFT snapshot (template belgesiyle).
        await tx.themeVersion.create({
          data: {
            themeId: theme.id,
            storeId: targetStoreId,
            version: nextVersion + 1,
            status: "DRAFT",
            schemaVersion: input.schemaVersion,
            document: doc,
            config: cfg,
            themeKey: input.themeKey,
            layoutPreset: input.layoutPreset,
          },
        });
        return tx.theme.findFirst({ where: { id: theme.id, storeId: targetStoreId }, select: themeSelect });
      });
    },

    async listTemplateUsage(templateThemeId) {
      const themes = await prisma.theme.findMany({
        where: { sourceThemeId: templateThemeId, status: "PUBLISHED", store: { systemPurpose: null } },
        select: {
          sourceThemeVersion: true,
          store: { select: { id: true, name: true, slug: true, status: true } },
        },
      });
      return themes.map((t) => ({
        storeId: t.store.id,
        storeName: t.store.name,
        storeSlug: t.store.slug,
        storeStatus: String(t.store.status),
        sourceThemeVersion: t.sourceThemeVersion,
      }));
    },

    async listAssignableStores() {
      const stores = await prisma.store.findMany({
        where: { systemPurpose: null },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          themes: {
            where: { status: "PUBLISHED" },
            select: { sourceThemeId: true, sourceThemeVersion: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "asc" },
      });
      return stores.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        status: String(s.status),
        sourceThemeId: s.themes[0]?.sourceThemeId ?? null,
        sourceThemeVersion: s.themes[0]?.sourceThemeVersion ?? null,
      }));
    },
  };
}
