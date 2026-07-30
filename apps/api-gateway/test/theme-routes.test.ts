import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME_DOCUMENT, getPreset } from "@commerce-os/theme";

// theme/data.js -> @commerce-os/db (prisma) import eder; testte gerçek prisma init'ini
// engellemek için boş stub yeter (in-memory fake dataAccess geçirilir; prisma çağrılmaz).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { registerThemeAdminRoutes, registerThemeBindingRoutes } = await import(
  "../src/theme/routes.js"
);
type ThemeAdminRoutesDeps = Parameters<typeof registerThemeAdminRoutes>[1];
type DataAccess = ThemeAdminRoutesDeps["dataAccess"];

interface VersionLike {
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
  publishedBy: string | null;
  createdAt: Date;
  publishedAt: Date | null;
}
interface ThemeLike {
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
  // TODO-164B — rol ayrımı + override policy alanları.
  ownerScope: string;
  overridePolicy: unknown;
  sourceThemeId: string | null;
  sourceThemeVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
  versions: VersionLike[];
}

/** Prisma impl semantiğini birebir yansıtan in-memory ThemeDataAccess. */
function makeFakeDataAccess() {
  const themes: ThemeLike[] = [];
  let seq = 0;
  const id = (p: string) => `${p}_${++seq}`;
  const now = () => new Date("2026-07-20T12:00:00.000Z");
  const find = (storeId: string, themeId: string) =>
    themes.find((t) => t.id === themeId && t.storeId === storeId) ?? null;
  const draft = (t: ThemeLike) => t.versions.find((v) => v.status === "DRAFT");
  const published = (t: ThemeLike) => t.versions.find((v) => v.status === "PUBLISHED");

  const api: DataAccess = {
    async listThemes(storeId) {
      return themes.filter((t) => t.storeId === storeId) as never;
    },
    async getTheme(storeId, themeId) {
      return find(storeId, themeId) as never;
    },
    async createTheme(storeId, input) {
      const theme: ThemeLike = {
        id: id("theme"),
        storeId,
        name: input.name,
        description: input.description ?? null,
        status: "DRAFT",
        source: input.source,
        themeKey: input.themeKey,
        layoutPreset: input.layoutPreset,
        themeApiVersion: input.themeApiVersion,
        duplicatedFrom: input.duplicatedFrom ?? null,
        createdBy: input.createdBy ?? null,
        updatedBy: input.createdBy ?? null,
        ownerScope: "STORE",
        overridePolicy: null,
        sourceThemeId: null,
        sourceThemeVersion: null,
        createdAt: now(),
        updatedAt: now(),
        versions: [
          {
            id: id("ver"),
            version: 1,
            status: "DRAFT",
            schemaVersion: input.schemaVersion,
            label: null,
            notes: null,
            document: input.document,
            config: input.config ?? {},
            themeKey: input.themeKey,
            layoutPreset: input.layoutPreset,
            publishedBy: null,
            createdAt: now(),
            publishedAt: null,
          },
        ],
      };
      themes.push(theme);
      return theme as never;
    },
    async updateThemeMeta(storeId, themeId, patch) {
      const t = find(storeId, themeId);
      if (!t) return null;
      if (patch.name !== undefined) t.name = patch.name;
      if (patch.description !== undefined) t.description = patch.description;
      return t as never;
    },
    async deleteTheme(storeId, themeId) {
      const i = themes.findIndex((t) => t.id === themeId && t.storeId === storeId);
      if (i < 0) return false;
      themes.splice(i, 1);
      return true;
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
      } else {
        const next = (t.versions[0]?.version ?? 0) + 1;
        t.versions.unshift({
          id: id("ver"),
          version: next,
          status: "DRAFT",
          schemaVersion: input.schemaVersion,
          label: input.label ?? null,
          notes: null,
          document: input.document,
          config: input.config ?? {},
          themeKey: input.themeKey ?? null,
          layoutPreset: input.layoutPreset ?? null,
          publishedBy: null,
          createdAt: now(),
          publishedAt: null,
        });
      }
      if (input.themeKey !== undefined) t.themeKey = input.themeKey;
      if (input.layoutPreset !== undefined) t.layoutPreset = input.layoutPreset;
      return t as never;
    },
    async publishTheme(storeId, themeId, input) {
      const t = find(storeId, themeId);
      if (!t) return null;
      const d = draft(t);
      if (!d) return null;
      const prev = published(t);
      if (prev) prev.status = "ARCHIVED";
      d.status = "PUBLISHED";
      d.publishedAt = now();
      d.publishedBy = input.publishedBy ?? null;
      for (const other of themes) {
        if (other.storeId === storeId && other.id !== themeId && other.status === "PUBLISHED") {
          other.status = "ARCHIVED";
        }
      }
      t.status = "PUBLISHED";
      if (d.themeKey) t.themeKey = d.themeKey;
      if (d.layoutPreset) t.layoutPreset = d.layoutPreset;
      const next = Math.max(...t.versions.map((v) => v.version)) + 1;
      t.versions.unshift({
        id: id("ver"),
        version: next,
        status: "DRAFT",
        schemaVersion: d.schemaVersion,
        label: null,
        notes: null,
        document: d.document,
        config: d.config,
        themeKey: d.themeKey,
        layoutPreset: d.layoutPreset,
        publishedBy: null,
        createdAt: now(),
        publishedAt: null,
      });
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
        d.schemaVersion = target.schemaVersion;
        d.config = target.config;
        d.themeKey = target.themeKey;
        d.layoutPreset = target.layoutPreset;
        d.label = `rollback:v${version}`;
      }
      return t as never;
    },
    // TODO-164A — kopyala/arşivle in-memory fake (prisma semantiğini yansıtır).
    async duplicateTheme(storeId, themeId, input) {
      const t = find(storeId, themeId);
      if (!t) return null;
      const source = draft(t) ?? published(t) ?? t.versions[0];
      if (!source) return null;
      const copy: ThemeLike = {
        id: id("theme"),
        storeId,
        name: input.name,
        description: t.description,
        status: "DRAFT",
        source: `duplicate:${t.id}`,
        themeKey: t.themeKey,
        layoutPreset: t.layoutPreset,
        themeApiVersion: t.themeApiVersion,
        duplicatedFrom: t.id,
        createdBy: input.createdBy ?? null,
        updatedBy: input.createdBy ?? null,
        ownerScope: "STORE",
        overridePolicy: null,
        sourceThemeId: null,
        sourceThemeVersion: null,
        createdAt: now(),
        updatedAt: now(),
        versions: [
          {
            id: id("ver"),
            version: 1,
            status: "DRAFT",
            schemaVersion: source.schemaVersion,
            label: "duplicate",
            notes: null,
            document: source.document,
            config: source.config,
            themeKey: source.themeKey,
            layoutPreset: source.layoutPreset,
            publishedBy: null,
            createdAt: now(),
            publishedAt: null,
          },
        ],
      };
      themes.push(copy);
      return copy as never;
    },
    async archiveTheme(storeId, themeId) {
      const t = find(storeId, themeId);
      if (!t) return null;
      if (t.status === "PUBLISHED") return null;
      t.status = "ARCHIVED";
      return t as never;
    },
    async getPublishedState(storeId) {
      const t = themes.find((x) => x.storeId === storeId && x.status === "PUBLISHED");
      const v = t && published(t);
      if (!t || !v) return null;
      return {
        document: v.document as never,
        schemaVersion: v.schemaVersion,
        config: (v.config ?? {}) as never,
        themeKey: t.themeKey,
        layoutPreset: t.layoutPreset,
        themeApiVersion: t.themeApiVersion,
        publishedVersion: v.version,
        publishedAt: v.publishedAt,
      };
    },
    async assignThemeBinding(storeId, input) {
      const t =
        themes.find((x) => x.storeId === storeId && x.status === "PUBLISHED") ??
        themes.find((x) => x.storeId === storeId);
      if (!t) return null;
      const source = published(t) ?? draft(t);
      if (!source) return null;
      const prev = published(t);
      if (prev) prev.status = "ARCHIVED";
      const next = Math.max(...t.versions.map((v) => v.version)) + 1;
      const cfg = { themeKey: input.themeKey, layoutPreset: input.layoutPreset, slots: {} };
      // TODO-164 fix — atanan tema belgesi verildiyse ONU kullan (renk paleti değişir).
      const assignedDoc = input.document !== undefined ? input.document : source.document;
      const assignedSchema = input.schemaVersion ?? source.schemaVersion;
      t.versions.unshift({
        id: id("ver"),
        version: next,
        status: "PUBLISHED",
        schemaVersion: assignedSchema,
        label: `assign:${input.themeKey}`,
        notes: null,
        document: assignedDoc,
        config: cfg,
        themeKey: input.themeKey,
        layoutPreset: input.layoutPreset,
        publishedBy: input.publishedBy ?? null,
        createdAt: now(),
        publishedAt: now(),
      });
      t.versions.unshift({
        id: id("ver"),
        version: next + 1,
        status: "DRAFT",
        schemaVersion: assignedSchema,
        label: null,
        notes: null,
        document: assignedDoc,
        config: cfg,
        themeKey: input.themeKey,
        layoutPreset: input.layoutPreset,
        publishedBy: null,
        createdAt: now(),
        publishedAt: null,
      });
      t.status = "PUBLISHED";
      t.themeKey = input.themeKey;
      t.layoutPreset = input.layoutPreset;
      t.themeApiVersion = input.themeApiVersion;
      if (input.overridePolicy !== undefined) t.overridePolicy = input.overridePolicy;
      return t as never;
    },
    async listThemeBindingSummaries() {
      // Fake: her mağaza-id için PUBLISHED tema özeti (mağaza tablosu yok, temalardan türet).
      const byStore = new Map<string, ThemeLike>();
      for (const t of themes) {
        if (t.status === "PUBLISHED") byStore.set(t.storeId, t);
      }
      const storeIds = [...new Set(themes.map((t) => t.storeId))];
      return storeIds.map((sid) => {
        const t = byStore.get(sid);
        const pub = t?.versions.find((v) => v.status === "PUBLISHED");
        return {
          storeId: sid,
          storeName: sid,
          storeSlug: sid,
          storeStatus: "ACTIVE",
          themeKey: t?.themeKey ?? null,
          layoutPreset: t?.layoutPreset ?? null,
          themeApiVersion: t?.themeApiVersion ?? null,
          publishedConfig: (pub?.config ?? null) as never,
          publishedVersion: pub?.version ?? null,
        };
      }) as never;
    },
  };
  return { api, themes };
}

function buildApp() {
  const { api, themes } = makeFakeDataAccess();
  const recordAudit = vi.fn(async () => {});
  const app = Fastify();
  registerThemeAdminRoutes(app, {
    dataAccess: api,
    requireStoreAdmin: async () => ({ actorUserId: "user_1" }),
    recordAudit,
    issuePreviewToken: (storeId, themeId) => ({
      token: `tok_${storeId}_${themeId}`,
      expiresAt: new Date("2026-07-20T12:10:00.000Z"),
    }),
  });
  return { app, themes, recordAudit };
}

afterEach(() => vi.clearAllMocks());

describe("theme engine admin routes", () => {
  let app: ReturnType<typeof buildApp>["app"];
  let recordAudit: ReturnType<typeof buildApp>["recordAudit"];
  let themes: ReturnType<typeof buildApp>["themes"];

  beforeEach(() => {
    const built = buildApp();
    app = built.app;
    recordAudit = built.recordAudit;
    themes = built.themes;
  });

  it("GET presets → 10 presets", async () => {
    const res = await app.inject({ method: "GET", url: "/stores/s1/theme/presets" });
    expect(res.statusCode).toBe(200);
    expect(res.json().presets).toHaveLength(10);
    expect(res.json().presets[0]).toMatchObject({ id: "classic", name: "Classic" });
  });

  it("POST theme from preset → 201 with draft document", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/themes",
      payload: { name: "Mağazam", presetId: "modern" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("DRAFT");
    expect(body.source).toBe("modern");
    expect(body.draft.version).toBe(1);
    expect(body.draft.document.meta.name).toBe("Mağazam");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE" }));
  });

  it("POST theme with unknown preset → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/themes",
      payload: { name: "X", presetId: "nope" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("THEME_PRESET_NOT_FOUND");
  });

  it("full lifecycle: create → saveDraft → publish → new draft → rollback", async () => {
    // create
    const created = await app.inject({
      method: "POST",
      url: "/stores/s1/themes",
      payload: { name: "Live" },
    });
    const themeId = created.json().id;

    // saveDraft (valid document)
    const edited = structuredClone(DEFAULT_THEME_DOCUMENT);
    edited.tokens.brand.primary = "#ff0000";
    const save = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${themeId}/draft`,
      payload: { document: edited },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().draft.document.tokens.brand.primary).toBe("#ff0000");

    // publish → draft becomes published + a fresh draft appears
    const pub = await app.inject({
      method: "POST",
      url: `/stores/s1/themes/${themeId}/publish`,
      payload: {},
    });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().status).toBe("PUBLISHED");
    expect(pub.json().published.version).toBe(1);
    expect(pub.json().draft.version).toBe(2);

    // preview draft CSS reflects the red accent
    const preview = await app.inject({
      method: "GET",
      url: `/stores/s1/themes/${themeId}/preview`,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().css).toContain("--accent: #ff0000;");

    // rollback to v1 (published) into the current draft
    const rb = await app.inject({
      method: "POST",
      url: `/stores/s1/themes/${themeId}/rollback`,
      payload: { version: 1 },
    });
    expect(rb.statusCode).toBe(200);
    expect(rb.json().draft.document.tokens.brand.primary).toBe("#ff0000");
  });

  it("saveDraft rejects an invalid document → 400", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/stores/s1/themes",
      payload: { name: "Bad" },
    });
    const themeId = created.json().id;
    const bad = structuredClone(DEFAULT_THEME_DOCUMENT) as Record<string, unknown>;
    delete (bad.tokens as Record<string, unknown>).surface;
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${themeId}/draft`,
      payload: { document: bad },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_THEME_DOCUMENT");
  });

  it("saveDraft rejects a dangling reference → 400", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/stores/s1/themes",
      payload: { name: "Ref" },
    });
    const themeId = created.json().id;
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.semantic["action.primary"] = "{brand.missing}";
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${themeId}/draft`,
      payload: { document: doc },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_THEME_REFERENCES");
  });

  it("saveDraft sanitizes customCss (no unsafe injection)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/stores/s1/themes",
      payload: { name: "CSS" },
    });
    const themeId = created.json().id;
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.customCss = "</style><script>evil()</script>.x{color:red}";
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${themeId}/draft`,
      payload: { document: doc },
    });
    expect(res.statusCode).toBe(200);
    const saved = res.json().draft.document.customCss as string;
    expect(saved).not.toContain("<script");
    expect(saved).not.toContain("</style>");
  });

  // ── H-1 — Theme Token Stored XSS: save-time typed token savunması ──────────
  it("saveDraft rejects a style-breaking color token → 400 THEME_TOKEN_UNSAFE_VALUE", async () => {
    const created = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "X" } });
    const themeId = created.json().id;
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.tokens.brand.primary = "red;}</style><script>alert(1)</script>";
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${themeId}/draft`,
      payload: { document: doc },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("THEME_TOKEN_UNSAFE_VALUE");
    // GÜVENLİK: yanıt ham payload TAŞIMAZ (yalnız path/type/reason).
    const raw = JSON.stringify(res.json());
    expect(raw).not.toContain("<script");
    expect(raw).not.toContain("alert(1)");
    expect(res.json().error.details.tokens[0].path).toBe("tokens.brand.primary");
  });

  it("saveDraft rejects an unknown token key → 400 THEME_TOKEN_UNKNOWN", async () => {
    const created = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "U" } });
    const themeId = created.json().id;
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT) as Record<string, unknown>;
    (((doc.tokens as Record<string, unknown>).brand) as Record<string, string>).evil = "#fff";
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${themeId}/draft`,
      payload: { document: doc },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("THEME_TOKEN_UNKNOWN");
  });

  it("saveDraft rejects a type-mismatched radius (vh unit) → 400 THEME_TOKEN_INVALID_VALUE", async () => {
    const created = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "R" } });
    const themeId = created.json().id;
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.tokens.radius.md = "10vh";
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${themeId}/draft`,
      payload: { document: doc },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("THEME_TOKEN_INVALID_VALUE");
  });

  it("publish is blocked when the draft holds legacy invalid tokens → 409 THEME_PUBLISH_BLOCKED", async () => {
    const created = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "Legacy" } });
    const themeId = created.json().id;
    // Save-time savunmasını ATLAYARAK DB'ye doğrudan bozuk token yaz (legacy simülasyonu).
    const theme = themes.find((t) => t.id === themeId)!;
    const draftVer = theme.versions.find((v) => v.status === "DRAFT")!;
    const badDoc = structuredClone(DEFAULT_THEME_DOCUMENT);
    badDoc.tokens.brand.primary = "</style><script>alert(1)</script>";
    draftVer.document = badDoc;
    const res = await app.inject({
      method: "POST",
      url: `/stores/s1/themes/${themeId}/publish`,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("THEME_PUBLISH_BLOCKED");
  });

  it("import rejects a document with unsafe tokens → 400", async () => {
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.tokens.text.primary = 'red";background:url(https://evil/x)';
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/themes/import",
      payload: { data: doc, name: "Imported" },
    });
    expect(res.statusCode).toBe(400);
    expect(String(res.json().error.code)).toMatch(/^THEME_TOKEN_/);
  });

  it("public theme render drops legacy invalid tokens (no payload in CSS)", async () => {
    const created = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "Pub2" } });
    const themeId = created.json().id;
    await app.inject({ method: "POST", url: `/stores/s1/themes/${themeId}/publish`, payload: {} });
    // Yayınlanmış versiyonu legacy-bozuk yap (render-time defense sınavı).
    const theme = themes.find((t) => t.id === themeId)!;
    const pubVer = theme.versions.find((v) => v.status === "PUBLISHED")!;
    const badDoc = structuredClone(DEFAULT_THEME_DOCUMENT);
    badDoc.tokens.brand.primary = "red;}</style><script>alert(1)</script>";
    pubVer.document = badDoc;
    const preview = await app.inject({ method: "GET", url: `/stores/s1/themes/${themeId}/preview` });
    expect(preview.statusCode).toBe(200);
    const css = preview.json().css as string;
    expect(css).not.toContain("<script");
    expect(css).not.toContain("</style>");
    expect(css).not.toContain("alert(1)");
    // Diğer geçerli tokenlar hâlâ üretilir.
    expect(css).toContain("--paper: #f7f6f3;");
  });

  it("cannot delete a published theme → 409", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/stores/s1/themes",
      payload: { name: "Pub" },
    });
    const themeId = created.json().id;
    await app.inject({ method: "POST", url: `/stores/s1/themes/${themeId}/publish`, payload: {} });
    const res = await app.inject({ method: "DELETE", url: `/stores/s1/themes/${themeId}` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("THEME_PUBLISHED_DELETE");
  });

  it("export → import round-trip creates a new theme", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/stores/s1/themes",
      payload: { name: "Export me", presetId: "luxury" },
    });
    const themeId = created.json().id;
    const exp = await app.inject({ method: "GET", url: `/stores/s1/themes/${themeId}/export` });
    expect(exp.statusCode).toBe(200);
    const json = exp.json().json as string;
    expect(json).toContain("commerce-os/theme");

    const imp = await app.inject({
      method: "POST",
      url: "/stores/s1/themes/import",
      payload: { name: "Imported", data: JSON.parse(json) },
    });
    expect(imp.statusCode).toBe(201);
    expect(imp.json().name).toBe("Imported");
    expect(imp.json().source).toBe("import");
  });

  it("import rejects an invalid payload → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/themes/import",
      payload: { data: { schemaVersion: 1, meta: {} } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_THEME_IMPORT");
  });

  it("one published theme per store: publishing B archives A", async () => {
    const a = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "A" } });
    const b = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "B" } });
    await app.inject({ method: "POST", url: `/stores/s1/themes/${a.json().id}/publish`, payload: {} });
    await app.inject({ method: "POST", url: `/stores/s1/themes/${b.json().id}/publish`, payload: {} });
    const list = await app.inject({ method: "GET", url: "/stores/s1/themes" });
    const byName = Object.fromEntries(list.json().themes.map((t: { name: string; status: string }) => [t.name, t.status]));
    expect(byName.A).toBe("ARCHIVED");
    expect(byName.B).toBe("PUBLISHED");
  });

  it("404 for a theme in another store", async () => {
    const created = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "T" } });
    const res = await app.inject({ method: "GET", url: `/stores/s2/themes/${created.json().id}` });
    expect(res.statusCode).toBe(404);
  });
});

describe("theme preset documents", () => {
  it("every preset resolves to a valid create payload", () => {
    for (const p of ["classic", "luxury", "dark-luxury", "sports"]) {
      expect(getPreset(p)).toBeDefined();
    }
  });
});

// ── TODO-164 — layout config + compatibility publish gate ─────────────────────
describe("theme layout config + compatibility (TODO-164)", () => {
  let app: ReturnType<typeof buildApp>["app"];
  let themes: ReturnType<typeof buildApp>["themes"];

  beforeEach(() => {
    const built = buildApp();
    app = built.app;
    themes = built.themes;
  });

  async function createTheme() {
    const res = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "Cfg" } });
    return res.json().id as string;
  }

  it("yeni tema BASE_COMMERCE binding ile başlar", async () => {
    const id = await createTheme();
    const res = await app.inject({ method: "GET", url: `/stores/s1/themes/${id}` });
    expect(res.json().themeKey).toBe("BASE_COMMERCE");
    expect(res.json().layoutPreset).toBe("BASE_COMMERCE");
    expect(res.json().draft.config).toMatchObject({ themeKey: "BASE_COMMERCE" });
  });

  it("geçerli layout preset config kaydedilir", async () => {
    const id = await createTheme();
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${id}/draft`,
      payload: {
        document: DEFAULT_THEME_DOCUMENT,
        config: { themeKey: "FASHION_MINIMAL", layoutPreset: "FASHION_MINIMAL", slots: { productCard: "compact" } },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().layoutPreset).toBe("FASHION_MINIMAL");
    expect(res.json().draft.config.slots.productCard).toBe("compact");
  });

  it("bilinmeyen theme-key config → 400 THEME_INCOMPATIBLE", async () => {
    const id = await createTheme();
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${id}/draft`,
      payload: { document: DEFAULT_THEME_DOCUMENT, config: { themeKey: "attacker-theme" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("THEME_INCOMPATIBLE");
  });

  it("izinsiz slot variant config → 400", async () => {
    const id = await createTheme();
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${id}/draft`,
      payload: { document: DEFAULT_THEME_DOCUMENT, config: { themeKey: "BASE_COMMERCE", slots: { header: "evil" } } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("THEME_INCOMPATIBLE");
  });

  it("uyumsuz draft config publish edilemez → 409 (save-time bypass'a karşı)", async () => {
    const id = await createTheme();
    // Save-time doğrulamayı atlayıp bozuk config'i doğrudan fake store'a enjekte et.
    const theme = themes.find((t) => t.id === id)!;
    const draft = theme.versions.find((v) => v.status === "DRAFT")!;
    draft.config = { themeKey: "attacker-theme", layoutPreset: "BASE_COMMERCE", slots: {} };
    const res = await app.inject({ method: "POST", url: `/stores/s1/themes/${id}/publish`, payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("THEME_INCOMPATIBLE");
    // Mevcut yayın korunur (publish uygulanmadı).
    expect(theme.status).not.toBe("PUBLISHED");
  });

  it("publish publishedBy ve invalidation çağırır", async () => {
    const invalidate = vi.fn();
    const { api } = makeFakeDataAccess();
    const app2 = Fastify();
    registerThemeAdminRoutes(app2, {
      dataAccess: api,
      requireStoreAdmin: async () => ({ actorUserId: "admin_9" }),
      recordAudit: async () => {},
      invalidateResolvedTheme: invalidate,
    });
    const created = await app2.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "P" } });
    const id = created.json().id;
    await app2.inject({
      method: "PUT",
      url: `/stores/s1/themes/${id}/draft`,
      payload: { document: DEFAULT_THEME_DOCUMENT },
    });
    const pub = await app2.inject({ method: "POST", url: `/stores/s1/themes/${id}/publish`, payload: {} });
    expect(pub.statusCode).toBe(200);
    expect(invalidate).toHaveBeenCalledWith("s1");
  });
});

// ── TODO-164 — Platform Admin theme binding ───────────────────────────────────
function buildBindingApp(themeStudioEnabled = true) {
  const { api, themes } = makeFakeDataAccess();
  const invalidate = vi.fn();
  const recordAudit = vi.fn(async () => {});
  const admin = Fastify();
  registerThemeAdminRoutes(admin, {
    dataAccess: api,
    requireStoreAdmin: async () => ({ actorUserId: "user_1" }),
    recordAudit,
    invalidateResolvedTheme: invalidate,
  });
  registerThemeBindingRoutes(admin, {
    dataAccess: api,
    requirePlatformStoreAdmin: async () => ({ actorUserId: "platform_1" }),
    requirePlatformAdmin: async () => ({ actorUserId: "platform_1" }),
    isThemeStudioEnabled: async () => themeStudioEnabled,
    recordAudit,
    invalidateResolvedTheme: invalidate,
  });
  return { app: admin, themes, invalidate, recordAudit };
}

describe("platform admin theme binding (TODO-164)", () => {
  it("GET binding: aktif tema + atanabilir tema listesi", async () => {
    const { app } = buildBindingApp();
    const res = await app.inject({ method: "GET", url: "/admin/stores/s1/theme-binding" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.activeThemeKey).toBe("BASE_COMMERCE");
    expect(body.capabilityEnabled).toBe(true);
    expect(body.assignableThemes.length).toBeGreaterThanOrEqual(6);
    expect(body.assignableThemes.some((t: { key: string }) => t.key === "FASHION_MINIMAL")).toBe(true);
    expect(body.assignableThemes.some((t: { key: string }) => t.key === "demo-aurora")).toBe(true);
  });

  it("PUT binding: theme-key atar, published tema değişir, invalidation çağrılır", async () => {
    const { app, themes, invalidate } = buildBindingApp();
    // Bir published tema olmalı (atama hedefi).
    const created = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "A" } });
    const id = created.json().id;
    await app.inject({ method: "PUT", url: `/stores/s1/themes/${id}/draft`, payload: { document: DEFAULT_THEME_DOCUMENT } });
    await app.inject({ method: "POST", url: `/stores/s1/themes/${id}/publish`, payload: {} });

    const res = await app.inject({
      method: "PUT",
      url: "/admin/stores/s1/theme-binding",
      payload: { themeKey: "FASHION_MINIMAL" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().activeThemeKey).toBe("FASHION_MINIMAL");
    expect(res.json().layoutPreset).toBe("FASHION_MINIMAL");
    const pub = themes.find((t) => t.storeId === "s1" && t.status === "PUBLISHED")!;
    expect(pub.themeKey).toBe("FASHION_MINIMAL");
    expect(invalidate).toHaveBeenCalledWith("s1");
    // TODO-164 fix — atama TOKEN paletini de uygular: published belge base'den FARKLI.
    const pubVer = pub.versions.find((v) => v.status === "PUBLISHED")!;
    const doc = pubVer.document as typeof DEFAULT_THEME_DOCUMENT;
    expect(doc.tokens.brand.primary).not.toBe(DEFAULT_THEME_DOCUMENT.tokens.brand.primary);
  });

  it("PUT binding bilinmeyen theme-key → 409", async () => {
    const { app } = buildBindingApp();
    const created = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "A" } });
    const id = created.json().id;
    await app.inject({ method: "PUT", url: `/stores/s1/themes/${id}/draft`, payload: { document: DEFAULT_THEME_DOCUMENT } });
    await app.inject({ method: "POST", url: `/stores/s1/themes/${id}/publish`, payload: {} });
    const res = await app.inject({
      method: "PUT",
      url: "/admin/stores/s1/theme-binding",
      payload: { themeKey: "attacker-theme" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("THEME_INCOMPATIBLE");
  });

  it("THEME_STUDIO kapalıyken capabilityEnabled false ama binding görünür", async () => {
    const { app } = buildBindingApp(false);
    const res = await app.inject({ method: "GET", url: "/admin/stores/s1/theme-binding" });
    expect(res.statusCode).toBe(200);
    expect(res.json().capabilityEnabled).toBe(false);
  });

  it("GET /admin/theme-bindings fleet listesi — mağaza başına aktif tema özeti", async () => {
    const { app } = buildBindingApp();
    // s1 published FASHION_MINIMAL, s2 base (published default)
    const c1 = await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "A" } });
    await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${c1.json().id}/draft`,
      payload: { document: DEFAULT_THEME_DOCUMENT, config: { themeKey: "FASHION_MINIMAL", layoutPreset: "FASHION_MINIMAL", slots: {} } },
    });
    await app.inject({ method: "POST", url: `/stores/s1/themes/${c1.json().id}/publish`, payload: {} });
    const c2 = await app.inject({ method: "POST", url: "/stores/s2/themes", payload: { name: "B" } });
    await app.inject({ method: "PUT", url: `/stores/s2/themes/${c2.json().id}/draft`, payload: { document: DEFAULT_THEME_DOCUMENT } });
    await app.inject({ method: "POST", url: `/stores/s2/themes/${c2.json().id}/publish`, payload: {} });

    const res = await app.inject({ method: "GET", url: "/admin/theme-bindings" });
    expect(res.statusCode).toBe(200);
    const bindings = res.json().bindings as Array<{ storeId: string; activeThemeKey: string; compatible: boolean }>;
    const s1 = bindings.find((b) => b.storeId === "s1")!;
    const s2 = bindings.find((b) => b.storeId === "s2")!;
    expect(s1.activeThemeKey).toBe("FASHION_MINIMAL");
    expect(s1.compatible).toBe(true);
    expect(s2.activeThemeKey).toBe("BASE_COMMERCE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TODO-164A — Custom Theme Builder route'ları
// ═══════════════════════════════════════════════════════════════════════════
describe("custom theme builder (TODO-164A)", () => {
  let app: ReturnType<typeof buildApp>["app"];
  beforeEach(() => {
    app = buildApp().app;
  });

  const create = async (payload: Record<string, unknown>) =>
    (await app.inject({ method: "POST", url: "/stores/s1/themes", payload })).json().id as string;

  it("startingPoint'ten oluşturma → preset config+document snapshot'ı", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/themes",
      payload: { name: "Editorial", startingPoint: "FASHION_EDITORIAL" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.source).toBe("start:FASHION_EDITORIAL");
    expect(body.layoutPreset).toBe("FASHION_EDITORIAL");
    expect(Object.keys(body.draft.config.slots).length).toBeGreaterThan(0);
  });

  it("bilinmeyen startingPoint → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/themes",
      payload: { name: "X", startingPoint: "NOPE" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("THEME_STARTING_POINT_NOT_FOUND");
  });

  it("genişletilmiş builder config kabul edilir (draft save)", async () => {
    const id = await create({ name: "B" });
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${id}/draft`,
      payload: {
        document: DEFAULT_THEME_DOCUMENT,
        config: {
          themeKey: "BASE_COMMERCE",
          slotVariants: { header: "CENTERED_BRAND", productCard: "EDITORIAL" },
          listing: { columnsDesktop: 4 },
          hero: { height: "tall", contentAlign: "center" },
          responsiveOverrides: { mobile: { columns: 2 } },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    // slotVariants slots'a merge edilir.
    expect(res.json().draft.config.slots.header).toBe("CENTERED_BRAND");
  });

  it("güvensiz builder config değeri → 400 INVALID_THEME_CONFIG", async () => {
    const id = await create({ name: "B" });
    const res = await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${id}/draft`,
      payload: { document: DEFAULT_THEME_DOCUMENT, config: { container: { width: "url(x)" } } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_THEME_CONFIG");
  });

  it("kontrast publish gate: düşük kontrast → 409 THEME_CONTRAST_FAILED", async () => {
    const id = await create({ name: "B" });
    const bad = structuredClone(DEFAULT_THEME_DOCUMENT);
    bad.tokens.text.primary = "#dddddd"; // beyaz zemin üstünde okunmaz
    bad.tokens.text.secondary = "#e0e0e0";
    await app.inject({ method: "PUT", url: `/stores/s1/themes/${id}/draft`, payload: { document: bad } });
    const pub = await app.inject({ method: "POST", url: `/stores/s1/themes/${id}/publish`, payload: {} });
    expect(pub.statusCode).toBe(409);
    expect(pub.json().error.code).toBe("THEME_CONTRAST_FAILED");
  });

  it("tema kopyalama → yeni kimlik, DRAFT, duplicatedFrom", async () => {
    const id = await create({ name: "Kaynak" });
    const res = await app.inject({
      method: "POST",
      url: `/stores/s1/themes/${id}/duplicate`,
      payload: { name: "Kopya" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).not.toBe(id);
    expect(body.name).toBe("Kopya");
    expect(body.status).toBe("DRAFT");
    expect(body.duplicatedFrom).toBe(id);
    expect(body.versions).toHaveLength(1); // history KOPYALANMAZ
  });

  it("yayındaki tema arşivlenemez → 409; draft arşivlenir → 200", async () => {
    // draft arşivle
    const id = await create({ name: "A" });
    const arch = await app.inject({ method: "POST", url: `/stores/s1/themes/${id}/archive`, payload: {} });
    expect(arch.statusCode).toBe(200);
    expect(arch.json().status).toBe("ARCHIVED");
    // publish → arşivleme reddi
    const id2 = await create({ name: "B" });
    await app.inject({ method: "PUT", url: `/stores/s1/themes/${id2}/draft`, payload: { document: DEFAULT_THEME_DOCUMENT } });
    await app.inject({ method: "POST", url: `/stores/s1/themes/${id2}/publish`, payload: {} });
    const arch2 = await app.inject({ method: "POST", url: `/stores/s1/themes/${id2}/archive`, payload: {} });
    expect(arch2.statusCode).toBe(409);
  });

  it("preview-token → token + expiresAt", async () => {
    const id = await create({ name: "P" });
    const res = await app.inject({ method: "POST", url: `/stores/s1/themes/${id}/preview-token`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toContain(id);
    expect(typeof res.json().expiresAt).toBe("string");
  });
});

// TODO-164B (ADR-232/233) — Rol ayrımı + Store Override Policy server-side enforcement.
describe("store override policy enforcement (TODO-164B)", () => {
  let app: ReturnType<typeof buildApp>["app"];
  let themes: ReturnType<typeof buildApp>["themes"];

  beforeEach(() => {
    const built = buildApp();
    app = built.app;
    themes = built.themes;
  });

  /** Tema oluştur + verilen belgeyle publish et (baseline = platform-onaylı state). */
  async function createAndPublish(): Promise<string> {
    const id = (await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "Brand" } }))
      .json().id as string;
    await app.inject({
      method: "PUT",
      url: `/stores/s1/themes/${id}/draft`,
      payload: { document: DEFAULT_THEME_DOCUMENT },
    });
    await app.inject({ method: "POST", url: `/stores/s1/themes/${id}/publish`, payload: {} });
    return id;
  }

  function setPolicy(id: string, policy: unknown, ownerScope = "STORE") {
    const t = themes.find((x) => x.id === id)!;
    t.overridePolicy = policy;
    t.ownerScope = ownerScope;
  }

  it("detail ownerScope + fieldPolicyProjection taşır (varsayılan all-editable)", async () => {
    const id = (await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "D" } })).json()
      .id as string;
    const res = await app.inject({ method: "GET", url: `/stores/s1/themes/${id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ownerScope).toBe("STORE");
    expect(body.overridePolicy).toBeNull();
    expect(body.fieldPolicyProjection.editable).toContain("brand.primaryColor");
    expect(body.updateAvailable).toBe(false);
  });

  it("locked renk alanı değişimi → 409 THEME_FIELD_LOCKED", async () => {
    const id = await createAndPublish();
    setPolicy(id, { fields: { "color.background": "locked" }, allowedFonts: [], allowedPalettes: [], allowedLayoutPresets: [] });
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.tokens.surface.background = "#010203";
    const res = await app.inject({ method: "PUT", url: `/stores/s1/themes/${id}/draft`, payload: { document: doc } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("THEME_FIELD_LOCKED");
    expect(res.json().error.details.violations[0].path).toBe("color.background");
  });

  it("editable alan değişimi (locked policy'de bile) → 200", async () => {
    const id = await createAndPublish();
    setPolicy(id, { fields: { "color.background": "locked" }, allowedFonts: [], allowedPalettes: [], allowedLayoutPresets: [] });
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.tokens.brand.primary = "#123456"; // editable
    const res = await app.inject({ method: "PUT", url: `/stores/s1/themes/${id}/draft`, payload: { document: doc } });
    expect(res.statusCode).toBe(200);
    expect(res.json().draft.document.tokens.brand.primary).toBe("#123456");
  });

  it("izinsiz font ailesi → 409 THEME_FONT_NOT_ALLOWED", async () => {
    const id = await createAndPublish();
    setPolicy(id, {
      fields: {},
      allowedFonts: ["classic-serif"], // heading/body = georgia
      allowedPalettes: [],
      allowedLayoutPresets: [],
    });
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.tokens.typography.bodyFont = "futura"; // izinli aile değil
    const res = await app.inject({ method: "PUT", url: `/stores/s1/themes/${id}/draft`, payload: { document: doc } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("THEME_FONT_NOT_ALLOWED");
  });

  it("izinli font ailesi → 200", async () => {
    const id = await createAndPublish();
    setPolicy(id, {
      fields: {},
      allowedFonts: ["classic-serif"],
      allowedPalettes: [],
      allowedLayoutPresets: [],
    });
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.tokens.typography.bodyFont = "georgia"; // izinli
    const res = await app.inject({ method: "PUT", url: `/stores/s1/themes/${id}/draft`, payload: { document: doc } });
    expect(res.statusCode).toBe(200);
  });

  it("platform template eksik policy ile publish → 409 THEME_POLICY_INCOMPLETE", async () => {
    const id = (await app.inject({ method: "POST", url: "/stores/s1/themes", payload: { name: "PT" } })).json()
      .id as string;
    await app.inject({ method: "PUT", url: `/stores/s1/themes/${id}/draft`, payload: { document: DEFAULT_THEME_DOCUMENT } });
    // Platform teması + EKSİK policy (yalnız bir alan explicit).
    setPolicy(id, { fields: { "brand.primaryColor": "editable" }, allowedFonts: [], allowedPalettes: [], allowedLayoutPresets: [] }, "PLATFORM");
    const res = await app.inject({ method: "POST", url: `/stores/s1/themes/${id}/publish`, payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("THEME_POLICY_INCOMPLETE");
    expect(res.json().error.details.missingFields.length).toBeGreaterThan(0);
  });

  it("publish locked alanı published baseline'dan farklıysa → 409", async () => {
    const id = await createAndPublish();
    // Baseline (published) default renk. Policy color.background locked.
    setPolicy(id, { fields: { "color.background": "locked" }, allowedFonts: [], allowedPalettes: [], allowedLayoutPresets: [] });
    // Draft'ı doğrudan (policy'siz) mutasyona uğrat → publish gate ikinci kapı yakalamalı.
    const t = themes.find((x) => x.id === id)!;
    const draftVer = t.versions.find((v) => v.status === "DRAFT")!;
    const doc = structuredClone(DEFAULT_THEME_DOCUMENT);
    doc.tokens.surface.background = "#e8e8e8"; // farklı ama kontrast-güvenli (açık zemin)
    draftVer.document = doc;
    const res = await app.inject({ method: "POST", url: `/stores/s1/themes/${id}/publish`, payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("THEME_FIELD_LOCKED");
  });
});
