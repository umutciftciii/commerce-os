/**
 * TD-131 (ADR-149…155) — Customer Data Erasure veri katmanı testleri (fake Prisma).
 *
 * `applyErasure` tek transaction'da: davranış/kişisel veri SİLER, sipariş/ödeme/yorum
 * KORUR, temas PII'sini ANONİMLEŞTİRİR. Guest (visitorHash) ve cross-store kayıtlar
 * ETKİLENMEZ. Yorum silinmez (yazar Customer'dan türer); helpfulCount tutarlı düşer.
 */
import { describe, expect, it } from "vitest";
import { createCustomerErasureData } from "../src/customer-erasure/data.js";

// --- Minimal Prisma-şekilli fake (scalar + {in} + null + {gt} + relation eşleşme) ---
type Row = Record<string, unknown>;
type Ctx = Record<string, Row[]>;

function matches(where: Row, row: Row, ctx: Ctx): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === "order") {
      const ord = ctx.order.find((o) => o.id === row.orderId);
      if (!ord || !matches(v as Row, ord, ctx)) return false;
      continue;
    }
    if (k === "list") {
      const lst = ctx.customerList.find((l) => l.id === row.listId);
      if (!lst || !matches(v as Row, lst, ctx)) return false;
      continue;
    }
    const cell = row[k];
    if (v === null) {
      if (cell !== null && cell !== undefined) return false;
      continue;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if ("in" in o) {
        if (!(o.in as unknown[]).includes(cell)) return false;
        continue;
      }
      if ("gt" in o) {
        if (!(typeof cell !== "undefined" && (cell as number | Date) > (o.gt as number | Date))) return false;
        continue;
      }
    } else if (cell !== v) {
      return false;
    }
  }
  return true;
}

function applyData(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "decrement" in (v as Record<string, unknown>)) {
      row[k] = ((row[k] as number) ?? 0) - ((v as { decrement: number }).decrement ?? 0);
    } else {
      row[k] = v;
    }
  }
}

function makeDb(seed: Ctx) {
  const ctx: Ctx = {};
  for (const [k, rows] of Object.entries(seed)) ctx[k] = rows.map((r) => ({ ...r }));
  const del = (name: string) => ({
    count: async ({ where = {} }: { where?: Row } = {}) =>
      ctx[name].filter((r) => matches(where, r, ctx)).length,
    findMany: async ({ where = {} }: { where?: Row } = {}) => ctx[name].filter((r) => matches(where, r, ctx)),
    findFirst: async ({ where = {} }: { where?: Row } = {}) =>
      ctx[name].find((r) => matches(where, r, ctx)) ?? null,
    deleteMany: async ({ where }: { where: Row }) => {
      const before = ctx[name].length;
      ctx[name] = ctx[name].filter((r) => !matches(where, r, ctx));
      return { count: before - ctx[name].length };
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const m = ctx[name].filter((r) => matches(where, r, ctx));
      m.forEach((r) => applyData(r, data));
      return { count: m.length };
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const r = ctx[name].find((x) => matches(where, x, ctx));
      if (r) applyData(r, data);
      return r;
    },
  });
  const tables = [
    "customer",
    "customerSession",
    "customerCredential",
    "customerCredentialToken",
    "customerOtpVerification",
    "customerIban",
    "customerCommunicationPreference",
    "customerAddress",
    "customerCoupon",
    "customerList",
    "customerListItem",
    "productReviewHelpful",
    "productReview",
    "recentlyViewedProduct",
    "recommendationEvent",
    "order",
    "orderAddress",
    "orderLine",
    "paymentAttempt",
    "campaignRedemption",
  ];
  const db: Record<string, unknown> = { $transaction: async (fn: (tx: unknown) => unknown) => fn(db) };
  for (const t of tables) db[t] = del(t);
  return { db, ctx };
}

const FUTURE = new Date(Date.now() + 3_600_000);
const PAST = new Date(Date.now() - 3_600_000);

function seed(): Ctx {
  return {
    customer: [
      {
        id: "c1",
        storeId: "s1",
        status: "ACTIVE",
        firstName: "Ali",
        lastName: "Veli",
        email: "ali@example.com",
        phone: "+905551112233",
        birthDate: new Date("1990-01-01"),
        gender: "MALE",
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
      },
      { id: "c2", storeId: "s1", status: "ACTIVE", firstName: "Ay", lastName: "Şe", email: "ay@example.com" },
      { id: "cx", storeId: "s2", status: "ACTIVE", firstName: "Cross", lastName: "Store", email: "x@example.com" },
    ],
    customerSession: [
      { id: "sess1", storeId: "s1", customerId: "c1", revokedAt: null, expiresAt: FUTURE },
      { id: "sess2", storeId: "s1", customerId: "c1", revokedAt: null, expiresAt: PAST },
      { id: "sess3", storeId: "s1", customerId: "c2", revokedAt: null, expiresAt: FUTURE },
      { id: "sess4", storeId: "s2", customerId: "c1", revokedAt: null, expiresAt: FUTURE },
    ],
    customerCredential: [{ id: "cr1", storeId: "s1", customerId: "c1" }],
    customerCredentialToken: [{ id: "tok1", storeId: "s1", customerId: "c1" }],
    customerOtpVerification: [{ id: "otp1", storeId: "s1", customerId: "c1" }],
    customerIban: [{ id: "ib1", storeId: "s1", customerId: "c1" }],
    customerCommunicationPreference: [{ id: "cp1", storeId: "s1", customerId: "c1" }],
    customerAddress: [{ id: "ad1", storeId: "s1", customerId: "c1" }],
    customerCoupon: [{ id: "cc1", storeId: "s1", customerId: "c1" }],
    customerList: [{ id: "l1", storeId: "s1", customerId: "c1" }],
    customerListItem: [{ id: "li1", storeId: "s1", listId: "l1", productId: "p1" }],
    productReviewHelpful: [{ id: "h1", storeId: "s1", customerId: "c1", reviewId: "rvw2" }],
    productReview: [
      { id: "rvw1", storeId: "s1", customerId: "c1", productId: "p1", helpfulCount: 0, body: "iyi ürün" },
      { id: "rvw2", storeId: "s1", customerId: "c2", productId: "p2", helpfulCount: 1, body: "başkasının yorumu" },
    ],
    recentlyViewedProduct: [
      { id: "rv1", storeId: "s1", customerId: "c1", visitorHash: null, productId: "p1" },
      { id: "rv2", storeId: "s1", customerId: null, visitorHash: "guest-v", productId: "p2" },
      { id: "rv3", storeId: "s2", customerId: "c1", visitorHash: null, productId: "p3" },
    ],
    recommendationEvent: [
      { id: "re1", storeId: "s1", customerId: "c1", visitorHash: null },
      { id: "re2", storeId: "s1", customerId: null, visitorHash: "guest-v" },
    ],
    order: [
      {
        id: "o1",
        storeId: "s1",
        customerId: "c1",
        status: "FULFILLED",
        customerEmail: "ali@example.com",
        billingEmail: "ali@example.com",
        billingTaxId: "12345678901",
        totalAmount: 1000,
      },
      { id: "o2", storeId: "s1", customerId: "c2", status: "PLACED", customerEmail: "ay@example.com", totalAmount: 500 },
    ],
    orderAddress: [
      {
        id: "oa1",
        storeId: "s1",
        orderId: "o1",
        fullName: "Ali Veli",
        phone: "+905551112233",
        addressLine1: "Bağdat Cad. 1",
        addressLine2: "Daire 2",
        district: "Kadıköy",
        postalCode: "34710",
        city: "İstanbul",
        countryCode: "TR",
      },
    ],
    orderLine: [{ id: "ol1", storeId: "s1", orderId: "o1", sku: "SKU1", totalAmount: 1000 }],
    paymentAttempt: [{ id: "pa1", storeId: "s1", orderId: "o1", amountMinor: 1000 }],
    campaignRedemption: [
      { id: "crd1", storeId: "s1", customerId: "c1", email: "ali@example.com", discountAmountMinor: 100 },
    ],
  };
}

const plan = { actorUserId: "admin1", reason: "KVKK talebi", now: new Date("2026-07-27T10:00:00.000Z") };

describe("erasure data: applyErasure — silme + koruma + anonimleştirme", () => {
  it("davranış/kişisel veriyi siler; guest + cross-store + başka müşteri KORUNUR", async () => {
    const { db, ctx } = makeDb(seed());
    const data = createCustomerErasureData(db as never);
    const res = await data.applyErasure("s1", "c1", plan);
    expect(res.kind).toBe("ERASED");

    // Oturumlar: hedefin ikisi de silindi; başka müşteri + cross-store korundu.
    expect(ctx.customerSession.map((r) => r.id).sort()).toEqual(["sess3", "sess4"]);
    // Görüntüleme: guest (rv2) + cross-store (rv3) korundu; hedef (rv1) silindi.
    expect(ctx.recentlyViewedProduct.map((r) => r.id).sort()).toEqual(["rv2", "rv3"]);
    // Recommendation event: guest (re2) korundu; hedef (re1) silindi.
    expect(ctx.recommendationEvent.map((r) => r.id)).toEqual(["re2"]);
    // Auth sırları + kişisel finansal/iletişim/adres/liste/kupon: hepsi silindi.
    for (const t of [
      "customerCredential",
      "customerCredentialToken",
      "customerOtpVerification",
      "customerIban",
      "customerCommunicationPreference",
      "customerAddress",
      "customerCoupon",
      "customerList",
      "customerListItem",
    ]) {
      expect(ctx[t].filter((r) => r.storeId === "s1" && r.customerId === "c1")).toHaveLength(0);
    }
  });

  it("yorumlar KORUNUR (silinmez); helpfulCount tutarlı düşer", async () => {
    const { db, ctx } = makeDb(seed());
    const data = createCustomerErasureData(db as never);
    const res = await data.applyErasure("s1", "c1", plan);

    // Her iki yorum da yaşıyor (hedefin kendi yorumu + başkasının yorumu).
    expect(ctx.productReview.map((r) => r.id).sort()).toEqual(["rvw1", "rvw2"]);
    // Hedefin "faydalı" oyu silindi → oyladığı yorumun sayacı 1 → 0.
    expect(ctx.productReviewHelpful).toHaveLength(0);
    expect(ctx.productReview.find((r) => r.id === "rvw2")?.helpfulCount).toBe(0);
    if (res.kind === "ERASED") expect(res.reviewAnonymizeCount).toBe(1); // hedefin 1 yorumu
  });

  it("sipariş/ödeme KORUNUR; temas PII anonimleşir, mali/yasal alanlar sabit", async () => {
    const { db, ctx } = makeDb(seed());
    const data = createCustomerErasureData(db as never);
    await data.applyErasure("s1", "c1", plan);

    const o1 = ctx.order.find((r) => r.id === "o1")!;
    expect(o1).toBeDefined(); // sipariş SİLİNMEZ
    expect(o1.customerEmail).toBe("erased-c1@erased.invalid");
    expect(o1.billingEmail).toBeNull();
    expect(o1.totalAmount).toBe(1000); // mali sabit
    expect(o1.billingTaxId).toBe("12345678901"); // yasal fatura kimliği KORUNUR
    expect(o1.customerId).toBe("c1"); // anonim Customer'a bağlı kalır

    const oa1 = ctx.orderAddress.find((r) => r.id === "oa1")!;
    expect(oa1.fullName).toBe("Anonim Müşteri");
    expect(oa1.phone).toBeNull();
    expect(oa1.addressLine1).toBe("—");
    expect(oa1.addressLine2).toBeNull();
    expect(oa1.district).toBeNull();
    expect(oa1.postalCode).toBeNull();
    expect(oa1.city).toBe("İstanbul"); // kaba bölge korunur
    expect(oa1.countryCode).toBe("TR");

    // Sipariş satırı + ödeme dokunulmaz.
    expect(ctx.orderLine.find((r) => r.id === "ol1")?.totalAmount).toBe(1000);
    expect(ctx.paymentAttempt.find((r) => r.id === "pa1")?.amountMinor).toBe(1000);

    // Kampanya kullanımı: email null, mali tutar + customerId korunur.
    const crd = ctx.campaignRedemption.find((r) => r.id === "crd1")!;
    expect(crd.email).toBeNull();
    expect(crd.discountAmountMinor).toBe(100);
    expect(crd.customerId).toBe("c1");

    // Başka müşterinin siparişi dokunulmaz.
    expect(ctx.order.find((r) => r.id === "o2")?.customerEmail).toBe("ay@example.com");
  });

  it("Customer satırı anonimleşir + ERASED terminal + audit izleri", async () => {
    const { db, ctx } = makeDb(seed());
    const data = createCustomerErasureData(db as never);
    await data.applyErasure("s1", "c1", plan);
    const c1 = ctx.customer.find((r) => r.id === "c1")!;
    expect(c1.status).toBe("ERASED");
    expect(c1.firstName).toBe("Anonim");
    expect(c1.lastName).toBe("Müşteri");
    expect(c1.email).toBe("erased-c1@erased.invalid");
    expect(c1.phone).toBeNull();
    expect(c1.birthDate).toBeNull();
    expect(c1.gender).toBeNull();
    expect(c1.emailVerifiedAt).toBeNull();
    expect(c1.erasedAt).toEqual(plan.now);
    expect(c1.erasedByUserId).toBe("admin1");
    expect(c1.eraseReason).toBe("KVKK talebi");
    // Cross-store müşteri dokunulmaz.
    expect(ctx.customer.find((r) => r.id === "cx")?.status).toBe("ACTIVE");
  });

  it("deleted sayaçları doğru", async () => {
    const { db } = makeDb(seed());
    const data = createCustomerErasureData(db as never);
    const res = await data.applyErasure("s1", "c1", plan);
    if (res.kind !== "ERASED") throw new Error("beklenen ERASED");
    expect(res.deleted.sessions).toBe(2);
    expect(res.deleted.recentlyViewed).toBe(1);
    expect(res.deleted.recommendationEvents).toBe(1);
    expect(res.deleted.reviewHelpfulVotes).toBe(1);
    expect(res.deleted.coupons).toBe(1);
    expect(res.deleted.lists).toBe(1);
    expect(res.deleted.listItems).toBe(1);
    expect(res.deleted.ibans).toBe(1);
    expect(res.deleted.credentials).toBe(1);
    expect(res.anonymized).toEqual({ orders: 1, orderAddresses: 1, campaignRedemptions: 1 });
  });

  it("idempotent: ERASED müşteride ikinci apply → ALREADY_ERASED (tekrar silmez)", async () => {
    const { db, ctx } = makeDb(seed());
    ctx.customer[0].status = "ERASED";
    ctx.customer[0].erasedAt = plan.now;
    const data = createCustomerErasureData(db as never);
    const res = await data.applyErasure("s1", "c1", plan);
    expect(res.kind).toBe("ALREADY_ERASED");
    // Guest/başka müşteri kayıtları hâlâ yerinde (yeni silme yapılmadı).
    expect(ctx.recentlyViewedProduct).toHaveLength(3);
  });

  it("cross-store: s2/c1 apply, s1 kayıtları korunur (NOT_FOUND değil ama scope dışı)", async () => {
    const { db, ctx } = makeDb(seed());
    const data = createCustomerErasureData(db as never);
    // s2'de customerId 'c1' diye bir müşteri YOK (cx var) → NOT_FOUND beklenir.
    const res = await data.applyErasure("s2", "c1", plan);
    expect(res.kind).toBe("NOT_FOUND");
    // s1 hedef kayıtları hiç etkilenmedi.
    expect(ctx.customerSession).toHaveLength(4);
  });
});

describe("erasure data: preview (YAZMA YOK) + deactivate", () => {
  it("preview doğru sayar (aktif oturum, silinecek, anonim, koru, review, relation)", async () => {
    const { db, ctx } = makeDb(seed());
    const before = JSON.stringify(ctx);
    const data = createCustomerErasureData(db as never);
    const p = await data.preview("s1", "c1");
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p.status).toBe("ACTIVE");
    expect(p.activeSessionCount).toBe(1); // sess1 (sess2 süresi geçmiş)
    expect(p.deleteCounts.sessions).toBe(2);
    expect(p.deleteCounts.recentlyViewed).toBe(1);
    expect(p.deleteCounts.recommendationEvents).toBe(1);
    expect(p.deleteCounts.listItems).toBe(1); // relation: list.customerId
    expect(p.anonymizeCounts.orderAddresses).toBe(1); // relation: order.customerId
    expect(p.preserveCounts.orderLines).toBe(1);
    expect(p.preserveCounts.payments).toBe(1);
    expect(p.reviewAnonymizeCount).toBe(1);
    expect(p.openOrderCount).toBe(0); // o1 FULFILLED (açık değil)
    // preview HİÇBİR yazma yapmadı:
    expect(JSON.stringify(ctx)).toBe(before);
  });

  it("deactivate: PASSIVE + aktif oturumları revoke; ERASED müşteri reddedilir", async () => {
    const { db, ctx } = makeDb(seed());
    const data = createCustomerErasureData(db as never);
    const res = await data.deactivate("s1", "c1");
    expect(res).toEqual({ kind: "DEACTIVATED", revokedCount: 2 });
    expect(ctx.customer.find((r) => r.id === "c1")?.status).toBe("PASSIVE");
    expect(ctx.customerSession.filter((r) => r.customerId === "c1" && r.storeId === "s1" && r.revokedAt === null)).toHaveLength(0);

    // ERASED müşteri pasifleştirilemez.
    ctx.customer[0].status = "ERASED";
    expect((await data.deactivate("s1", "c1")).kind).toBe("ALREADY_ERASED");
  });
});
