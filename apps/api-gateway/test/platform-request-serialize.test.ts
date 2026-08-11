import { describe, it, expect } from "vitest";
import {
  projectStoreMessages,
  projectStoreListItem,
  projectStoreRequestDetail,
  projectStoreTimeline,
  projectStoreAttachments,
  projectPlatformAttachments,
  projectPlatformMessages,
  projectPlatformRequestDetail,
  type StoreListRow,
  type StoreRequestDetailRow,
  type PlatformRequestDetailRow,
} from "../src/platform-requests/serialize";

const NOW = new Date("2026-08-11T12:00:00.000Z");

// CURRENT category (relation) — differs from the filed snapshot to prove TD-178-4.
const CURRENT_CATEGORY = { key: "PLATFORM_POLICY", labelTr: "Platform Politikası", labelEn: "Platform Policy" };

const storeVisible = {
  id: "m1",
  authorType: "PLATFORM" as const,
  visibility: "STORE_VISIBLE" as const,
  body: "public reply",
  createdAt: new Date("2026-08-11T09:00:00.000Z"),
};
const internal = {
  id: "m2",
  authorType: "PLATFORM" as const,
  visibility: "INTERNAL" as const,
  body: "SECRET internal note with storageKey stores/x/platform-requests/y.webp",
  createdAt: new Date("2026-08-11T10:00:00.000Z"),
};

describe("TODO-178 store serializer — INTERNAL never leaks (HARD SECURITY INVARIANT)", () => {
  it("drops INTERNAL messages and never exposes a visibility field", () => {
    const out = projectStoreMessages([storeVisible, internal]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("m1");
    expect(out.some((m) => "visibility" in m)).toBe(false);
    expect(JSON.stringify(out)).not.toContain("SECRET");
    expect(JSON.stringify(out)).not.toContain("storageKey");
  });

  it("store detail contains no internal content even when internal messages exist", () => {
    const row = baseRow({ status: "IN_PROGRESS", messages: [storeVisible, internal] });
    const dto = projectStoreRequestDetail(row, null, [], [], NOW);
    expect(dto.messages).toHaveLength(1);
    expect(JSON.stringify(dto)).not.toContain("SECRET");
    expect(JSON.stringify(dto)).not.toContain("INTERNAL");
  });

  it("store detail shows the CURRENT category (relation), not the filed snapshot (TD-178-4)", () => {
    const row = baseRow({
      status: "OPEN",
      categoryKey: "CANCELLATION_TAXONOMY", // filed snapshot
      categoryLabel: "İptal Nedeni Taksonomisi",
      categoryLabelEn: "Cancellation Reason Taxonomy",
      category: CURRENT_CATEGORY, // recategorized to PLATFORM_POLICY
    });
    const dto = projectStoreRequestDetail(row, null, [], [], NOW);
    expect(dto.category).toEqual(CURRENT_CATEGORY);
    // store DTO must not surface the raw filed snapshot as its category
    expect((dto as Record<string, unknown>).categoryKey).toBeUndefined();
  });

  it("computes store action affordances from the lifecycle", () => {
    expect(projectStoreRequestDetail(baseRow({ status: "OPEN" }), null, [], [], NOW).canWithdraw).toBe(true);
    expect(projectStoreRequestDetail(baseRow({ status: "IN_PROGRESS" }), null, [], [], NOW).canWithdraw).toBe(false);
    const resolved = projectStoreRequestDetail(
      baseRow({ status: "RESOLVED", resolvedAt: new Date(NOW.getTime() - 3600_000) }),
      null,
      [],
      [],
      NOW,
    );
    expect(resolved.canConfirmClose).toBe(true);
    expect(resolved.canReopen).toBe(true);
  });

  // TODO-178 (Faz D) — assignee yalnız insan-okunur ad; raw PlatformUser id ASLA store DTO'suna girmez.
  it("store detail exposes assignee name (human-readable) and never a raw id", () => {
    const assigned = projectStoreRequestDetail(
      baseRow({ status: "IN_PROGRESS", assigneePlatformUserId: "pu-secret-id" }),
      "Ada Admin",
      [],
      [],
      NOW,
    );
    expect(assigned.assigneeName).toBe("Ada Admin");
    // raw id / assigneePlatformUserId must not appear anywhere in the store DTO
    expect(JSON.stringify(assigned)).not.toContain("pu-secret-id");
    expect((assigned as Record<string, unknown>).assigneePlatformUserId).toBeUndefined();
  });

  it("store detail assignee name is null when unassigned or deleted (safe fallback)", () => {
    const dto = projectStoreRequestDetail(baseRow({ status: "OPEN" }), null, [], [], NOW);
    expect(dto.assigneeName).toBeNull();
  });
});

// TODO-178 (Faz D) — store LIST item: assignee name + sadeleştirilmiş SLA; INTERNAL/raw-id sızmaz.
describe("TODO-178 store list serializer (Faz D)", () => {
  it("exposes requestNumber, current category, assignee name and a simplified SLA", () => {
    const dto = projectStoreListItem(
      storeListRow({
        assigneeName: "Ada Admin",
        slaSnapshots: [
          {
            cycle: 1,
            firstResponseDueAt: new Date(NOW.getTime() + 2 * 86_400_000), // 2 gün sonra → INSIDE
            firstResponseMetAt: null,
            resolutionDueAt: new Date(NOW.getTime() + 3 * 86_400_000),
            resolvedAt: null,
          } as unknown as StoreListRow["slaSnapshots"][number],
        ],
      }),
      NOW,
    );
    expect(dto.requestNumber).toBe("PR-000001");
    expect(dto.category).toEqual(CURRENT_CATEGORY);
    expect(dto.assigneeName).toBe("Ada Admin");
    expect(dto.sla).toEqual({ firstResponseState: "INSIDE", resolutionState: "INSIDE" });
    // sadeleştirilmiş: dueAt / policy alanları YOK
    expect((dto.sla as Record<string, unknown>).firstResponseDueAt).toBeUndefined();
  });

  it("SLA is null when no snapshot exists; assignee name null when unassigned", () => {
    const dto = projectStoreListItem(storeListRow({ assigneeName: null, slaSnapshots: [] }), NOW);
    expect(dto.sla).toBeNull();
    expect(dto.assigneeName).toBeNull();
  });

  it("never surfaces a raw assignee id in the list item", () => {
    const dto = projectStoreListItem(storeListRow({ assigneeName: "Ada Admin" }), NOW);
    expect((dto as Record<string, unknown>).assigneePlatformUserId).toBeUndefined();
  });
});

// TODO-178 (Faz D follow-up) — Store audit timeline: AYRI allowlist projeksiyonu.
describe("TODO-178 store timeline serializer — güvenli audit projection (HARD SECURITY)", () => {
  const ASSIGNEES = new Map([["pu9", "Ada Admin"]]);
  const CATEGORIES = new Map([
    ["cat2", { key: "PLATFORM_CONTENT", labelTr: "Platform İçeriği", labelEn: "Platform Content" }],
  ]);
  function h(overrides: Record<string, unknown> = {}) {
    return {
      id: "h1",
      eventType: "REQUEST_OPENED",
      fromStatus: null,
      toStatus: "OPEN",
      actorType: "STORE",
      metadata: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      ...overrides,
    };
  }
  // projectStoreTimeline yalnız Pick alanlarını okur; test satırları ekstra note/actorId de taşır (leak kontrolü).
  const project = (rows: Record<string, unknown>[]) =>
    projectStoreTimeline(rows as never, ASSIGNEES, CATEGORIES);

  it("mesaj / INTERNAL not event'lerini timeline'a HİÇ koymaz (existence leak imkânsız)", () => {
    const tl = project([
      h({ id: "h1", eventType: "REQUEST_OPENED" }),
      h({ id: "h2", eventType: "REQUEST_INTERNAL_NOTE", metadata: { foo: "SECRET" }, note: "gizli iç not" }),
      h({ id: "h3", eventType: "REQUEST_PLATFORM_REPLY", note: "iç yanıt" }),
      h({ id: "h4", eventType: "REQUEST_STORE_REPLY" }),
      h({ id: "h5", eventType: "SOME_FUTURE_EVENT" }),
    ]);
    expect(tl.map((e) => e.event)).toEqual(["CREATED"]);
    const s = JSON.stringify(tl);
    expect(s).not.toContain("SECRET");
    expect(s).not.toContain("gizli iç not");
    expect(s).not.toContain("iç yanıt");
  });

  it("ham metadata / note / actorId çıktıya ASLA girmez", () => {
    const tl = project([
      h({
        eventType: "REQUEST_PRIORITY_CHANGED",
        metadata: { from: "NORMAL", to: "HIGH", secretKey: "LEAK" },
        note: "internal note",
        actorId: "actor-uuid-xyz",
      }),
    ]);
    expect(tl[0]).toMatchObject({ event: "PRIORITY_CHANGED", fromPriority: "NORMAL", toPriority: "HIGH" });
    const s = JSON.stringify(tl);
    expect(s).not.toContain("LEAK");
    expect(s).not.toContain("actor-uuid-xyz");
    expect(s).not.toContain("internal note");
    expect((tl[0] as Record<string, unknown>).metadata).toBeUndefined();
    expect((tl[0] as Record<string, unknown>).note).toBeUndefined();
    expect((tl[0] as Record<string, unknown>).actorId).toBeUndefined();
  });

  it("ASSIGNED → resolve edilmiş ad (raw id yok); ghost → null; assignee yok → UNASSIGNED", () => {
    const tl = project([
      h({ id: "a1", eventType: "REQUEST_ASSIGNED", metadata: { assigneePlatformUserId: "pu9" } }),
      h({ id: "a2", eventType: "REQUEST_ASSIGNED", metadata: { assigneePlatformUserId: "pu-ghost" } }),
      h({ id: "a3", eventType: "REQUEST_ASSIGNED", metadata: {} }),
    ]);
    expect(tl[0]).toMatchObject({ event: "ASSIGNED", assigneeName: "Ada Admin" });
    expect(tl[1]).toMatchObject({ event: "ASSIGNED", assigneeName: null });
    expect(tl[2]).toMatchObject({ event: "UNASSIGNED", assigneeName: null });
    const s = JSON.stringify(tl);
    expect(s).not.toContain("pu9");
    expect(s).not.toContain("pu-ghost");
  });

  it("CATEGORY_CHANGED → yeni kategori bilingual (raw category id yok)", () => {
    const tl = project([
      h({ eventType: "REQUEST_RECATEGORIZED", metadata: { fromCategoryId: "cat1", toCategoryId: "cat2" } }),
    ]);
    expect(tl[0]).toMatchObject({ event: "CATEGORY_CHANGED", category: { key: "PLATFORM_CONTENT" } });
    const s = JSON.stringify(tl);
    expect(s).not.toContain("cat1");
    expect(s).not.toContain('"cat2"');
  });

  it("REQUEST_CLOSED closeReason'a göre WITHDRAWN / CLOSED ayrımı yapar", () => {
    const w = project([
      h({ eventType: "REQUEST_CLOSED", fromStatus: "OPEN", toStatus: "CLOSED", metadata: { closeReason: "WITHDRAWN_BY_STORE" } }),
    ]);
    expect(w[0]).toMatchObject({ event: "WITHDRAWN", closeReason: "WITHDRAWN_BY_STORE" });
    const c = project([h({ eventType: "REQUEST_CLOSED", metadata: { closeReason: "COMPLETED" } })]);
    expect(c[0]).toMatchObject({ event: "CLOSED", closeReason: "COMPLETED" });
  });

  it("status / resolve / reopen event'lerini kronolojik normalize eder", () => {
    const tl = project([
      h({ id: "s3", eventType: "REQUEST_REOPENED", fromStatus: "RESOLVED", toStatus: "IN_PROGRESS", createdAt: new Date("2026-08-03T00:00:00.000Z") }),
      h({ id: "s1", eventType: "REQUEST_STATUS_TRIAGED", fromStatus: "OPEN", toStatus: "TRIAGED", createdAt: new Date("2026-08-01T00:00:00.000Z") }),
      h({ id: "s2", eventType: "REQUEST_RESOLVED", fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", createdAt: new Date("2026-08-02T00:00:00.000Z") }),
    ]);
    expect(tl.map((e) => e.event)).toEqual(["STATUS_CHANGED", "RESOLVED", "REOPENED"]);
    expect(tl[0]).toMatchObject({ fromStatus: "OPEN", toStatus: "TRIAGED" });
  });
});

// TODO-178 (Faz E) — Attachment projeksiyonu: store STORE_VISIBLE-only; platform full; ham leak yok.
describe("TODO-178 attachment serializer (Faz E)", () => {
  const at = new Date("2026-08-05T00:00:00.000Z");
  const att = (o: Record<string, unknown> = {}) => ({
    id: "a1",
    type: "PHOTO",
    visibility: "STORE_VISIBLE",
    createdAt: at,
    mediaAssetId: "SECRET-MEDIA-ID",
    ...o,
  });

  it("store attachments YALNIZ STORE_VISIBLE; INTERNAL yapısal olarak dışarıda (id/count/preview yok)", () => {
    const out = projectStoreAttachments([
      att({ id: "a1", visibility: "STORE_VISIBLE" }),
      att({ id: "a2-internal", visibility: "INTERNAL", type: "PDF" }),
    ] as never);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a1");
    // Store DTO'da visibility alanı YOK + INTERNAL ek id'si bile sızmaz.
    expect(out.some((a) => "visibility" in a)).toBe(false);
    expect(JSON.stringify(out)).not.toContain("a2-internal");
  });

  it("store attachment type PHOTO/PDF'e daraltılır; ham storageKey/mediaAssetId ASLA çıkmaz", () => {
    const out = projectStoreAttachments([att({ type: "PDF" }), att({ id: "a3", type: "WEIRD" })] as never);
    expect(out[0].type).toBe("PDF");
    expect(out[1].type).toBe("PHOTO"); // bilinmeyen tip → PHOTO
    expect(JSON.stringify(out)).not.toContain("SECRET-MEDIA-ID");
    expect((out[0] as Record<string, unknown>).mediaAssetId).toBeUndefined();
  });

  it("platform attachments STORE_VISIBLE + INTERNAL (visibility ile) döner", () => {
    const out = projectPlatformAttachments([
      att({ id: "a1", visibility: "STORE_VISIBLE" }),
      att({ id: "a2", visibility: "INTERNAL" }),
    ] as never);
    expect(out).toHaveLength(2);
    expect(out.find((a) => a.id === "a2")?.visibility).toBe("INTERNAL");
    expect(JSON.stringify(out)).not.toContain("SECRET-MEDIA-ID");
  });
});

describe("TODO-178 platform serializer — full surface + current/filed category (TD-178-4/5)", () => {
  it("returns INTERNAL messages with their visibility for platform admins", () => {
    const out = projectPlatformMessages([storeVisible, internal]);
    expect(out).toHaveLength(2);
    expect(out.find((m) => m.id === "m2")?.visibility).toBe("INTERNAL");
  });

  it("exposes CURRENT bilingual category for operations and the FILED snapshot for audit", () => {
    const row = platformRow({
      status: "IN_PROGRESS",
      categoryKey: "CANCELLATION_TAXONOMY",
      categoryLabel: "İptal Nedeni Taksonomisi",
      categoryLabelEn: "Cancellation Reason Taxonomy",
      category: CURRENT_CATEGORY,
      messages: [storeVisible, internal],
    });
    const dto = projectPlatformRequestDetail(row, "Ada Admin", "Demo Store", [], NOW);
    expect(dto.category).toEqual(CURRENT_CATEGORY); // operational = current
    expect(dto.filedCategory).toEqual({
      key: "CANCELLATION_TAXONOMY",
      labelTr: "İptal Nedeni Taksonomisi",
      labelEn: "Cancellation Reason Taxonomy",
    });
    expect(dto.assigneeName).toBe("Ada Admin");
    expect(dto.storeName).toBe("Demo Store");
    expect(dto.version).toBe(3);
    expect(dto.messages).toHaveLength(2);
  });
});

function baseRow(overrides: Partial<StoreRequestDetailRow> = {}): StoreRequestDetailRow {
  return {
    id: "req1",
    storeId: "st1",
    requestNumber: "PR-000001",
    categoryId: "cat1",
    categoryKey: "PLATFORM_POLICY",
    categoryLabel: "Platform Politikası",
    categoryLabelEn: "Platform Policy",
    subject: "Konu",
    description: "Açıklama",
    status: "OPEN",
    priority: "NORMAL",
    storeImpact: null,
    contextKind: "NONE",
    contextSnapshot: null,
    createdByActorKind: "PLATFORM_USER",
    createdByActorId: "pu1",
    createdByName: "Store Owner",
    createdByEmail: "owner@ex.test",
    assigneePlatformUserId: null,
    reopenCount: 0,
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    closeReason: null,
    lastActivityAt: NOW,
    version: 0,
    createdAt: NOW,
    updatedAt: NOW,
    category: { key: "PLATFORM_POLICY", labelTr: "Platform Politikası", labelEn: "Platform Policy" },
    messages: [],
    slaSnapshots: [],
    ...overrides,
  };
}

// store list item satırı — projectStoreListItem yalnız Pick alt kümesi + category/sla/assigneeName okur.
function storeListRow(overrides: Partial<StoreListRow> = {}): StoreListRow {
  return {
    id: "req1",
    requestNumber: "PR-000001",
    subject: "Konu",
    status: "IN_PROGRESS",
    priority: "NORMAL",
    storeImpact: null,
    createdAt: NOW,
    lastActivityAt: NOW,
    category: CURRENT_CATEGORY,
    slaSnapshots: [],
    assigneeName: null,
    ...overrides,
  };
}

function platformRow(overrides: Partial<PlatformRequestDetailRow> = {}): PlatformRequestDetailRow {
  return {
    ...baseRow(),
    version: 3,
    assigneePlatformUserId: "pu9",
    timeline: [],
    ...overrides,
  } as PlatformRequestDetailRow;
}
