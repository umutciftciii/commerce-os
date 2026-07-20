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
  createdAt: Date;
  publishedAt: Date | null;
};

export type ThemeRecord = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  source: string | null;
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
  createdAt: true,
  publishedAt: true,
} satisfies Prisma.ThemeVersionSelect;

const themeSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  source: true,
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
  /** Mevcut DRAFT versiyonun belgesini günceller (yoksa v1 draft yaratır). */
  saveDraft(
    storeId: string,
    themeId: string,
    input: { document: unknown; schemaVersion: number; label?: string | null },
  ): Promise<ThemeRecord | null>;
  /** Publish: draft → PUBLISHED, eski published → ARCHIVED, tek published tema
   *  değişmezini uygula, düzenlemeye devam için yeni DRAFT snapshot üret. */
  publishTheme(
    storeId: string,
    themeId: string,
    input: { notes?: string | null },
  ): Promise<ThemeRecord | null>;
  /** Rollback: verilen versiyonun belgesini yeni DRAFT olarak geri yükler. */
  rollbackToVersion(
    storeId: string,
    themeId: string,
    version: number,
  ): Promise<ThemeRecord | null>;
  /** Vitrin: mağazanın PUBLISHED temasının PUBLISHED versiyon belgesi. */
  getPublishedDocument(
    storeId: string,
  ): Promise<{ document: Prisma.JsonValue; schemaVersion: number } | null>;
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
          versions: {
            create: {
              storeId,
              version: 1,
              status: "DRAFT",
              schemaVersion: input.schemaVersion,
              document: input.document as Prisma.InputJsonValue,
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

    async saveDraft(storeId, themeId, input) {
      const theme = await prisma.theme.findFirst({
        where: { id: themeId, storeId },
        select: themeSelect,
      });
      if (!theme) return null;
      const draft = currentDraft(theme);
      if (draft) {
        await prisma.themeVersion.update({
          where: { id: draft.id },
          data: {
            document: input.document as Prisma.InputJsonValue,
            schemaVersion: input.schemaVersion,
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
            label: input.label ?? null,
          },
        });
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
        // Draft → PUBLISHED.
        await tx.themeVersion.update({
          where: { id: draft.id },
          data: {
            status: "PUBLISHED",
            publishedAt: now,
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
        });
        // Mağaza başına tek PUBLISHED tema: diğer published temalar → ARCHIVED.
        await tx.theme.updateMany({
          where: { storeId, status: "PUBLISHED", id: { not: themeId } },
          data: { status: "ARCHIVED" },
        });
        await tx.theme.update({ where: { id: themeId }, data: { status: "PUBLISHED" } });
        // Düzenlemeye devam için yeni DRAFT snapshot (published belgeden kopya).
        const nextVersion = (theme.versions[0]?.version ?? 0) + 1;
        await tx.themeVersion.create({
          data: {
            themeId,
            storeId,
            version: nextVersion,
            status: "DRAFT",
            schemaVersion: draft.schemaVersion,
            document: draft.document as Prisma.InputJsonValue,
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
              label: `rollback:v${version}`,
            },
          });
        }
        return tx.theme.findFirst({ where: { id: themeId, storeId }, select: themeSelect });
      });
    },

    async getPublishedDocument(storeId) {
      const version = await prisma.themeVersion.findFirst({
        where: { storeId, status: "PUBLISHED", theme: { status: "PUBLISHED" } },
        select: { document: true, schemaVersion: true },
        orderBy: { publishedAt: "desc" },
      });
      return version ?? null;
    },
  };
}
