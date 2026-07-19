import { describe, expect, it } from "vitest";
import type { TransactionClient } from "@commerce-os/db";
import { recordSlugChange } from "../src/seo/slug-governance.js";

/**
 * TODO-156D tamamlama — recordSlugChange (SlugHistory write + otomatik 301 redirect + chain collapse) birim
 * testleri. Gerçek fonksiyon, in-memory FAKE transaction ile sürülür (DB gerekmez); upsert/updateMany/deleteMany
 * semantiği Prisma ile aynı (where filtreleri storeId + alan bazlı). §1 (write/duplicate/tenant), §2 (auto),
 * §3 (chain collapse/second rename/back-rename), §7 (loop tohumu temizliği) kapsanır.
 */

interface HistoryRow {
  storeId: string;
  entityType: string;
  entityId: string;
  oldSlug: string;
  createdBy: string | null;
}
interface RedirectRow {
  storeId: string;
  sourcePath: string;
  targetPath: string;
  type: string;
  enabled: boolean;
}

function makeFakeTx() {
  const history: HistoryRow[] = [];
  const redirects: RedirectRow[] = [];

  const tx = {
    slugHistory: {
      async upsert({ where, create, update }: any) {
        const k = where.storeId_entityType_oldSlug;
        const existing = history.find(
          (h) => h.storeId === k.storeId && h.entityType === k.entityType && h.oldSlug === k.oldSlug,
        );
        if (existing) {
          Object.assign(existing, update); // update = {} → immutable no-op
          return existing;
        }
        const row: HistoryRow = { ...create };
        history.push(row);
        return row;
      },
    },
    redirect: {
      async updateMany({ where, data }: any) {
        let count = 0;
        for (const r of redirects) {
          if (r.storeId === where.storeId && r.targetPath === where.targetPath) {
            Object.assign(r, data);
            count += 1;
          }
        }
        return { count };
      },
      async deleteMany({ where }: any) {
        let count = 0;
        for (let i = redirects.length - 1; i >= 0; i -= 1) {
          const r = redirects[i];
          if (r.storeId === where.storeId && r.sourcePath === where.sourcePath) {
            redirects.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
      async upsert({ where, create, update }: any) {
        const k = where.storeId_sourcePath;
        const existing = redirects.find((r) => r.storeId === k.storeId && r.sourcePath === k.sourcePath);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: RedirectRow = { ...create };
        redirects.push(row);
        return row;
      },
    },
  };

  return { tx: tx as unknown as TransactionClient, history, redirects };
}

const S = "store_1";

describe("recordSlugChange — SlugHistory write (§1)", () => {
  it("ürün slug değişince history + 301 redirect yazar", async () => {
    const { tx, history, redirects } = makeFakeTx();
    await recordSlugChange(tx, {
      storeId: S,
      entityType: "PRODUCT",
      entityId: "p1",
      oldSlug: "iphone-15",
      newSlug: "iphone-15-pro",
      createdBy: "admin_1",
    });
    expect(history).toEqual([
      { storeId: S, entityType: "PRODUCT", entityId: "p1", oldSlug: "iphone-15", createdBy: "admin_1" },
    ]);
    expect(redirects).toEqual([
      {
        storeId: S,
        sourcePath: "/products/iphone-15",
        targetPath: "/products/iphone-15-pro",
        type: "PERMANENT_301",
        enabled: true,
      },
    ]);
  });

  it("kategori slug değişince query-path redirect yazar (kanonik kategori surface)", async () => {
    const { tx, redirects } = makeFakeTx();
    await recordSlugChange(tx, {
      storeId: S,
      entityType: "CATEGORY",
      entityId: "c1",
      oldSlug: "ayakkabi",
      newSlug: "ayakkabilar",
    });
    expect(redirects[0]).toMatchObject({
      sourcePath: "/products?category=ayakkabi",
      targetPath: "/products?category=ayakkabilar",
      type: "PERMANENT_301",
    });
  });

  it("aynı slug tekrar değişse bile history DUPLICATE oluşmaz (immutable, idempotent)", async () => {
    const { tx, history } = makeFakeTx();
    const args = { storeId: S, entityType: "PRODUCT" as const, entityId: "p1", oldSlug: "a", newSlug: "b" };
    await recordSlugChange(tx, args);
    await recordSlugChange(tx, args); // aynı oldSlug ikinci kez
    expect(history.filter((h) => h.oldSlug === "a")).toHaveLength(1);
  });

  it("tenant-aware: history + redirect storeId taşır", async () => {
    const { tx, history, redirects } = makeFakeTx();
    await recordSlugChange(tx, { storeId: "store_X", entityType: "PRODUCT", entityId: "p", oldSlug: "a", newSlug: "b" });
    expect(history[0].storeId).toBe("store_X");
    expect(redirects[0].storeId).toBe("store_X");
  });

  it("createdBy verilmezse null yazılır", async () => {
    const { tx, history } = makeFakeTx();
    await recordSlugChange(tx, { storeId: S, entityType: "PRODUCT", entityId: "p", oldSlug: "a", newSlug: "b" });
    expect(history[0].createdBy).toBeNull();
  });
});

describe("recordSlugChange — otomatik redirect + chain collapse (§2/§3)", () => {
  it("ikinci rename ZİNCİR oluşturmaz: iphone→iphone-pro→iphone-pro-max ⇒ ikisi de son hedefe", async () => {
    const { tx, redirects } = makeFakeTx();
    // 1) iphone → iphone-pro
    await recordSlugChange(tx, { storeId: S, entityType: "PRODUCT", entityId: "p1", oldSlug: "iphone", newSlug: "iphone-pro" });
    // 2) iphone-pro → iphone-pro-max
    await recordSlugChange(tx, { storeId: S, entityType: "PRODUCT", entityId: "p1", oldSlug: "iphone-pro", newSlug: "iphone-pro-max" });

    const bySource = Object.fromEntries(redirects.map((r) => [r.sourcePath, r.targetPath]));
    expect(bySource["/products/iphone"]).toBe("/products/iphone-pro-max"); // repoint (chain collapse)
    expect(bySource["/products/iphone-pro"]).toBe("/products/iphone-pro-max");
    // Zincir yok: hiçbir target başka bir source değil.
    const sources = new Set(redirects.map((r) => r.sourcePath));
    for (const r of redirects) expect(sources.has(r.targetPath)).toBe(false);
  });

  it("back-rename güvenli: iphone→iphone-pro sonra iphone-pro→iphone ⇒ tek {iphone-pro→iphone}, loop yok", async () => {
    const { tx, redirects } = makeFakeTx();
    await recordSlugChange(tx, { storeId: S, entityType: "PRODUCT", entityId: "p1", oldSlug: "iphone", newSlug: "iphone-pro" });
    await recordSlugChange(tx, { storeId: S, entityType: "PRODUCT", entityId: "p1", oldSlug: "iphone-pro", newSlug: "iphone" });

    // /products/iphone artık CANLI → ondan yönlendiren kural OLMAMALI (self/loop temizlendi).
    expect(redirects.find((r) => r.sourcePath === "/products/iphone")).toBeUndefined();
    expect(redirects).toEqual([
      {
        storeId: S,
        sourcePath: "/products/iphone-pro",
        targetPath: "/products/iphone",
        type: "PERMANENT_301",
        enabled: true,
      },
    ]);
  });

  it("aynı source tekrar rename edilirse redirect GÜNCELLENİR (duplicate yok, source unique)", async () => {
    const { tx, redirects } = makeFakeTx();
    await recordSlugChange(tx, { storeId: S, entityType: "PRODUCT", entityId: "p1", oldSlug: "a", newSlug: "b" });
    await recordSlugChange(tx, { storeId: S, entityType: "PRODUCT", entityId: "p1", oldSlug: "a", newSlug: "c" });
    const fromA = redirects.filter((r) => r.sourcePath === "/products/a");
    expect(fromA).toHaveLength(1);
    expect(fromA[0].targetPath).toBe("/products/c");
  });

  it("oldSlug === newSlug ise hiçbir şey yazmaz (güvenlik ağı)", async () => {
    const { tx, history, redirects } = makeFakeTx();
    await recordSlugChange(tx, { storeId: S, entityType: "PRODUCT", entityId: "p", oldSlug: "a", newSlug: "a" });
    expect(history).toHaveLength(0);
    expect(redirects).toHaveLength(0);
  });
});
