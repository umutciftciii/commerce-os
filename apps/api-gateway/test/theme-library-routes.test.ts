import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_THEME_DOCUMENT, defaultOverridePolicy } from "@commerce-os/theme";
import { vi } from "vitest";

// data.js -> @commerce-os/db (prisma) import eder; gerçek prisma init'ini engelle.
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { registerThemeLibraryRoutes } = await import("../src/theme/library-routes.js");
const { ThemeMediaError } = await import("../src/theme/data.js");
type Deps = Parameters<typeof registerThemeLibraryRoutes>[1];
type DataAccess = Deps["dataAccess"];

interface Ver {
  id: string;
  version: number;
  status: string;
  schemaVersion: number;
  label: string | null;
  notes: string | null;
  document: unknown;
  config: unknown;
  themeKey: string | null;
  layoutPreset: string | null;
  stagedLogoMediaId: string | null;
  stagedFaviconMediaId: string | null;
  assetSnapshot: unknown;
  publishedBy: string | null;
  createdAt: Date;
  publishedAt: Date | null;
}
interface Theme {
  id: string;
  storeId: string;
  name: string;
  description: string | null;
  status: string;
  source: string | null;
  themeKey: string;
  layoutPreset: string;
  themeApiVersion: number;
  duplicatedFrom: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  ownerScope: string;
  overridePolicy: unknown;
  sourceThemeId: string | null;
  sourceThemeVersion: number | null;
  policyRevision: number;
  createdAt: Date;
  updatedAt: Date;
  versions: Ver[];
}

function makeFake() {
  const themes: Theme[] = [];
  const stores: { id: string; name: string; slug: string; status: string; systemPurpose: string | null }[] = [];
  const settings = new Map<string, { logoMediaId: string | null; faviconMediaId: string | null }>();
  // Prisma MediaAsset tablosunu taklit eder (ownership + mimeType doğrulaması için).
  const media = new Map<string, { storeId: string; mimeType: string }>();
  // prisma/tx.assertAssetOwnership semantiğini yansıtır (route domain-error mapping'i test edilir).
  function checkMedia(themeStoreId: string, mediaId: string | null | undefined, field: "logo" | "favicon") {
    if (mediaId == null) return;
    const m = media.get(mediaId);
    if (!m) throw new ThemeMediaError("THEME_MEDIA_NOT_FOUND", field);
    if (m.storeId !== themeStoreId) throw new ThemeMediaError("THEME_MEDIA_NOT_OWNED", field);
    if (!m.mimeType.startsWith("image/")) throw new ThemeMediaError("THEME_MEDIA_INVALID", field);
  }
  let seq = 0;
  const id = (p: string) => `${p}_${++seq}`;
  const now = () => new Date("2026-07-31T12:00:00.000Z");
  const find = (storeId: string, themeId: string) => themes.find((t) => t.id === themeId && t.storeId === storeId) ?? null;
  const draft = (t: Theme) => t.versions.find((v) => v.status === "DRAFT");
  const published = (t: Theme) => t.versions.find((v) => v.status === "PUBLISHED");
  const mkVer = (over: Partial<Ver>): Ver => ({
    id: id("ver"),
    version: 1,
    status: "DRAFT",
    schemaVersion: 1,
    label: null,
    notes: null,
    document: DEFAULT_THEME_DOCUMENT,
    config: {},
    themeKey: "BASE_COMMERCE",
    layoutPreset: "BASE_COMMERCE",
    stagedLogoMediaId: null,
    stagedFaviconMediaId: null,
    assetSnapshot: null,
    publishedBy: null,
    createdAt: now(),
    publishedAt: null,
    ...over,
  });
  const mkTheme = (storeId: string, over: Partial<Theme>): Theme => ({
    id: id("theme"),
    storeId,
    name: "Tema",
    description: null,
    status: "DRAFT",
    source: null,
    themeKey: "BASE_COMMERCE",
    layoutPreset: "BASE_COMMERCE",
    themeApiVersion: 1,
    duplicatedFrom: null,
    createdBy: null,
    updatedBy: null,
    ownerScope: "STORE",
    overridePolicy: null,
    sourceThemeId: null,
    sourceThemeVersion: null,
    policyRevision: 0,
    createdAt: now(),
    updatedAt: now(),
    versions: [mkVer({})],
    ...over,
  });

  const api: DataAccess = {
    async ensureThemeLibraryStore() {
      let s = stores.find((x) => x.systemPurpose === "THEME_LIBRARY");
      if (!s) {
        s = { id: "lib_store", name: "Kütüphane", slug: "__theme-library__", status: "ACTIVE", systemPurpose: "THEME_LIBRARY" };
        stores.push(s);
      }
      return { id: s.id };
    },
    async listThemes(storeId) {
      return themes.filter((t) => t.storeId === storeId) as never;
    },
    async getTheme(storeId, themeId) {
      return find(storeId, themeId) as never;
    },
    async createTheme(storeId, input) {
      const t = mkTheme(storeId, {
        name: input.name,
        description: input.description ?? null,
        source: input.source,
        themeKey: input.themeKey,
        layoutPreset: input.layoutPreset,
        themeApiVersion: input.themeApiVersion,
        ownerScope: input.ownerScope ?? "STORE",
        createdBy: input.createdBy ?? null,
        versions: [mkVer({ schemaVersion: input.schemaVersion, document: input.document, config: input.config, themeKey: input.themeKey, layoutPreset: input.layoutPreset })],
      });
      themes.push(t);
      return t as never;
    },
    async updateThemeMeta(storeId, themeId, patch) {
      const t = find(storeId, themeId);
      if (!t) return null;
      if (patch.name !== undefined) t.name = patch.name;
      if (patch.description !== undefined) t.description = patch.description;
      return t as never;
    },
    async deleteTheme() {
      return true;
    },
    async duplicateTheme(storeId, themeId, input) {
      const t = find(storeId, themeId);
      if (!t) return null;
      const src = draft(t) ?? published(t) ?? t.versions[0];
      const copy = mkTheme(storeId, {
        name: input.name,
        duplicatedFrom: t.id,
        source: `duplicate:${t.id}`,
        themeKey: t.themeKey,
        versions: [mkVer({ document: src.document, config: src.config, themeKey: src.themeKey, label: "duplicate" })],
      });
      themes.push(copy);
      return copy as never;
    },
    async archiveTheme(storeId, themeId) {
      const t = find(storeId, themeId);
      if (!t || t.status === "PUBLISHED") return null;
      t.status = "ARCHIVED";
      return t as never;
    },
    async saveDraft(storeId, themeId, input) {
      const t = find(storeId, themeId);
      if (!t) return null;
      const d = draft(t);
      if (d) {
        d.document = input.document;
        d.schemaVersion = input.schemaVersion;
        if (input.config !== undefined) d.config = input.config;
        if (input.themeKey !== undefined) d.themeKey = input.themeKey;
        if (input.layoutPreset !== undefined) d.layoutPreset = input.layoutPreset;
        if (input.label !== undefined) d.label = input.label;
      }
      return t as never;
    },
    async publishTheme(storeId, themeId, input) {
      const t = find(storeId, themeId);
      if (!t) return null;
      const d = draft(t);
      if (!d) return null;
      // Txn-içi doğrulama önce (herhangi bir mutasyondan ÖNCE → atomiklik: geçersizse
      // ThemeVersion/StoreSettings DEĞİŞMEZ, kısmi update YOK).
      const hasLogo = d.stagedLogoMediaId != null;
      const hasFav = d.stagedFaviconMediaId != null;
      if (hasLogo) checkMedia(storeId, d.stagedLogoMediaId, "logo");
      if (hasFav) checkMedia(storeId, d.stagedFaviconMediaId, "favicon");
      const prev = published(t);
      if (prev) prev.status = "ARCHIVED";
      const s = settings.get(storeId) ?? { logoMediaId: null, faviconMediaId: null };
      const finalLogo = hasLogo ? d.stagedLogoMediaId : s.logoMediaId;
      const finalFav = hasFav ? d.stagedFaviconMediaId : s.faviconMediaId;
      if (hasLogo || hasFav) settings.set(storeId, { logoMediaId: finalLogo, faviconMediaId: finalFav });
      d.assetSnapshot = { logoMediaId: finalLogo, faviconMediaId: finalFav };
      d.stagedLogoMediaId = null;
      d.stagedFaviconMediaId = null;
      d.status = "PUBLISHED";
      d.publishedAt = now();
      d.publishedBy = input.publishedBy ?? null;
      t.status = "PUBLISHED";
      const next = Math.max(...t.versions.map((v) => v.version)) + 1;
      t.versions.unshift(mkVer({ version: next, document: d.document, config: d.config, themeKey: d.themeKey, layoutPreset: d.layoutPreset }));
      return t as never;
    },
    async rollbackToVersion(storeId, themeId, version) {
      const t = find(storeId, themeId);
      if (!t) return null;
      const target = t.versions.find((v) => v.version === version);
      if (!target) return null;
      const d = draft(t);
      if (d) {
        d.document = target.document;
        d.config = target.config;
        d.label = `rollback:v${version}`;
      }
      const snap = target.assetSnapshot as { logoMediaId: string | null; faviconMediaId: string | null } | null;
      if (snap) settings.set(storeId, { logoMediaId: snap.logoMediaId, faviconMediaId: snap.faviconMediaId });
      return t as never;
    },
    async getPublishedState() {
      return null;
    },
    async assignThemeBinding() {
      return null;
    },
    async listThemeBindingSummaries() {
      return [];
    },
    async setOverridePolicy(storeId, themeId, policy) {
      const t = find(storeId, themeId);
      if (!t) return null;
      t.overridePolicy = policy;
      t.policyRevision += 1;
      return t as never;
    },
    async stageThemeAssets(storeId, themeId, input) {
      const t = find(storeId, themeId);
      if (!t) return null;
      const d = draft(t);
      if (!d) return null;
      // Erken doğrulama (prisma davranışını yansıtır).
      if (input.logoMediaId != null) checkMedia(storeId, input.logoMediaId, "logo");
      if (input.faviconMediaId != null) checkMedia(storeId, input.faviconMediaId, "favicon");
      if (input.logoMediaId !== undefined) d.stagedLogoMediaId = input.logoMediaId;
      if (input.faviconMediaId !== undefined) d.stagedFaviconMediaId = input.faviconMediaId;
      return t as never;
    },
    async assignTemplateToStore(targetStoreId, input) {
      const t = themes.find((x) => x.storeId === targetStoreId && x.status === "PUBLISHED") ?? themes.find((x) => x.storeId === targetStoreId);
      if (!t) return null;
      const prev = published(t);
      if (prev) prev.status = "ARCHIVED";
      const next = Math.max(...t.versions.map((v) => v.version)) + 1;
      t.versions.unshift(mkVer({ version: next, status: "PUBLISHED", document: input.document, config: input.config, themeKey: input.themeKey, publishedAt: now() }));
      t.status = "PUBLISHED";
      t.sourceThemeId = input.sourceThemeId;
      t.sourceThemeVersion = input.sourceThemeVersion;
      if (input.overridePolicy !== undefined) {
        t.overridePolicy = input.overridePolicy;
        t.policyRevision += 1;
      }
      t.versions.unshift(mkVer({ version: next + 1, status: "DRAFT", document: input.document, config: input.config, themeKey: input.themeKey }));
      return t as never;
    },
    async listTemplateUsage(templateThemeId) {
      return themes
        .filter((t) => t.sourceThemeId === templateThemeId && t.status === "PUBLISHED")
        .map((t) => {
          const st = stores.find((s) => s.id === t.storeId);
          return { storeId: t.storeId, storeName: st?.name ?? t.storeId, storeSlug: st?.slug ?? "", storeStatus: st?.status ?? "ACTIVE", sourceThemeVersion: t.sourceThemeVersion };
        });
    },
    async listAssignableStores() {
      return stores
        .filter((s) => s.systemPurpose == null)
        .map((s) => {
          const pub = themes.find((t) => t.storeId === s.id && t.status === "PUBLISHED");
          return { id: s.id, name: s.name, slug: s.slug, status: s.status, sourceThemeId: pub?.sourceThemeId ?? null, sourceThemeVersion: pub?.sourceThemeVersion ?? null };
        });
    },
  };
  return { api, themes, stores, settings, media, mkTheme };
}

function buildApp(fake: ReturnType<typeof makeFake>, authed = true) {
  const app = Fastify();
  registerThemeLibraryRoutes(app, {
    dataAccess: fake.api,
    requirePlatformAdmin: async (_req, reply) => {
      if (!authed) {
        reply.code(403).send({ error: { code: "FORBIDDEN", message: "no" } });
        return null;
      }
      return { actorUserId: "admin_1" };
    },
    recordAudit: async () => {},
    invalidateResolvedTheme: () => {},
    issuePreviewToken: (storeId, themeId, version) => ({
      token: `${storeId}:${themeId}:${version ?? "draft"}`,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    }),
  });
  return app;
}

let fake: ReturnType<typeof makeFake>;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  fake = makeFake();
  app = buildApp(fake);
});
afterEach(async () => {
  await app.close();
});

async function createTemplate(name = "Şablon") {
  const res = await app.inject({ method: "POST", url: "/admin/theme-library", payload: { name } });
  expect(res.statusCode).toBe(201);
  return res.json();
}
async function makeExplicitPolicy(themeId: string) {
  const res = await app.inject({
    method: "PUT",
    url: `/admin/theme-library/${themeId}/policy`,
    payload: { overridePolicy: defaultOverridePolicy() },
  });
  expect(res.statusCode).toBe(200);
}

describe("theme-library — CRUD + list", () => {
  it("create → ownerScope PLATFORM ve listede görünür", async () => {
    const t = await createTemplate("Modern");
    expect(t.ownerScope).toBe("PLATFORM");
    const list = await app.inject({ method: "GET", url: "/admin/theme-library" });
    expect(list.statusCode).toBe(200);
    expect(list.json().templates).toHaveLength(1);
    expect(list.json().templates[0].name).toBe("Modern");
    expect(list.json().templates[0].policyComplete).toBe(false); // policy henüz tanımlanmadı (null)
  });
});

describe("theme-library — publish policy gate", () => {
  it("policy null iken publish → 409 THEME_POLICY_INCOMPLETE", async () => {
    const t = await createTemplate();
    const res = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("THEME_POLICY_INCOMPLETE");
  });
  it("explicit policy sonrası publish → 200 PUBLISHED", async () => {
    const t = await createTemplate();
    await makeExplicitPolicy(t.id);
    const res = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("PUBLISHED");
  });
});

describe("theme-library — policy validation", () => {
  it("geçersiz policy → 400 THEME_POLICY_INVALID", async () => {
    const t = await createTemplate();
    const res = await app.inject({
      method: "PUT",
      url: `/admin/theme-library/${t.id}/policy`,
      payload: { overridePolicy: { fields: { "color.unknown": "locked" }, allowedFonts: [], allowedPalettes: [], allowedLayoutPresets: [] } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("THEME_POLICY_INVALID");
  });
});

describe("theme-library — assignment + usage + tenant isolation", () => {
  it("published template hedef mağazaya atanır; usage + update hesabı", async () => {
    // Hedef mağaza + mevcut teması.
    fake.stores.push({ id: "store_a", name: "Mağaza A", slug: "a", status: "ACTIVE", systemPurpose: null });
    fake.themes.push(fake.mkTheme("store_a", { status: "PUBLISHED", versions: [] as never }));
    const storeTheme = fake.themes.find((t) => t.storeId === "store_a")!;
    storeTheme.versions = [
      { id: "v", version: 1, status: "PUBLISHED", schemaVersion: 1, label: null, notes: null, document: DEFAULT_THEME_DOCUMENT, config: {}, themeKey: "BASE_COMMERCE", layoutPreset: "BASE_COMMERCE", stagedLogoMediaId: null, stagedFaviconMediaId: null, assetSnapshot: null, publishedBy: null, createdAt: new Date(), publishedAt: new Date() },
    ];

    const t = await createTemplate();
    await makeExplicitPolicy(t.id);
    await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} });

    const assign = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/assign`, payload: { storeIds: ["store_a"], mode: "selected" } });
    expect(assign.statusCode).toBe(200);
    expect(assign.json().succeeded).toBe(1);
    expect(assign.json().failed).toBe(0);

    const usage = await app.inject({ method: "GET", url: `/admin/theme-library/${t.id}/usage` });
    expect(usage.json().usingCount).toBe(1);
    expect(usage.json().updatePendingCount).toBe(0);
    // Sistem mağazası atanabilir listesine SIZMAZ.
    const stores = await app.inject({ method: "GET", url: "/admin/theme-library/assignable-stores" });
    expect(stores.json().stores.map((s: { id: string }) => s.id)).toEqual(["store_a"]);
  });

  it("yeni template sürümü → updatePendingCount artar; update/apply sürümü yükseltir", async () => {
    fake.stores.push({ id: "store_a", name: "Mağaza A", slug: "a", status: "ACTIVE", systemPurpose: null });
    const st = fake.mkTheme("store_a", { status: "PUBLISHED" });
    st.versions = [{ id: "v", version: 1, status: "PUBLISHED", schemaVersion: 1, label: null, notes: null, document: DEFAULT_THEME_DOCUMENT, config: {}, themeKey: "BASE_COMMERCE", layoutPreset: "BASE_COMMERCE", stagedLogoMediaId: null, stagedFaviconMediaId: null, assetSnapshot: null, publishedBy: null, createdAt: new Date(), publishedAt: new Date() }];
    fake.themes.push(st);

    const t = await createTemplate();
    await makeExplicitPolicy(t.id);
    await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} }); // v published
    await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/assign`, payload: { storeIds: ["store_a"], mode: "selected" } });
    // Template'i yeniden publish → yeni yayın sürümü.
    await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} });

    const usage = await app.inject({ method: "GET", url: `/admin/theme-library/${t.id}/usage` });
    expect(usage.json().updatePendingCount).toBe(1);

    const upd = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/update/apply`, payload: { storeIds: ["store_a"], mode: "selected" } });
    expect(upd.json().succeeded).toBe(1);
    const usage2 = await app.inject({ method: "GET", url: `/admin/theme-library/${t.id}/usage` });
    expect(usage2.json().updatePendingCount).toBe(0);
  });
});

describe("theme-library — logo draft staging (TD-162)", () => {
  it("stage-assets → publish StoreSettings'e atomik yazar; rollback snapshot'a döner", async () => {
    const t = await createTemplate();
    await makeExplicitPolicy(t.id);
    // İlk publish (logosuz) → v1 snapshot (logo null).
    await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} });
    // Geçerli kütüphane-mağazası media (image) — ownership/mimeType doğrulaması geçer.
    fake.media.set("med_logo_1", { storeId: "lib_store", mimeType: "image/png" });
    // stage-assets ucuyla draft'a logo sahnele (production DEĞİŞMEZ).
    const stage = await app.inject({
      method: "POST",
      url: `/admin/theme-library/${t.id}/stage-assets`,
      payload: { logoMediaId: "med_logo_1" },
    });
    expect(stage.statusCode).toBe(200);
    expect(fake.settings.get("lib_store")?.logoMediaId ?? null).toBe(null); // henüz uygulanmadı
    // Publish → StoreSettings atomik güncellenir.
    await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} });
    expect(fake.settings.get("lib_store")?.logoMediaId).toBe("med_logo_1");
    // Rollback → logosuz sürüme dön → StoreSettings snapshot'a döner (null).
    const detail = await (await app.inject({ method: "GET", url: `/admin/theme-library/${t.id}` })).json();
    const v1 = Math.min(...detail.versions.filter((v: { status: string }) => v.status === "ARCHIVED").map((v: { version: number }) => v.version));
    await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/rollback`, payload: { version: v1 } });
    expect(fake.settings.get("lib_store")?.logoMediaId ?? null).toBe(null);
  });

  it("geçersiz stage-assets isteği (boş) reddedilir", async () => {
    const t = await createTemplate();
    await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} });
    // Boş gövde: contract .refine reddeder (bare test harness'ta 500 ZodError; canlı
    // gateway global error handler ile 400). Her iki durumda da istek BAŞARISIZ olmalı.
    const res = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/stage-assets`, payload: {} });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe("theme-library — invalid media hardening (500 DEĞİL domain error)", () => {
  async function publishedTemplate() {
    const t = await createTemplate();
    await makeExplicitPolicy(t.id);
    await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} });
    return t;
  }

  it("stage: media YOK → 404 THEME_MEDIA_NOT_FOUND (500 değil)", async () => {
    const t = await publishedTemplate();
    const res = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/stage-assets`, payload: { logoMediaId: "med_missing" } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("THEME_MEDIA_NOT_FOUND");
    // Ham Prisma/constraint mesajı SIZMAZ.
    expect(JSON.stringify(res.json())).not.toMatch(/Prisma|constraint|foreign key/i);
  });

  it("stage: başka mağaza media → 409 THEME_MEDIA_NOT_OWNED", async () => {
    const t = await publishedTemplate();
    fake.media.set("med_other", { storeId: "store_a", mimeType: "image/png" });
    const res = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/stage-assets`, payload: { logoMediaId: "med_other" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("THEME_MEDIA_NOT_OWNED");
  });

  it("stage: görsel-olmayan media → 400 THEME_MEDIA_INVALID", async () => {
    const t = await publishedTemplate();
    fake.media.set("med_pdf", { storeId: "lib_store", mimeType: "application/pdf" });
    const res = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/stage-assets`, payload: { faviconMediaId: "med_pdf" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("THEME_MEDIA_INVALID");
  });

  it("kütüphane-mağazası media → geçerli akış: stage + publish atomik", async () => {
    const t = await publishedTemplate();
    fake.media.set("med_valid", { storeId: "lib_store", mimeType: "image/svg+xml" });
    const stage = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/stage-assets`, payload: { logoMediaId: "med_valid" } });
    expect(stage.statusCode).toBe(200);
    const pub = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} });
    expect(pub.statusCode).toBe(200);
    expect(fake.settings.get("lib_store")?.logoMediaId).toBe("med_valid");
  });

  it("media stage sonrası SİLİNİRSE → publish 404 + StoreSettings/ThemeVersion DEĞİŞMEZ (atomik)", async () => {
    const t = await publishedTemplate();
    // Geçerli media ile sahnele, sonra sil (stage↔publish arası silme yarışı).
    fake.media.set("med_gone", { storeId: "lib_store", mimeType: "image/png" });
    await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/stage-assets`, payload: { logoMediaId: "med_gone" } });
    fake.media.delete("med_gone");
    const before = fake.themes.find((x) => x.id === t.id)!;
    const draftBefore = before.versions.find((v) => v.status === "DRAFT")!;
    const publishedVerBefore = before.versions.find((v) => v.status === "PUBLISHED")!.version;
    const res = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/publish`, payload: {} });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("THEME_MEDIA_NOT_FOUND");
    // StoreSettings değişmedi (staged uygulanmadı).
    expect(fake.settings.get("lib_store")?.logoMediaId ?? null).toBe(null);
    // ThemeVersion değişmedi: draft hâlâ DRAFT (PUBLISHED'a geçmedi), published sürüm aynı.
    expect(draftBefore.status).toBe("DRAFT");
    expect(before.versions.find((v) => v.status === "PUBLISHED")!.version).toBe(publishedVerBefore);
  });

  it("staging temizleme (null) media doğrulaması gerektirmez", async () => {
    const t = await publishedTemplate();
    const res = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/stage-assets`, payload: { logoMediaId: null } });
    expect(res.statusCode).toBe(200);
  });
});

describe("theme-library — preview token version scoped", () => {
  it("preview token version taşır", async () => {
    const t = await createTemplate();
    const res = await app.inject({ method: "POST", url: `/admin/theme-library/${t.id}/preview-token`, payload: { version: 3 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toContain(":3");
  });
});

describe("theme-library — güvenlik", () => {
  it("yetkisiz istek → 403", async () => {
    const un = buildApp(fake, false);
    const res = await un.inject({ method: "GET", url: "/admin/theme-library" });
    expect(res.statusCode).toBe(403);
    await un.close();
  });
});
