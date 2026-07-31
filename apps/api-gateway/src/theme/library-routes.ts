/**
 * TODO-164B Dilim 2 (ADR-238…245) — Platform Theme Library, Designer & Controlled Rollout.
 *
 * Platform Admin (SUPER_ADMIN) uçları. Template'ler sentetik "tema kütüphanesi" mağazasında
 * yaşar (systemPurpose=THEME_LIBRARY); mevcut Theme/ThemeVersion motoru AYNEN kullanılır
 * (paralel motor YOK). Güvenlik:
 *  - Yalnız SUPER_ADMIN kütüphaneyi mutate eder (requirePlatformAdmin).
 *  - Sistem mağazası storefront/public/fleet/tenant seçiminden zaten dışlanır.
 *  - Belge doğrulama TEK otorite (@commerce-os/theme); raw HTML/JS/CSS YOK (H-1 + sanitize).
 *  - Assignment published template snapshot'ını KOPYALAR (runtime bağı yok); başka mağazayı
 *    etkilemez; bir mağaza başarısız olduğunda diğerleri sessizce başarılı sayılmaz.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  libraryListResponseSchema,
  libraryTemplateCreateRequestSchema,
  themeDetailSchema,
  themeUpdateRequestSchema,
  themeDraftUpdateRequestSchema,
  themePublishRequestSchema,
  themeRollbackRequestSchema,
  themeDuplicateRequestSchema,
  themePolicyUpdateRequestSchema,
  themeChangeSummarySchema,
  templateUsageResponseSchema,
  assignableStoresResponseSchema,
  themeAssignPreviewRequestSchema,
  themeAssignPreviewResponseSchema,
  themeAssignRequestSchema,
  rolloutSummaryResponseSchema,
  libraryPreviewTokenRequestSchema,
  themeStageAssetsRequestSchema,
  themePreviewTokenResponseSchema,
} from "@commerce-os/contracts";
import {
  validateThemeDocument,
  collectResolutionErrors,
  collectThemeTokenIssues,
  resolveStartingPoint,
  isThemeStartingPoint,
  parseOverridePolicy,
  validateOverridePolicy,
  isPolicyExplicit,
  missingPolicyFields,
  checkThemeKeyCompatibility,
  compatibilityErrors,
  summarizeThemeChanges,
  summarizeRollout,
  computeUpdateAvailable,
  isAssignableTemplateStatus,
  THEME_API_VERSION,
  type ThemeDocument,
  type ThemeDiffSide,
  type RolloutStoreResult,
} from "@commerce-os/theme";
import type { ThemeDataAccess, ThemeRecord, ThemeVersionRecord } from "./data.js";
import {
  errorBody,
  serializeDetail,
  asDocument,
  currentDraft,
  currentPublished,
  withSanitizedCustomCss,
  validateConfig,
  rawConfigCompatible,
  contrastFailureBody,
  tokenIssuesBody,
  policyConfigView,
  themeMediaErrorResponse,
} from "./routes.js";

export interface ThemeLibraryRoutesDeps {
  dataAccess: ThemeDataAccess;
  /** Platform Admin (SUPER_ADMIN) — store-scope YOK. */
  requirePlatformAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  invalidateResolvedTheme?: (storeId: string) => void;
  /** İmzalı, kısa ömürlü, store+theme+version scoped preview token. */
  issuePreviewToken?: (
    storeId: string,
    themeId: string,
    version?: number,
  ) => { token: string; expiresAt: Date };
}

const themeIdParam = z.object({ themeId: z.string().min(1) });

/** Bir sürümden diff/policy state kurar (document + config + document.assets). */
function diffSideFromVersion(
  version: ThemeVersionRecord | undefined,
  policy?: ReturnType<typeof parseOverridePolicy>,
): ThemeDiffSide | null {
  if (!version) return null;
  const doc = asDocument(version.document);
  if (!doc) return null;
  const assets = (doc.assets ?? {}) as { logoMediaId?: string | null; faviconMediaId?: string | null };
  return {
    state: { document: doc, config: policyConfigView(version.config) },
    assets: { logoMediaId: assets.logoMediaId ?? null, faviconMediaId: assets.faviconMediaId ?? null },
    ...(policy ? { policy } : {}),
  };
}

function publishedOrDraft(theme: ThemeRecord): ThemeVersionRecord | undefined {
  return currentPublished(theme) ?? currentDraft(theme);
}

/** Kütüphane liste satırı. */
function serializeLibrarySummary(theme: ThemeRecord, usage: { sourceThemeVersion: number | null }[]) {
  const draft = currentDraft(theme);
  const published = currentPublished(theme);
  const active = draft ?? published;
  const compat = checkThemeKeyCompatibility(theme.themeKey);
  const policy = parseOverridePolicy(theme.overridePolicy);
  const publishedVersion = published?.version ?? null;
  const updatePendingCount = usage.filter((u) =>
    computeUpdateAvailable(u.sourceThemeVersion, publishedVersion),
  ).length;
  const meta = (active?.document as { meta?: { colorScheme?: unknown } } | null)?.meta;
  const colorScheme = typeof meta?.colorScheme === "string" ? meta.colorScheme : "light";
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    themeKey: theme.themeKey,
    status: theme.status,
    ownerScope: theme.ownerScope,
    compatible: compat.compatible,
    sourcePreset: theme.source,
    colorScheme,
    publishedVersion,
    draftVersion: draft?.version ?? null,
    policyComplete: theme.overridePolicy != null && isPolicyExplicit(policy),
    usingCount: usage.length,
    updatePendingCount,
    updatedAt: theme.updatedAt.toISOString(),
    lastPublishedAt: published?.publishedAt ? published.publishedAt.toISOString() : null,
  };
}

export function registerThemeLibraryRoutes(app: FastifyInstance, deps: ThemeLibraryRoutesDeps): void {
  const { dataAccess, requirePlatformAdmin, recordAudit } = deps;

  /** Kütüphane sistem mağaza id'sini (get-or-create) döndürür. */
  async function libStoreId(): Promise<string> {
    const store = await dataAccess.ensureThemeLibraryStore();
    return store.id;
  }

  // ── Liste ────────────────────────────────────────────────────────────────
  app.get("/admin/theme-library", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const storeId = await libStoreId();
    const themes = await dataAccess.listThemes(storeId);
    const templates = await Promise.all(
      themes.map(async (t) => {
        const usage = await dataAccess.listTemplateUsage(t.id);
        return serializeLibrarySummary(t, usage);
      }),
    );
    return libraryListResponseSchema.parse({ templates });
  });

  // ── Oluştur ────────────────────────────────────────────────────────────────
  app.post("/admin/theme-library", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const body = libraryTemplateCreateRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    // Başlangıç noktası → config + document snapshot (registry MUTATE edilmez).
    const startKey = body.startingPoint && isThemeStartingPoint(body.startingPoint) ? body.startingPoint : "BASE_COMMERCE";
    const snap = resolveStartingPoint(startKey);
    const doc = withSanitizedCustomCss({ ...snap.document, meta: { ...snap.document.meta, name: body.name } });
    const created = await dataAccess.createTheme(storeId, {
      name: body.name,
      description: body.description ?? null,
      source: `starting:${startKey}`,
      schemaVersion: doc.schemaVersion,
      document: doc,
      themeKey: snap.config.themeKey,
      layoutPreset: snap.config.layoutPreset,
      themeApiVersion: THEME_API_VERSION,
      config: snap.config,
      createdBy: admin.actorUserId,
      ownerScope: "PLATFORM",
    });
    await recordAudit({
      action: "CREATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "ThemeLibraryTemplate",
      entityId: created.id,
      metadata: { op: "create", startingPoint: startKey },
    });
    return reply.code(201).send(serializeDetail(created));
  });

  // ── Detay ────────────────────────────────────────────────────────────────
  app.get("/admin/theme-library/:themeId", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const storeId = await libStoreId();
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    return themeDetailSchema.parse(serializeDetail(theme));
  });

  // ── Meta güncelle ────────────────────────────────────────────────────────
  app.patch("/admin/theme-library/:themeId", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = themeUpdateRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    const updated = await dataAccess.updateThemeMeta(storeId, themeId, body);
    if (!updated) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "ThemeLibraryTemplate",
      entityId: themeId,
      metadata: { op: "meta" },
    });
    return themeDetailSchema.parse(serializeDetail(updated));
  });

  // ── Designer: draft kaydet (belge + config) ─────────────────────────────────
  app.put("/admin/theme-library/:themeId/draft", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = themeDraftUpdateRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    // Belge doğrulama (TEK otorite) + referans bütünlüğü + typed token savunması.
    const validation = validateThemeDocument(body.document);
    if (!validation.ok) {
      return reply.code(400).send(errorBody("INVALID_THEME_DOCUMENT", "Invalid theme document.", { details: { errors: validation.errors } }));
    }
    const refErrors = collectResolutionErrors(validation.document);
    if (refErrors.length > 0) {
      return reply.code(400).send(errorBody("INVALID_THEME_REFERENCES", "Unresolved token references.", { details: { errors: refErrors } }));
    }
    const tokenIssues = collectThemeTokenIssues(validation.document);
    if (tokenIssues.length > 0) return reply.code(400).send(tokenIssuesBody(tokenIssues));
    const cfg = validateConfig(body.config);
    if (!cfg.ok) return reply.code(400).send(errorBody(cfg.code, "Invalid theme config.", { details: { issues: cfg.issues } }));
    const safeDoc = withSanitizedCustomCss(validation.document);
    const saved = await dataAccess.saveDraft(storeId, themeId, {
      document: safeDoc,
      schemaVersion: safeDoc.schemaVersion,
      config: cfg.config,
      themeKey: cfg.config.themeKey,
      layoutPreset: cfg.config.layoutPreset,
      ...(body.label !== undefined ? { label: body.label } : {}),
    });
    if (!saved) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    return themeDetailSchema.parse(serializeDetail(saved));
  });

  // ── Override policy matris editörü ─────────────────────────────────────────
  app.put("/admin/theme-library/:themeId/policy", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = themePolicyUpdateRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    // Strict doğrulama (bilinmeyen alan/politika değeri REDDEDİLİR).
    const validated = validateOverridePolicy(body.overridePolicy);
    if (!validated.ok) {
      return reply.code(400).send(errorBody("THEME_POLICY_INVALID", "Invalid override policy.", { details: { errors: validated.errors } }));
    }
    const updated = await dataAccess.setOverridePolicy(storeId, themeId, validated.policy);
    if (!updated) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "ThemeLibraryTemplate",
      entityId: themeId,
      metadata: { op: "policy", policyRevision: updated.policyRevision },
    });
    return themeDetailSchema.parse(serializeDetail(updated));
  });

  // ── Yayınla ────────────────────────────────────────────────────────────────
  app.post("/admin/theme-library/:themeId/publish", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = themePublishRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    const draft = currentDraft(theme);
    if (!draft) return reply.code(409).send(errorBody("THEME_NO_DRAFT", "No draft to publish."));
    const doc = asDocument(draft.document);
    if (!doc) return reply.code(409).send(errorBody("THEME_PUBLISH_BLOCKED", "Draft document is invalid."));
    const tokenIssues = collectThemeTokenIssues(doc);
    if (tokenIssues.length > 0) return reply.code(409).send(tokenIssuesBody(tokenIssues, "THEME_PUBLISH_BLOCKED"));
    const contrast = contrastFailureBody(doc);
    if (contrast) return reply.code(409).send(contrast);
    const compat = rawConfigCompatible(draft.config);
    if (!compat.ok) return reply.code(409).send(errorBody("THEME_INCOMPATIBLE", "Draft config is incompatible.", { details: { issues: compat.issues } }));
    // Platform template → override policy EXPLICIT + BOŞ OLMAYAN olmalı (spec §5:
    // "policy boş olamaz"). null policy (hiç tanımlanmamış) publish edilemez; kısmi
    // policy de eksik alanlar nedeniyle reddedilir.
    const policy = parseOverridePolicy(theme.overridePolicy);
    if (theme.overridePolicy == null || !isPolicyExplicit(policy)) {
      return reply.code(409).send(errorBody("THEME_POLICY_INCOMPLETE", "Override policy must be explicit before publish.", {
        details: { missing: missingPolicyFields(policy) },
      }));
    }
    let published;
    try {
      published = await dataAccess.publishTheme(storeId, themeId, {
        notes: body.notes ?? null,
        publishedBy: admin.actorUserId,
      });
    } catch (err) {
      // HARDENING — geçersiz staged media → kontrollü domain hatası (ham FK 500 DEĞİL).
      // Txn geri alındı → StoreSettings/ThemeVersion DEĞİŞMEDİ.
      const mapped = themeMediaErrorResponse(err);
      if (mapped) return reply.code(mapped.status).send(mapped.body);
      throw err;
    }
    if (!published) return reply.code(409).send(errorBody("THEME_PUBLISH_BLOCKED", "Publish failed."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "ThemeLibraryTemplate",
      entityId: themeId,
      metadata: { op: "publish" },
    });
    return themeDetailSchema.parse(serializeDetail(published));
  });

  // ── Arşivle ────────────────────────────────────────────────────────────────
  app.post("/admin/theme-library/:themeId/archive", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const storeId = await libStoreId();
    const archived = await dataAccess.archiveTheme(storeId, themeId, { updatedBy: admin.actorUserId });
    if (!archived) return reply.code(409).send(errorBody("THEME_ARCHIVE_BLOCKED", "Template not found or is published."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "ThemeLibraryTemplate",
      entityId: themeId,
      metadata: { op: "archive" },
    });
    return themeDetailSchema.parse(serializeDetail(archived));
  });

  // ── Kopyala ────────────────────────────────────────────────────────────────
  app.post("/admin/theme-library/:themeId/duplicate", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = themeDuplicateRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    const copy = await dataAccess.duplicateTheme(storeId, themeId, { name: body.name, createdBy: admin.actorUserId });
    if (!copy) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    // Kopya PLATFORM ownerScope + kaynağın policy'sini korumalı; duplicate yalnız STORE
    // varsayılanıyla oluşturur → policy'yi kaynaktan taşı.
    const src = await dataAccess.getTheme(storeId, themeId);
    if (src) {
      await dataAccess.setOverridePolicy(storeId, copy.id, parseOverridePolicy(src.overridePolicy));
    }
    const withScope = (await dataAccess.updateThemeMeta(storeId, copy.id, {})) ?? copy;
    await recordAudit({
      action: "CREATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "ThemeLibraryTemplate",
      entityId: copy.id,
      metadata: { op: "duplicate", from: themeId },
    });
    return reply.code(201).send(serializeDetail(withScope));
  });

  // ── Rollback ────────────────────────────────────────────────────────────────
  app.post("/admin/theme-library/:themeId/rollback", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = themeRollbackRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    const rolled = await dataAccess.rollbackToVersion(storeId, themeId, body.version);
    if (!rolled) return reply.code(404).send(errorBody("THEME_VERSION_NOT_FOUND", "Version not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "ThemeLibraryTemplate",
      entityId: themeId,
      metadata: { op: "rollback", version: body.version },
    });
    return themeDetailSchema.parse(serializeDetail(rolled));
  });

  // ── Preview token (store+theme+version scoped) ──────────────────────────────
  app.post("/admin/theme-library/:themeId/preview-token", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = libraryPreviewTokenRequestSchema.parse(request.body ?? {});
    const storeId = await libStoreId();
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    if (!deps.issuePreviewToken) {
      return reply.code(503).send(errorBody("THEME_PREVIEW_UNAVAILABLE", "Preview not available."));
    }
    const { token, expiresAt } = deps.issuePreviewToken(storeId, themeId, body.version);
    return themePreviewTokenResponseSchema.parse({ token, expiresAt: expiresAt.toISOString() });
  });

  // ── TD-162 logo/favicon DRAFT staging ───────────────────────────────────────
  app.post("/admin/theme-library/:themeId/stage-assets", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = themeStageAssetsRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    let staged;
    try {
      staged = await dataAccess.stageThemeAssets(storeId, themeId, body);
    } catch (err) {
      const mapped = themeMediaErrorResponse(err);
      if (mapped) return reply.code(mapped.status).send(mapped.body);
      throw err;
    }
    if (!staged) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template or draft not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "ThemeLibraryTemplate",
      entityId: themeId,
      metadata: { op: "stage-assets" },
    });
    return themeDetailSchema.parse(serializeDetail(staged));
  });

  // ── Before/after diff (iki sürüm arası) ─────────────────────────────────────
  app.get("/admin/theme-library/:themeId/diff", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const q = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .parse(request.query);
    const storeId = await libStoreId();
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    const pickVersion = (which: string | undefined, fallback: ThemeVersionRecord | undefined) => {
      if (which === "published") return currentPublished(theme);
      if (which === "draft") return currentDraft(theme);
      if (which && /^\d+$/.test(which)) return theme.versions.find((v) => v.version === Number(which));
      return fallback;
    };
    const prevVer = pickVersion(q.from, currentPublished(theme));
    const nextVer = pickVersion(q.to, currentDraft(theme));
    const policy = parseOverridePolicy(theme.overridePolicy);
    const prev = diffSideFromVersion(prevVer, policy);
    const next = diffSideFromVersion(nextVer, policy);
    if (!prev || !next) {
      return themeChangeSummarySchema.parse({ changes: [], counts: {}, total: 0, hasChanges: false });
    }
    return themeChangeSummarySchema.parse(summarizeThemeChanges(prev, next));
  });

  // ── Kullanan mağazalar (usage + update-pending) ─────────────────────────────
  app.get("/admin/theme-library/:themeId/usage", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const storeId = await libStoreId();
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    const publishedVersion = currentPublished(theme)?.version ?? null;
    const rows = await dataAccess.listTemplateUsage(themeId);
    const usage = rows.map((r) => ({
      storeId: r.storeId,
      storeName: r.storeName,
      storeSlug: r.storeSlug,
      storeStatus: r.storeStatus,
      sourceThemeVersion: r.sourceThemeVersion,
      updateAvailable: computeUpdateAvailable(r.sourceThemeVersion, publishedVersion),
    }));
    return templateUsageResponseSchema.parse({
      templatePublishedVersion: publishedVersion,
      usingCount: usage.length,
      updatePendingCount: usage.filter((u) => u.updateAvailable).length,
      usage,
    });
  });

  // ── Atanabilir mağazalar ────────────────────────────────────────────────────
  app.get("/admin/theme-library/assignable-stores", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const stores = await dataAccess.listAssignableStores();
    return assignableStoresResponseSchema.parse({ stores });
  });

  // ── Atama/rollout dry-run önizleme ──────────────────────────────────────────
  app.post("/admin/theme-library/:themeId/assign/preview", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = themeAssignPreviewRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    const template = await dataAccess.getTheme(storeId, themeId);
    if (!template) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    const templatePublished = currentPublished(template);
    const templateSide = diffSideFromVersion(templatePublished, parseOverridePolicy(template.overridePolicy));
    const templateCompat = checkThemeKeyCompatibility(template.themeKey);
    const previews = await Promise.all(
      body.storeIds.map(async (targetStoreId) => {
        const themes = await dataAccess.listThemes(targetStoreId);
        const storeTheme = themes.find((t) => t.status === "PUBLISHED") ?? themes[0];
        const storeSide = storeTheme
          ? diffSideFromVersion(publishedOrDraft(storeTheme), parseOverridePolicy(storeTheme.overridePolicy))
          : null;
        const compatible = isAssignableTemplateStatus(template.status) && templateCompat.compatible;
        const summary =
          storeSide && templateSide ? summarizeThemeChanges(storeSide, templateSide) : { changes: [], counts: {}, total: 0, hasChanges: false };
        return {
          storeId: targetStoreId,
          storeName: storeTheme ? "" : "",
          compatible,
          issues: compatibilityErrors(templateCompat).map((e) => ({ code: e.code, severity: e.severity, slot: e.slot, message: e.message })),
          summary,
        };
      }),
    );
    // Mağaza adlarını doldur (atanabilir mağaza listesinden).
    const storeMap = new Map((await dataAccess.listAssignableStores()).map((s) => [s.id, s.name]));
    for (const p of previews) p.storeName = storeMap.get(p.storeId) ?? p.storeId;
    return themeAssignPreviewResponseSchema.parse({
      templateName: template.name,
      templatePublishedVersion: templatePublished?.version ?? null,
      previews,
    });
  });

  /** Ortak apply: verilen mağazalara published template snapshot'ını uygular. */
  async function applyTemplate(
    template: ThemeRecord,
    storeIds: string[],
    mode: "single" | "selected" | "pilot" | "all-compatible",
    overridePolicy: unknown,
    actorUserId: string,
    onlyUpdateCandidates: boolean,
  ) {
    const templatePublished = currentPublished(template);
    const results: RolloutStoreResult[] = [];
    const storeNames = new Map((await dataAccess.listAssignableStores()).map((s) => [s.id, s.name]));
    // Published olmayan template ATANAMAZ (hepsi failed).
    if (!templatePublished || !isAssignableTemplateStatus(template.status)) {
      for (const sid of storeIds) {
        results.push({ storeId: sid, storeName: storeNames.get(sid), status: "failed", reasonCode: "TEMPLATE_NOT_PUBLISHED" });
      }
      return summarizeRollout(mode, results);
    }
    const compat = checkThemeKeyCompatibility(template.themeKey);
    const doc = withSanitizedCustomCss(asDocument(templatePublished.document) ?? ({} as ThemeDocument));
    for (const sid of storeIds) {
      // INCOMPATIBLE template apply EDİLEMEZ.
      if (!compat.compatible) {
        results.push({ storeId: sid, storeName: storeNames.get(sid), status: "failed", reasonCode: "THEME_INCOMPATIBLE" });
        continue;
      }
      // update/apply modunda: yalnız gerçekten update bekleyen mağazalar; diğerleri skipped.
      if (onlyUpdateCandidates) {
        const themes = await dataAccess.listThemes(sid);
        const st = themes.find((t) => t.status === "PUBLISHED");
        if (!(st && st.sourceThemeId === template.id && computeUpdateAvailable(st.sourceThemeVersion, templatePublished.version))) {
          results.push({ storeId: sid, storeName: storeNames.get(sid), status: "skipped", reasonCode: "NO_UPDATE_PENDING" });
          continue;
        }
      }
      try {
        const assigned = await dataAccess.assignTemplateToStore(sid, {
          sourceThemeId: template.id,
          sourceThemeVersion: templatePublished.version,
          document: doc,
          schemaVersion: templatePublished.schemaVersion,
          config: templatePublished.config,
          themeKey: template.themeKey,
          layoutPreset: template.layoutPreset,
          themeApiVersion: template.themeApiVersion,
          ...(overridePolicy !== undefined ? { overridePolicy } : { overridePolicy: parseOverridePolicy(template.overridePolicy) }),
          publishedBy: actorUserId,
        });
        if (!assigned) {
          results.push({ storeId: sid, storeName: storeNames.get(sid), status: "failed", reasonCode: "STORE_HAS_NO_THEME" });
          continue;
        }
        deps.invalidateResolvedTheme?.(sid);
        const newVersion = assigned.versions.find((v) => v.status === "PUBLISHED")?.version;
        results.push({ storeId: sid, storeName: storeNames.get(sid), status: "success", newVersion });
        await recordAudit({
          action: "UPDATE",
          platformUserId: actorUserId,
          storeId: sid,
          entityType: "ThemeAssignment",
          entityId: template.id,
          metadata: { op: onlyUpdateCandidates ? "update" : "assign", templateVersion: templatePublished.version },
        });
      } catch {
        // Bir mağaza başarısız → yalnız o FAILED; diğerleri sessizce başarılı SAYILMAZ.
        results.push({ storeId: sid, storeName: storeNames.get(sid), status: "failed", reasonCode: "ASSIGN_ERROR" });
      }
    }
    return summarizeRollout(mode, results);
  }

  // ── Atama/rollout apply ─────────────────────────────────────────────────────
  app.post("/admin/theme-library/:themeId/assign", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = themeAssignRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    const template = await dataAccess.getTheme(storeId, themeId);
    if (!template) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    const summary = await applyTemplate(template, body.storeIds, body.mode, body.overridePolicy, admin.actorUserId, false);
    return rolloutSummaryResponseSchema.parse(summary);
  });

  // ── Versiyon güncelleme apply (yalnız update bekleyen mağazalar) ─────────────
  app.post("/admin/theme-library/:themeId/update/apply", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { themeId } = themeIdParam.parse(request.params);
    const body = themeAssignRequestSchema.parse(request.body);
    const storeId = await libStoreId();
    const template = await dataAccess.getTheme(storeId, themeId);
    if (!template) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Template not found."));
    const summary = await applyTemplate(template, body.storeIds, body.mode, body.overridePolicy, admin.actorUserId, true);
    return rolloutSummaryResponseSchema.parse(summary);
  });
}
