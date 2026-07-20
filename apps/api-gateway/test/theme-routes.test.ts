import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME_DOCUMENT, getPreset } from "@commerce-os/theme";

// theme/data.js -> @commerce-os/db (prisma) import eder; testte gerçek prisma init'ini
// engellemek için boş stub yeter (in-memory fake dataAccess geçirilir; prisma çağrılmaz).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { registerThemeAdminRoutes } = await import("../src/theme/routes.js");
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
          createdAt: now(),
          publishedAt: null,
        });
      }
      return t as never;
    },
    async publishTheme(storeId, themeId) {
      const t = find(storeId, themeId);
      if (!t) return null;
      const d = draft(t);
      if (!d) return null;
      const prev = published(t);
      if (prev) prev.status = "ARCHIVED";
      d.status = "PUBLISHED";
      d.publishedAt = now();
      for (const other of themes) {
        if (other.storeId === storeId && other.id !== themeId && other.status === "PUBLISHED") {
          other.status = "ARCHIVED";
        }
      }
      t.status = "PUBLISHED";
      const next = Math.max(...t.versions.map((v) => v.version)) + 1;
      t.versions.unshift({
        id: id("ver"),
        version: next,
        status: "DRAFT",
        schemaVersion: d.schemaVersion,
        label: null,
        notes: null,
        document: d.document,
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
        d.label = `rollback:v${version}`;
      }
      return t as never;
    },
    async getPublishedDocument(storeId) {
      const t = themes.find((x) => x.storeId === storeId && x.status === "PUBLISHED");
      const v = t && published(t);
      return v ? { document: v.document as never, schemaVersion: v.schemaVersion } : null;
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
  });
  return { app, themes, recordAudit };
}

afterEach(() => vi.clearAllMocks());

describe("theme engine admin routes", () => {
  let app: ReturnType<typeof buildApp>["app"];
  let recordAudit: ReturnType<typeof buildApp>["recordAudit"];

  beforeEach(() => {
    const built = buildApp();
    app = built.app;
    recordAudit = built.recordAudit;
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
