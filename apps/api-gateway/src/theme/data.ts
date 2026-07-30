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
    },
  ): Promise<ThemeRecord | null>;
  /** Platform Admin fleet: TÜM mağazalar + yayınlı tema özeti ("Tema Yönetimi" tablosu). */
  listThemeBindingSummaries(): Promise<ThemeBindingSummaryRow[]>;
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
        // Draft → PUBLISHED (publishedBy audit; PII taşımaz — yalnız id).
        await tx.themeVersion.update({
          where: { id: draft.id },
          data: {
            status: "PUBLISHED",
            publishedAt: now,
            publishedBy: input.publishedBy ?? null,
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
      const stores = await prisma.store.findMany({
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
  };
}
