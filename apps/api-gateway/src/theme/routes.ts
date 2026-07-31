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
  themeBindingListResponseSchema,
  themeDuplicateRequestSchema,
  themePreviewTokenResponseSchema,
  platformThemeStatusResponseSchema,
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
  resolveThemeDocumentForKey,
  // TODO-164A — Custom Theme Builder: genişletilmiş config, contrast gate, başlangıç.
  validateThemeBuilderConfig,
  parseThemeBuilderConfig,
  checkContrast,
  contrastErrors,
  resolveStartingPoint,
  isThemeStartingPoint,
  type ThemeBuilderConfig,
  // TODO-164B — store override policy (server-side enforcement) + projeksiyon.
  parseOverridePolicy,
  enforceOverridePolicy,
  projectFieldPolicy,
  isPolicyExplicit,
  missingPolicyFields,
  computeUpdateAvailable,
  type PolicyConfigView,
  type PolicyThemeState,
} from "@commerce-os/theme";
import { ThemeMediaError, type ThemeDataAccess, type ThemeRecord, type ThemeVersionRecord } from "./data.js";

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
  /** TODO-164A — imzalı, kısa ömürlü builder preview token'ı üret (server.ts secret ile bağlar). */
  issuePreviewToken?: (storeId: string, themeId: string) => { token: string; expiresAt: Date };
}

const storeParam = z.object({ storeId: z.string().min(1) });
const themeParam = z.object({ storeId: z.string().min(1), themeId: z.string().min(1) });

export function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

/**
 * TODO-164B Dilim 2 (hardening) — ThemeMediaError'ı ürün-standardı HTTP koduna eşler:
 * NOT_FOUND → 404, NOT_OWNED → 409, INVALID → 400. Ham Prisma/FK mesajı SIZMAZ (yalnız
 * domain code + hangi alan). ThemeMediaError değilse null (çağıran yeniden fırlatır).
 */
export function themeMediaErrorResponse(
  error: unknown,
): { status: number; body: ReturnType<typeof errorBody> } | null {
  if (!(error instanceof ThemeMediaError)) return null;
  const status = error.code === "THEME_MEDIA_NOT_FOUND" ? 404 : error.code === "THEME_MEDIA_NOT_OWNED" ? 409 : 400;
  const message =
    error.code === "THEME_MEDIA_NOT_FOUND"
      ? "Staged media not found."
      : error.code === "THEME_MEDIA_NOT_OWNED"
        ? "Staged media belongs to another store."
        : "Staged media is not a valid image.";
  return { status, body: errorBody(error.code, message, { details: { field: error.field } }) };
}

// H-1 — Typed theme token savunması. En-şiddetli sorun sınıfı hata kodunu seçer.
const TOKEN_REASON_SEVERITY = ["UNSAFE_VALUE", "TYPE_MISMATCH", "INVALID_VALUE", "UNKNOWN"] as const;

/**
 * Token sorunlarından güvenli bir hata gövdesi kurar. GÜVENLİK: yanıt ham
 * (saldırgan) DEĞER veya validation regex'i TAŞIMAZ — yalnız path/layer/type/reason.
 */
export function tokenIssuesBody(issues: TokenIssue[], overrideCode?: string) {
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
export function asDocument(value: unknown): ThemeDocument | null {
  const result = validateThemeDocument(value);
  return result.ok ? result.document : null;
}

export function currentDraft(theme: ThemeRecord): ThemeVersionRecord | undefined {
  return theme.versions.find((v) => v.status === "DRAFT");
}
export function currentPublished(theme: ThemeRecord): ThemeVersionRecord | undefined {
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

export function serializeSummary(theme: ThemeRecord) {
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

export function serializeDetail(theme: ThemeRecord) {
  const draft = currentDraft(theme);
  const published = currentPublished(theme);
  const active = draft ?? published;
  // TODO-164B — rol ayrımı + override policy bağlamı. Store Admin UI locked/hidden
  // alanları gizler; server enforcement asıl otoritedir.
  const policy = parseOverridePolicy(theme.overridePolicy);
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
    duplicatedFrom: theme.duplicatedFrom,
    updatedAt: theme.updatedAt.toISOString(),
    ownerScope: theme.ownerScope,
    overridePolicy:
      theme.overridePolicy == null
        ? null
        : {
            fields: policy.fields,
            allowedFonts: policy.allowedFonts,
            allowedPalettes: policy.allowedPalettes,
            allowedLayoutPresets: policy.allowedLayoutPresets,
          },
    fieldPolicyProjection: projectFieldPolicy(policy),
    sourceThemeVersion: theme.sourceThemeVersion,
    // Dilim 1: platform template sürüm karşılaştırması yok → false. Dilim 2'de hesaplanır.
    updateAvailable: false,
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
export function withSanitizedCustomCss(document: ThemeDocument): ThemeDocument {
  if (!document.customCss) return document;
  const { css } = sanitizeCustomCss(document.customCss);
  return { ...document, customCss: css };
}

/** Bir preset id'sinden (veya varsayılandan) başlangıç belgesi kurar; adı uygular. */
export function initialDocument(presetId: string | undefined, name: string): ThemeDocument {
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
 * TODO-164/164A — Gönderilen config'i doğrular + compatibility denetler. GENİŞLETİLMİŞ
 * builder config (`themeBuilderConfigSchema`): yapısal + responsive + colorScheme grupları
 * strict/bounded; bilinmeyen key / izinsiz variant / güvensiz değer REDDEDİLİR. Geçerli,
 * NORMALIZE (slotVariants→slots merge) config döner. compatibility HAM themeKey/slots'a
 * bakar (bilinmeyen key reddi — sessiz downgrade YOK).
 */
export function validateConfig(
  raw: unknown,
): { ok: true; config: ThemeBuilderConfig } | { ok: false; code: string; issues: unknown[] } {
  const validated = validateThemeBuilderConfig(raw ?? {});
  if (!validated.ok) {
    return { ok: false, code: "INVALID_THEME_CONFIG", issues: validated.errors };
  }
  const normalized = parseThemeBuilderConfig(raw ?? {});
  const compat = checkThemeKeyCompatibility(validated.config.themeKey, {
    slotSelections: normalized.slots,
  });
  const errors = compatibilityErrors(compat);
  if (errors.length > 0) {
    return {
      ok: false,
      code: "THEME_INCOMPATIBLE",
      issues: errors.map((e) => ({ code: e.code, slot: e.slot, message: e.message })),
    };
  }
  return { ok: true, config: normalized };
}

/**
 * Depolanmış (ham) config'in yayınlanabilir olup olmadığı — publish gate için.
 * compatibility HAM themeKey/slots'a bakar (bilinmeyen key REDDEDİLİR; `parseThemeBuilderConfig`
 * fail-closed downgrade'i publish gate'te KULLANILMAZ, yoksa geçersiz tema sessizce yayınlanırdı).
 */
export function rawConfigCompatible(
  rawConfig: unknown,
): { ok: true } | { ok: false; issues: unknown[] } {
  const validated = validateThemeBuilderConfig(rawConfig ?? {});
  if (!validated.ok) {
    return { ok: false, issues: validated.errors.map((message) => ({ code: "INVALID_THEME_CONFIG", message })) };
  }
  const cfg = validated.config;
  // slotVariants → slots merge (RAW; downgrade YOK — allowlist zaten şemada denetlendi).
  const slots: Record<string, string> = { ...((cfg.slots ?? {}) as Record<string, string>) };
  for (const [slot, variant] of Object.entries((cfg.slotVariants ?? {}) as Record<string, string>)) {
    slots[slot] = variant;
  }
  const compat = checkThemeKeyCompatibility(cfg.themeKey, { slotSelections: slots });
  const errors = compatibilityErrors(compat);
  if (errors.length > 0) {
    return { ok: false, issues: errors.map((e) => ({ code: e.code, slot: e.slot, message: e.message })) };
  }
  return { ok: true };
}

/** Stored config JSON → policy karşılaştırması için config görünümü. */
export function policyConfigView(config: unknown): PolicyConfigView {
  const c = (config ?? {}) as Record<string, unknown>;
  return {
    layoutPreset: typeof c.layoutPreset === "string" ? c.layoutPreset : undefined,
    slots: (c.slots ?? {}) as Record<string, string | undefined>,
    slotVariants: (c.slotVariants ?? {}) as Record<string, string | undefined>,
  };
}

/**
 * TODO-164B (ADR-233) — Store Override Policy server-side enforcement. Store Admin'in
 * yaptığı değişiklikler mağaza temasının override policy'sine göre denetlenir; locked/
 * hidden/inherited alan veya izinsiz font/düzen değişimi → 409 (THEME_FIELD_LOCKED /
 * THEME_FONT_NOT_ALLOWED / THEME_LAYOUT_NOT_ALLOWED). Baseline = platform-onaylı state
 * (published, yoksa mevcut draft). Baseline yoksa gate uygulanmaz (default all-editable).
 * Ham değer yanıta SIZMAZ (yalnız path + code). Client gizlemesi yetki SAYILMAZ.
 */
function policyViolationBody(
  theme: ThemeRecord,
  baseline: ThemeVersionRecord | undefined,
  nextDoc: ThemeDocument,
  nextConfig: unknown,
  changedAssetFields?: Parameters<typeof enforceOverridePolicy>[0]["changedAssetFields"],
): { code: string; body: ReturnType<typeof errorBody> } | null {
  if (!baseline) return null;
  const prevDoc = asDocument(baseline.document);
  if (!prevDoc) return null;
  const policy = parseOverridePolicy(theme.overridePolicy);
  const prev: PolicyThemeState = { document: prevDoc, config: policyConfigView(baseline.config) };
  const next: PolicyThemeState = { document: nextDoc, config: policyConfigView(nextConfig) };
  const result = enforceOverridePolicy({ policy, prev, next, changedAssetFields });
  if (result.ok) return null;
  const code = result.violations[0].code;
  return {
    code,
    body: errorBody(code, "Field is locked by the store theme policy.", {
      details: { violations: result.violations.map((v) => ({ path: v.path, code: v.code })) },
    }),
  };
}

/** Kontrast (WCAG) publish gate gövdesi — ham değer taşımaz (yalnız çift/oran). */
export function contrastFailureBody(doc: ThemeDocument) {
  const result = checkContrast(doc);
  const errors = contrastErrors(result);
  if (errors.length === 0) return null;
  return errorBody("THEME_CONTRAST_FAILED", "Theme fails minimum contrast (WCAG AA).", {
    details: {
      contrast: errors.map((e) => ({ label: e.label, ratio: e.ratio, threshold: e.threshold })),
    },
  });
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
    if (body.startingPoint && !isThemeStartingPoint(body.startingPoint)) {
      return reply.code(400).send(errorBody("THEME_STARTING_POINT_NOT_FOUND", "Unknown starting point."));
    }
    // TODO-164A — Başlangıç noktası verildiyse preset'i KOPYALA (config+document
    // snapshot; registry MUTATE edilmez). Yoksa eski davranış (presetId/default).
    let document: ThemeDocument;
    let config: ThemeBuilderConfig | typeof INITIAL_THEME_CONFIG = INITIAL_THEME_CONFIG;
    let source = body.presetId ?? "default";
    if (body.startingPoint) {
      const snap = resolveStartingPoint(body.startingPoint);
      document = withSanitizedCustomCss({ ...snap.document, meta: { ...snap.document.meta, name: body.name } });
      config = snap.config;
      source = `start:${body.startingPoint}`;
    } else {
      document = withSanitizedCustomCss(initialDocument(body.presetId, body.name));
    }
    const created = await dataAccess.createTheme(storeId, {
      name: body.name,
      description: body.description ?? null,
      source,
      schemaVersion: document.schemaVersion,
      document: document as unknown as Record<string, unknown>,
      themeKey: config.themeKey,
      layoutPreset: config.layoutPreset,
      themeApiVersion: THEME_API_VERSION,
      config: config as unknown as Record<string, unknown>,
      createdBy: admin.actorUserId,
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
    let configPatch: { config: ThemeBuilderConfig; themeKey: string; layoutPreset: string } | undefined;
    if (body.config !== undefined) {
      const cfg = validateConfig(body.config);
      if (!cfg.ok) {
        return reply.code(400).send(errorBody(cfg.code, "Theme config is invalid.", { issues: cfg.issues }));
      }
      configPatch = { config: cfg.config, themeKey: cfg.config.themeKey, layoutPreset: cfg.config.layoutPreset };
    }
    const document = withSanitizedCustomCss(validation.document);
    // TODO-164B — override policy enforcement (server-side). Locked/izinsiz alan
    // değişimi baseline'a (published, yoksa mevcut draft) göre reddedilir.
    const themeForPolicy = await dataAccess.getTheme(storeId, themeId);
    if (!themeForPolicy) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    const draftBaseline = currentPublished(themeForPolicy) ?? currentDraft(themeForPolicy);
    const nextConfig = body.config ?? currentDraft(themeForPolicy)?.config ?? {};
    const draftViolation = policyViolationBody(themeForPolicy, draftBaseline, document, nextConfig);
    if (draftViolation) return reply.code(409).send(draftViolation.body);
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
    // TODO-164A (ADR-230) — Erişilebilirlik publish gate: KRİTİK kontrast (WCAG AA)
    // başarısızsa YAYINLANAMAZ (mevcut published korunur). Uyarı seviyesi engellemez
    // (store-admin gösterir). Ham renk değeri yanıta sızmaz.
    const contrastFail = contrastFailureBody(draftDoc);
    if (contrastFail) {
      return reply.code(409).send(contrastFail);
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
    // TODO-164B (ADR-233) — Platform template'i (ownerScope=PLATFORM) yayınlanmadan
    // önce override policy EXPLICIT olmak zorundadır; eksik → 409 THEME_POLICY_INCOMPLETE.
    if (theme.ownerScope === "PLATFORM") {
      const policy = parseOverridePolicy(theme.overridePolicy);
      if (!isPolicyExplicit(policy)) {
        return reply.code(409).send(
          errorBody("THEME_POLICY_INCOMPLETE", "Platform theme override policy is incomplete.", {
            details: { missingFields: missingPolicyFields(policy) },
          }),
        );
      }
    }
    // TODO-164B — Store Admin publish'i de policy'ye tabidir (baseline = platform-onaylı
    // published; draft'ın locked alanı published'dan farklıysa reddedilir — save-time
    // bypass'a / policy sonradan sıkılaştıysa ikinci kapı).
    const publishViolation = policyViolationBody(theme, currentPublished(theme), draftDoc, draft.config);
    if (publishViolation) return reply.code(409).send(publishViolation.body);
    let published;
    try {
      published = await dataAccess.publishTheme(storeId, themeId, {
        notes: body.notes ?? null,
        publishedBy: admin.actorUserId,
      });
    } catch (err) {
      // HARDENING — staged media geçersizse kontrollü domain hatası (ham FK 500 DEĞİL).
      const mapped = themeMediaErrorResponse(err);
      if (mapped) return reply.code(mapped.status).send(mapped.body);
      throw err;
    }
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

  // ── Kopyala (yeni kimlik; config+document snapshot; history KOPYALANMAZ) ────
  app.post("/stores/:storeId/themes/:themeId/duplicate", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const body = themeDuplicateRequestSchema.parse(request.body);
    const copy = await dataAccess.duplicateTheme(storeId, themeId, {
      name: body.name,
      createdBy: admin.actorUserId,
    });
    if (!copy) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    await recordAudit({
      action: "CREATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "Theme",
      entityId: copy.id,
      metadata: { op: "duplicate", duplicatedFrom: themeId },
    });
    return reply.code(201).send(themeDetailSchema.parse(serializeDetail(copy)));
  });

  // ── Arşivle (yayındaki tema arşivlenemez) ──────────────────────────────────
  app.post("/stores/:storeId/themes/:themeId/archive", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    if (theme.status === "PUBLISHED") {
      return reply
        .code(409)
        .send(errorBody("THEME_PUBLISHED_ARCHIVE", "Cannot archive the published theme."));
    }
    const archived = await dataAccess.archiveTheme(storeId, themeId, { updatedBy: admin.actorUserId });
    if (!archived) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: admin.actorUserId,
      storeId,
      entityType: "Theme",
      entityId: themeId,
      metadata: { op: "archive" },
    });
    return themeDetailSchema.parse(serializeDetail(archived));
  });

  // ── Preview token (kısa ömürlü, store+theme scoped, imzalı) ────────────────
  app.post("/stores/:storeId/themes/:themeId/preview-token", async (request, reply) => {
    const { storeId, themeId } = themeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const theme = await dataAccess.getTheme(storeId, themeId);
    if (!theme) return reply.code(404).send(errorBody("THEME_NOT_FOUND", "Theme not found."));
    if (!deps.issuePreviewToken) {
      return reply.code(503).send(errorBody("THEME_PREVIEW_UNAVAILABLE", "Preview is unavailable."));
    }
    const { token, expiresAt } = deps.issuePreviewToken(storeId, themeId);
    return themePreviewTokenResponseSchema.parse({ token, expiresAt: expiresAt.toISOString() });
  });

  // ── TODO-164B Dilim 2 — Store Admin: aktif platform teması durumu ──────────
  // Marka Customizer bannerı: bu mağazanın teması bir platform template'inden mi
  // türedi (managedByPlatform), yeni sürüm var mı (updateAvailable), editable/locked
  // alanlar neler. Salt-okuma; Store Admin Platform Designer yetkilerine ERİŞMEZ.
  app.get("/stores/:storeId/theme/platform-status", async (request, reply) => {
    const { storeId } = storeParam.parse(request.params);
    const admin = await requireStoreAdmin(request, reply, storeId);
    if (!admin) return;
    const themes = await dataAccess.listThemes(storeId);
    const published = themes.find((t) => t.status === "PUBLISHED") ?? null;
    const policy = parseOverridePolicy(published?.overridePolicy ?? null);
    const projection = projectFieldPolicy(policy);
    let templateName: string | null = null;
    let templatePublishedVersion: number | null = null;
    if (published?.sourceThemeId) {
      const libStore = await dataAccess.ensureThemeLibraryStore();
      const template = await dataAccess.getTheme(libStore.id, published.sourceThemeId);
      if (template) {
        templateName = template.name;
        templatePublishedVersion =
          template.versions.find((v) => v.status === "PUBLISHED")?.version ?? null;
      }
    }
    return platformThemeStatusResponseSchema.parse({
      managedByPlatform: published?.sourceThemeId != null,
      templateName,
      currentVersion: published?.sourceThemeVersion ?? null,
      templatePublishedVersion,
      updateAvailable: computeUpdateAvailable(published?.sourceThemeVersion ?? null, templatePublishedVersion),
      editableFields: projection.editable,
      lockedFields: projection.locked,
    });
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
  /** Fleet "Tema Yönetimi" listesi için store-scope'suz platform admin auth. */
  requirePlatformAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
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
  const { dataAccess, requirePlatformStoreAdmin, requirePlatformAdmin, isThemeStudioEnabled, recordAudit } =
    deps;

  // ── Fleet "Tema Yönetimi" — tüm mağazalar + yayınlı tema özeti ─────────────
  app.get("/admin/theme-bindings", async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const rows = await dataAccess.listThemeBindingSummaries();
    const bindings = await Promise.all(
      rows.map(async (r) => {
        const rawConfig = themeConfigSchema.safeParse(r.publishedConfig ?? {});
        const configThemeKey = rawConfig.success ? rawConfig.data.themeKey : "";
        const configSlots = rawConfig.success ? rawConfig.data.slots : {};
        const activeThemeKey = configThemeKey || r.themeKey || BASE_THEME_KEY;
        const entry = getThemeEntry(activeThemeKey);
        const compat = checkThemeKeyCompatibility(activeThemeKey, { slotSelections: configSlots });
        const capabilityEnabled = await isThemeStudioEnabled(r.storeId);
        return {
          storeId: r.storeId,
          storeName: r.storeName,
          storeSlug: r.storeSlug,
          storeStatus: r.storeStatus,
          activeThemeKey,
          activeThemeName: entry?.nameTr ?? activeThemeKey,
          kind: entry?.kind ?? "BASE",
          layoutPreset: r.layoutPreset ?? BASE_LAYOUT_PRESET_KEY,
          publishedVersion: r.publishedVersion,
          compatible: compat.compatible,
          capabilityEnabled,
        };
      }),
    );
    return themeBindingListResponseSchema.parse({ bindings });
  });

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
    // TODO-164A — builder görünürlüğü: taslak tema sayısı + kaynak preset + son güncelleme.
    const draftThemeCount = themes.filter((t) => t.status === "DRAFT").length;
    const sourcePreset = publishedTheme?.source ?? null;
    const lastUpdatedAt =
      themes.length > 0
        ? new Date(Math.max(...themes.map((t) => t.updatedAt.getTime()))).toISOString()
        : null;

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
      draftThemeCount,
      sourcePreset,
      lastUpdatedAt,
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
    // TODO-164 fix — atama TAM temayı uygular: layout + TOKEN paleti (renk). Temanın
    // token belgesini registry'den çöz + customCss sanitize (H-1) et. Böylece atama
    // yalnız düzeni değil GÖRÜNÜR paleti de değiştirir.
    const assignedDoc = withSanitizedCustomCss(resolveThemeDocumentForKey(entry.key));
    const assigned = await dataAccess.assignThemeBinding(storeId, {
      themeKey: entry.key,
      layoutPreset: entry.layoutPreset,
      themeApiVersion: entry.themeApiVersion,
      publishedBy: admin.actorUserId,
      document: assignedDoc as unknown as Record<string, unknown>,
      schemaVersion: assignedDoc.schemaVersion,
      // TODO-164B — atama sırasında verilen override policy'yi mağaza temasına yaz
      // (verilmezse Theme.overridePolicy dokunulmaz → default = hepsi editable).
      ...(body.overridePolicy !== undefined ? { overridePolicy: body.overridePolicy } : {}),
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
