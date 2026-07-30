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
  themeBindingResponseSchema,
  themeBindingAssignRequestSchema,
} from "@commerce-os/contracts";
import {
  DEFAULT_THEME_DOCUMENT,
  THEME_PRESETS,
  getPreset,
  validateThemeDocument,
  collectResolutionErrors,
  collectThemeTokenIssues,
  REASON_TO_ERROR_CODE,
  sanitizeCustomCss,
  generateStorefrontThemeCss,
  exportThemeJson,
  importTheme,
  type ThemeDocument,
  type TokenIssue,
  // TODO-164 — theme-key registry + layout preset + config + compatibility.
  BASE_THEME_KEY,
  BASE_LAYOUT_PRESET_KEY,
  THEME_API_VERSION,
  parseThemeConfig,
  themeConfigSchema,
  checkThemeKeyCompatibility,
  compatibilityErrors,
  getThemeEntry,
  THEME_REGISTRY,
  type ThemeConfig,
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
  /** TODO-164 — yayınlanmış tema değişince vitrin resolver cache'ini geçersiz kıl. */
  invalidateResolvedTheme?: (storeId: string) => void;
}

const storeParam = z.object({ storeId: z.string().min(1) });
const themeParam = z.object({ storeId: z.string().min(1), themeId: z.string().min(1) });

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

// H-1 — Typed theme token savunması. En-şiddetli sorun sınıfı hata kodunu seçer.
const TOKEN_REASON_SEVERITY = ["UNSAFE_VALUE", "TYPE_MISMATCH", "INVALID_VALUE", "UNKNOWN"] as const;

/**
 * Token sorunlarından güvenli bir hata gövdesi kurar. GÜVENLİK: yanıt ham
 * (saldırgan) DEĞER veya validation regex'i TAŞIMAZ — yalnız path/layer/type/reason.
 */
function tokenIssuesBody(issues: TokenIssue[], overrideCode?: string) {
  const top = [...issues].sort(
    (a, b) => TOKEN_REASON_SEVERITY.indexOf(a.reason) - TOKEN_REASON_SEVERITY.indexOf(b.reason),
  )[0];
  const code = overrideCode ?? REASON_TO_ERROR_CODE[top.reason];
  return errorBody(code, "Theme token failed typed validation.", {
    details: {
      tokens: issues.slice(0, 50).map((i) => ({
        path: i.path,
        layer: i.layer,
        type: i.type,
        reason: i.reason,
      })),
    },
  });
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
    config: (version.config ?? {}) as Record<string, unknown>,
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
    themeKey: theme.themeKey,
    layoutPreset: theme.layoutPreset,
    themeApiVersion: theme.themeApiVersion,
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
    themeKey: theme.themeKey,
    layoutPreset: theme.layoutPreset,
    themeApiVersion: theme.themeApiVersion,
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

/** Yeni tema BASE_COMMERCE binding ile başlar (geriye uyumlu; store admin layout preset'i sonra seçer). */
const INITIAL_THEME_CONFIG = {
  themeKey: BASE_THEME_KEY,
  layoutPreset: BASE_LAYOUT_PRESET_KEY,
  slots: {},
} as const;

/**
 * TODO-164 — Gönderilen config'i doğrular + compatibility denetler. Geçerli config'i
 * (render-safe) döndürür; hata varsa hata gövdesi. themeKey/layoutPreset registry'ye
 * karşı; slot variant'lar allowlist'e karşı denetlenir.
 */
function validateConfig(
  raw: unknown,
): { ok: true; config: ThemeConfig } | { ok: false; code: string; issues: unknown[] } {
  const parsed = themeConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_THEME_CONFIG",
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  // GÜVENLİK/DOĞRULAMA: compatibility HAM themeKey/slot'a bakar (bilinmeyen key
  // REDDEDİLİR). parseThemeConfig bilinmeyen key'i base'e düşürür — bu RESOLVER
  // fail-closed davranışıdır (runtime crash yok), ama doğrulama sessizce
  // downgrade ETMEMELİ; yoksa "invalid theme publish edilemez" ihlal olurdu.
  const compat = checkThemeKeyCompatibility(parsed.data.themeKey, {
    slotSelections: parsed.data.slots,
  });
  const errors = compatibilityErrors(compat);
  if (errors.length > 0) {
    return {
      ok: false,
      code: "THEME_INCOMPATIBLE",
      issues: errors.map((e) => ({ code: e.code, slot: e.slot, message: e.message })),
    };
  }
  return { ok: true, config: parseThemeConfig(parsed.data) };
}

/** Depolanmış (ham) config'in yayınlanabilir olup olmadığı — publish gate için. */
function rawConfigCompatible(
  rawConfig: unknown,
): { ok: true } | { ok: false; issues: unknown[] } {
  const parsed = themeConfigSchema.safeParse(rawConfig ?? {});
  // Şema bile geçmiyorsa yayınlanamaz (bozuk config).
  const themeKey = parsed.success ? parsed.data.themeKey : "";
  const slots = parsed.success ? parsed.data.slots : undefined;
  const compat = checkThemeKeyCompatibility(themeKey, { slotSelections: slots });
  const errors = compatibilityErrors(compat);
  if (errors.length > 0) {
    return { ok: false, issues: errors.map((e) => ({ code: e.code, slot: e.slot, message: e.message })) };
  }
  return { ok: true };
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
      themeKey: BASE_THEME_KEY,
      layoutPreset: BASE_LAYOUT_PRESET_KEY,
      themeApiVersion: THEME_API_VERSION,
      config: INITIAL_THEME_CONFIG,
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
    // H-1 — typed token savunması: bilinmeyen/tip-uyumsuz/güvensiz token reddedilir.
    const tokenIssues = collectThemeTokenIssues(validation.document);
    if (tokenIssues.length > 0) {
      return reply.code(400).send(tokenIssuesBody(tokenIssues));
    }
    // TODO-164 — layout/slot config doğrulaması + compatibility (gönderildiyse).
    let configPatch: { config: ThemeConfig; themeKey: string; layoutPreset: string } | undefined;
    if (body.config !== undefined) {
      const cfg = validateConfig(body.config);
      if (!cfg.ok) {
        return reply.code(400).send(errorBody(cfg.code, "Theme config is invalid.", { issues: cfg.issues }));
      }
      configPatch = { config: cfg.config, themeKey: cfg.config.themeKey, layoutPreset: cfg.config.layoutPreset };
    }
    const document = withSanitizedCustomCss(validation.document);
    const saved = await dataAccess.saveDraft(storeId, themeId, {
      document: document as unknown as Record<string, unknown>,
      schemaVersion: document.schemaVersion,
      label: body.label ?? null,
      ...(configPatch
        ? {
            config: configPatch.config as unknown as Record<string, unknown>,
            themeKey: configPatch.themeKey,
            layoutPreset: configPatch.layoutPreset,
          }
        : {}),
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
    const draft = currentDraft(theme);
    if (!draft) {
      return reply
        .code(409)
        .send(errorBody("THEME_NO_DRAFT", "No draft version to publish."));
    }
    // H-1 — Geçersiz/legacy token içeren draft YAYINLANAMAZ (save-time bypass'ı
    // veya bu düzeltmeden önce kaydedilmiş bozuk draft'lara karşı ikinci kapı).
    const draftDoc = asDocument(draft.document);
    if (!draftDoc) {
      return reply
        .code(409)
        .send(errorBody("THEME_PUBLISH_BLOCKED", "Draft document is unresolvable."));
    }
    const publishIssues = collectThemeTokenIssues(draftDoc);
    if (publishIssues.length > 0) {
      return reply.code(409).send(tokenIssuesBody(publishIssues, "THEME_PUBLISH_BLOCKED"));
    }
    // TODO-164 — compatibility gate: uyumsuz theme-key/layout/slot config YAYINLANAMAZ
    // (mevcut published korunur; storefront base fallback'te kalır). HAM config'e bakar
    // (save-time bypass'a / bu düzeltmeden önce kaydedilmiş bozuk config'e karşı ikinci kapı).
    const draftConfig = parseThemeConfig(draft.config);
    const rawCompat = rawConfigCompatible(draft.config);
    if (!rawCompat.ok) {
      return reply.code(409).send(
        errorBody("THEME_INCOMPATIBLE", "Theme is incompatible and cannot be published.", {
          issues: rawCompat.issues,
        }),
      );
    }
    const published = await dataAccess.publishTheme(storeId, themeId, {
      notes: body.notes ?? null,
      publishedBy: admin.actorUserId,
    });
    if (!published) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    deps.invalidateResolvedTheme?.(storeId);
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "Theme",
      entityId: themeId,
      metadata: { op: "publish", themeKey: draftConfig.themeKey, layoutPreset: draftConfig.layoutPreset },
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
    // H-1 — içe aktarılan belge de typed token savunmasından geçer.
    const importIssues = collectThemeTokenIssues(result.document);
    if (importIssues.length > 0) {
      return reply.code(400).send(tokenIssuesBody(importIssues));
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
      themeKey: BASE_THEME_KEY,
      layoutPreset: BASE_LAYOUT_PRESET_KEY,
      themeApiVersion: THEME_API_VERSION,
      config: INITIAL_THEME_CONFIG,
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TODO-164 (ADR-222) — Platform Admin "Tema ve Marka" (theme-binding).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Platform admin bir mağazanın aktif temasını görüntüler + theme-key atar. Auth
 * PLATFORM ADMIN (store scope); THEME_STUDIO capability ile GATE'LENMEZ (yönetim
 * eylemi her zaman mümkün) — capability durumu yanıtta bilgi olarak taşınır.
 * İç token belgesi / draft config SIZMAZ; yalnız yönetim özeti + registry projeksiyonu.
 */
export interface ThemeBindingRoutesDeps {
  dataAccess: ThemeDataAccess;
  requirePlatformStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  isThemeStudioEnabled: (storeId: string) => Promise<boolean>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  invalidateResolvedTheme?: (storeId: string) => void;
}

export function registerThemeBindingRoutes(app: FastifyInstance, deps: ThemeBindingRoutesDeps): void {
  const { dataAccess, requirePlatformStoreAdmin, isThemeStudioEnabled, recordAudit } = deps;

  async function buildBinding(storeId: string) {
    const [themes, capabilityEnabled] = await Promise.all([
      dataAccess.listThemes(storeId),
      isThemeStudioEnabled(storeId),
    ]);
    const publishedTheme = themes.find((t) => t.status === "PUBLISHED");
    const publishedVer = publishedTheme?.versions.find((v) => v.status === "PUBLISHED");
    // UYUMLULUK vitrin resolver'ıyla AYNI KAYNAKTAN türetilir: PUBLISHED versiyonun
    // HAM config'i (Theme-seviyesi denormalize key değil) — böylece binding uyarısı
    // storefront'un gerçekten ne render ettiğini yansıtır (engine upgrade / bozuk config).
    const rawConfig = themeConfigSchema.safeParse(publishedVer?.config ?? {});
    const configThemeKey = rawConfig.success ? rawConfig.data.themeKey : "";
    const configSlots = rawConfig.success ? rawConfig.data.slots : {};
    const activeThemeKey = configThemeKey || publishedTheme?.themeKey || BASE_THEME_KEY;
    const layoutPreset = publishedTheme?.layoutPreset ?? BASE_LAYOUT_PRESET_KEY;
    const themeApiVersion = publishedTheme?.themeApiVersion ?? THEME_API_VERSION;
    const publishedVersion = publishedVer?.version ?? null;
    const draftVersion = publishedTheme?.versions.find((v) => v.status === "DRAFT")?.version ?? null;
    const archived = (publishedTheme?.versions ?? []).filter((v) => v.status === "ARCHIVED");
    const previousPublishedVersion = archived.length > 0 ? Math.max(...archived.map((v) => v.version)) : null;
    const lastPublishedAt = publishedVer?.publishedAt?.toISOString() ?? null;

    const entry = getThemeEntry(activeThemeKey);
    const compat = checkThemeKeyCompatibility(activeThemeKey, { slotSelections: configSlots });

    const assignable = THEME_REGISTRY.map((e) => ({
      key: e.key,
      nameTr: e.nameTr,
      nameEn: e.nameEn,
      kind: e.kind,
      layoutPreset: e.layoutPreset,
      status: e.status,
      compatible: checkThemeKeyCompatibility(e.key).compatible,
    }));

    return themeBindingResponseSchema.parse({
      storeId,
      activeThemeKey,
      activeThemeName: entry?.nameTr ?? activeThemeKey,
      kind: entry?.kind ?? "BASE",
      layoutPreset,
      themeApiVersion,
      publishedVersion,
      draftVersion,
      previousPublishedVersion,
      lastPublishedAt,
      rollbackAvailable: previousPublishedVersion !== null,
      capabilityEnabled,
      updateAvailable: entry ? entry.version > (publishedTheme?.themeApiVersion ?? entry.version) : false,
      compatible: compat.compatible,
      issues: compat.issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        slot: i.slot,
        message: i.message,
      })),
      assignableThemes: assignable,
    });
  }

  // ── Görüntüle ──────────────────────────────────────────────────────────────
  app.get("/admin/stores/:storeId/theme-binding", async (request, reply) => {
    const { storeId } = storeParam.parse(request.params);
    const admin = await requirePlatformStoreAdmin(request, reply, storeId);
    if (!admin) return;
    return buildBinding(storeId);
  });

  // ── Ata (theme-key) ──────────────────────────────────────────────────────────
  app.put("/admin/stores/:storeId/theme-binding", async (request, reply) => {
    const { storeId } = storeParam.parse(request.params);
    const admin = await requirePlatformStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const body = themeBindingAssignRequestSchema.parse(request.body);
    // Bilinmeyen/uyumsuz theme-key atanamaz (registry tek otorite).
    const compat = checkThemeKeyCompatibility(body.themeKey);
    const errors = compatibilityErrors(compat);
    if (errors.length > 0) {
      return reply.code(409).send(
        errorBody("THEME_INCOMPATIBLE", "Theme cannot be assigned.", {
          issues: errors.map((e) => ({ code: e.code, slot: e.slot, message: e.message })),
        }),
      );
    }
    const entry = getThemeEntry(body.themeKey)!;
    const assigned = await dataAccess.assignThemeBinding(storeId, {
      themeKey: entry.key,
      layoutPreset: entry.layoutPreset,
      themeApiVersion: entry.themeApiVersion,
      publishedBy: admin.actorUserId,
    });
    if (!assigned) {
      return reply.code(404).send(errorBody("THEME_NOT_FOUND", "No theme to assign for this store."));
    }
    deps.invalidateResolvedTheme?.(storeId);
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "ThemeBinding",
      entityId: storeId,
      metadata: { op: "assign", themeKey: entry.key, layoutPreset: entry.layoutPreset },
    });
    return buildBinding(storeId);
  });
}
