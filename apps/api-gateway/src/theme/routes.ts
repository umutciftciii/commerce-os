/**
 * TODO-158B (ADR-087) — Enterprise Theme Engine store-admin uçları.
 *
 * Güvenlik:
 *  - Tüm uçlar requireStoreAdmin (platform admin + store scope) ile korunur.
 *  - Store izolasyonu: tüm sorgular {storeId} scoped; başka store'un teması 404.
 *  - Belge doğrulaması TEK otorite: @commerce-os/theme `validateThemeDocument` +
 *    referans bütünlüğü (`collectResolutionErrors`). Geçersiz → 400.
 *  - customCss sunucu tarafında `sanitizeCustomCss` ile temizlenir (unsafe injection YOK).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  themeListResponseSchema,
  themeDetailSchema,
  themeCreateRequestSchema,
  themeUpdateRequestSchema,
  themeDraftUpdateRequestSchema,
  themePublishRequestSchema,
  themeRollbackRequestSchema,
  themeImportRequestSchema,
  themeExportResponseSchema,
  themePresetListResponseSchema,
  themePreviewResponseSchema,
} from "@commerce-os/contracts";
import {
  DEFAULT_THEME_DOCUMENT,
  THEME_PRESETS,
  getPreset,
  validateThemeDocument,
  collectResolutionErrors,
  sanitizeCustomCss,
  generateStorefrontThemeCss,
  exportThemeJson,
  importTheme,
  type ThemeDocument,
} from "@commerce-os/theme";
import type { ThemeDataAccess, ThemeRecord, ThemeVersionRecord } from "./data.js";

export interface ThemeAdminRoutesDeps {
  dataAccess: ThemeDataAccess;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

const storeParam = z.object({ storeId: z.string().min(1) });
const themeParam = z.object({ storeId: z.string().min(1), themeId: z.string().min(1) });

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

function docColorScheme(document: unknown): string {
  const meta = (document as { meta?: { colorScheme?: unknown } } | null)?.meta;
  return typeof meta?.colorScheme === "string" ? meta.colorScheme : "light";
}

/** Depolanmış JSON belgeyi doğrulanmış ThemeDocument'e çevirir (geçersizse null). */
function asDocument(value: unknown): ThemeDocument | null {
  const result = validateThemeDocument(value);
  return result.ok ? result.document : null;
}

function currentDraft(theme: ThemeRecord): ThemeVersionRecord | undefined {
  return theme.versions.find((v) => v.status === "DRAFT");
}
function currentPublished(theme: ThemeRecord): ThemeVersionRecord | undefined {
  return theme.versions.find((v) => v.status === "PUBLISHED");
}
/** Düzenlenebilir güncel belge: draft öncelikli, yoksa published. */
function activeDocument(theme: ThemeRecord): ThemeVersionRecord | undefined {
  return currentDraft(theme) ?? currentPublished(theme);
}

function serializeVersionDoc(version: ThemeVersionRecord) {
  return {
    version: version.version,
    status: version.status,
    schemaVersion: version.schemaVersion,
    document: version.document as Record<string, unknown>,
  };
}

function serializeSummary(theme: ThemeRecord) {
  const draft = currentDraft(theme);
  const published = currentPublished(theme);
  const active = draft ?? published;
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    status: theme.status,
    source: theme.source,
    colorScheme: docColorScheme(active?.document),
    versionCount: theme.versions.length,
    publishedVersion: published?.version ?? null,
    draftVersion: draft?.version ?? null,
    updatedAt: theme.updatedAt.toISOString(),
  };
}

function serializeDetail(theme: ThemeRecord) {
  const draft = currentDraft(theme);
  const published = currentPublished(theme);
  const active = draft ?? published;
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    status: theme.status,
    source: theme.source,
    colorScheme: docColorScheme(active?.document),
    draft: draft ? serializeVersionDoc(draft) : null,
    published: published ? serializeVersionDoc(published) : null,
    versions: theme.versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      schemaVersion: v.schemaVersion,
      label: v.label,
      notes: v.notes,
      createdAt: v.createdAt.toISOString(),
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    })),
  };
}

/** Bir belgeyi güvenli hale getirir: customCss'i temizler. Kopya döndürür. */
function withSanitizedCustomCss(document: ThemeDocument): ThemeDocument {
  if (!document.customCss) return document;
  const { css } = sanitizeCustomCss(document.customCss);
  return { ...document, customCss: css };
}

/** Bir preset id'sinden (veya varsayılandan) başlangıç belgesi kurar; adı uygular. */
function initialDocument(presetId: string | undefined, name: string): ThemeDocument {
  const base = presetId ? getPreset(presetId)?.document : undefined;
  const source = base ?? DEFAULT_THEME_DOCUMENT;
  return { ...source, meta: { ...source.meta, name } };
}

export function registerThemeAdminRoutes(app: FastifyInstance, deps: ThemeAdminRoutesDeps): void {
  const { dataAccess, requireStoreAdmin, recordAudit } = deps;

  // ── Preset kataloğu ──────────────────────────────────────────────────────
  app.get("/stores/:storeId/theme/presets", async (request, reply) => {
    const { storeId } = storeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    return themePresetListResponseSchema.parse({
      presets: THEME_PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description })),
    });
  });

  // ── Liste ────────────────────────────────────────────────────────────────
  app.get("/stores/:storeId/themes", async (request, reply) => {
    const { storeId } = storeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const themes = await dataAccess.listThemes(storeId);
    return themeListResponseSchema.parse({ themes: themes.map(serializeSummary) });
  });

  // ── Oluştur (preset'ten veya varsayılandan) ────────────────────────────────
  app.post("/stores/:storeId/themes", async (request, reply) => {
    const { storeId } = storeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const body = themeCreateRequestSchema.parse(request.body);
    if (body.presetId && !getPreset(body.presetId)) {
      return reply.code(400).send(errorBody("THEME_PRESET_NOT_FOUND", "Unknown preset."));
    }
    const document = withSanitizedCustomCss(initialDocument(body.presetId, body.name));
    const created = await dataAccess.createTheme(storeId, {
      name: body.name,
      description: body.description ?? null,
      source: body.presetId ?? "default",
      schemaVersion: document.schemaVersion,
      document: document as unknown as Record<string, unknown>,
    });
    await recordAudit({
      action: "CREATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "Theme",
      entityId: created.id,
      metadata: { source: created.source },
    });
    return reply.code(201).send(themeDetailSchema.parse(serializeDetail(created)));
  });

  // ── Detay ──────────────────────────────────────────────────────────────────
  app.get("/stores/:storeId/themes/:themeId", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    return themeDetailSchema.parse(serializeDetail(theme));
  });

  // ── Meta güncelle ──────────────────────────────────────────────────────────
  app.patch("/stores/:storeId/themes/:themeId", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const body = themeUpdateRequestSchema.parse(request.body);
    const updated = await dataAccess.updateThemeMeta(storeId, themeId, body);
    if (!updated) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "Theme",
      entityId: themeId,
    });
    return themeDetailSchema.parse(serializeDetail(updated));
  });

  // ── Sil (yayındaki tema silinemez) ─────────────────────────────────────────
  app.delete("/stores/:storeId/themes/:themeId", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    if (theme.status === "PUBLISHED") {
      return reply
        .code(409)
        .send(errorBody("THEME_PUBLISHED_DELETE", "Cannot delete the published theme."));
    }
    await dataAccess.deleteTheme(storeId, themeId);
    await recordAudit({
      action: "DELETE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "Theme",
      entityId: themeId,
    });
    return reply.code(204).send();
  });

  // ── Draft belgeyi kaydet (doğrula + sanitize) ──────────────────────────────
  app.put("/stores/:storeId/themes/:themeId/draft", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const body = themeDraftUpdateRequestSchema.parse(request.body);
    const validation = validateThemeDocument(body.document);
    if (!validation.ok) {
      return reply
        .code(400)
        .send(errorBody("INVALID_THEME_DOCUMENT", "Theme document is invalid.", {
          issues: validation.errors,
        }));
    }
    const refErrors = collectResolutionErrors(validation.document);
    if (refErrors.length > 0) {
      return reply
        .code(400)
        .send(errorBody("INVALID_THEME_REFERENCES", "Unresolved token references.", {
          issues: refErrors,
        }));
    }
    const document = withSanitizedCustomCss(validation.document);
    const saved = await dataAccess.saveDraft(storeId, themeId, {
      document: document as unknown as Record<string, unknown>,
      schemaVersion: document.schemaVersion,
      label: body.label ?? null,
    });
    if (!saved) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "Theme",
      entityId: themeId,
      metadata: { op: "saveDraft" },
    });
    return themeDetailSchema.parse(serializeDetail(saved));
  });

  // ── Publish ────────────────────────────────────────────────────────────────
  app.post("/stores/:storeId/themes/:themeId/publish", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const body = themePublishRequestSchema.parse(request.body ?? {});
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    if (!currentDraft(theme)) {
      return reply
        .code(409)
        .send(errorBody("THEME_NO_DRAFT", "No draft version to publish."));
    }
    const published = await dataAccess.publishTheme(storeId, themeId, { notes: body.notes ?? null });
    if (!published) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "Theme",
      entityId: themeId,
      metadata: { op: "publish" },
    });
    return themeDetailSchema.parse(serializeDetail(published));
  });

  // ── Rollback (versiyonu yeni draft olarak geri yükle) ──────────────────────
  app.post("/stores/:storeId/themes/:themeId/rollback", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const body = themeRollbackRequestSchema.parse(request.body);
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    if (!theme.versions.some((v) => v.version === body.version)) {
      return reply.code(404).send(errorBody("THEME_VERSION_NOT_FOUND", "Version not found."));
    }
    const restored = await dataAccess.rollbackToVersion(storeId, themeId, body.version);
    if (!restored) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "Theme",
      entityId: themeId,
      metadata: { op: "rollback", version: body.version },
    });
    return themeDetailSchema.parse(serializeDetail(restored));
  });

  // ── Canlı önizleme (draft belgenin çözülmüş CSS'i) ─────────────────────────
  app.get("/stores/:storeId/themes/:themeId/preview", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    const active = activeDocument(theme);
    const document = active ? asDocument(active.document) : null;
    if (!document) {
      return reply.code(422).send(errorBody("THEME_UNRESOLVABLE", "Theme document unresolvable."));
    }
    return themePreviewResponseSchema.parse({
      css: generateStorefrontThemeCss(document),
      colorScheme: document.meta.colorScheme,
      schemaVersion: document.schemaVersion,
    });
  });

  // ── Export (JSON zarf) ─────────────────────────────────────────────────────
  app.get("/stores/:storeId/themes/:themeId/export", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    const active = activeDocument(theme);
    const document = active ? asDocument(active.document) : null;
    if (!document) {
      return reply.code(422).send(errorBody("THEME_UNRESOLVABLE", "Theme document unresolvable."));
    }
    return themeExportResponseSchema.parse({ json: exportThemeJson(document) });
  });

  // ── Import (yeni tema olarak) ──────────────────────────────────────────────
  app.post("/stores/:storeId/themes/import", async (request, reply) => {
    const { storeId } = storeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const body = themeImportRequestSchema.parse(request.body);
    const result = importTheme(body.data);
    if (!result.ok) {
      return reply
        .code(400)
        .send(errorBody("INVALID_THEME_IMPORT", "Theme import invalid.", { issues: result.errors }));
    }
    const name = body.name ?? result.document.meta.name;
    const document = withSanitizedCustomCss({
      ...result.document,
      meta: { ...result.document.meta, name },
    });
    const created = await dataAccess.createTheme(storeId, {
      name,
      description: null,
      source: "import",
      schemaVersion: document.schemaVersion,
      document: document as unknown as Record<string, unknown>,
    });
    await recordAudit({
      action: "CREATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "Theme",
      entityId: created.id,
      metadata: { source: "import" },
    });
    return reply.code(201).send(themeDetailSchema.parse(serializeDetail(created)));
  });
}
