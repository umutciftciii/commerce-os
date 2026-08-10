import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TODO-177 (ADR-289) Faz D — Vitrin Ürün Desteği Server Action'ları sunucu-otoriter.
 *
 * Guided akış (resolve → create → message → reopen) ve attachment upload GATEWAY'de
 * doğrulanır (orderLineId + storeId + customerId re-validate; question graph; SLA;
 * reopen penceresi). Bu test, aksiyonların yalnız istek ilettiğini ve gateway sentinel
 * kodlarını (ORDER_LINE_NOT_FOUND, TICKET_CLOSED, REOPEN_WINDOW_EXPIRED, VERSION_CONFLICT)
 * sadık şekilde serileştirilebilir state'e taşıdığını doğrular. `fetch` + oturum jetonu
 * + `next/cache` sahtelenir.
 */

const calls: Array<{ url: string; init?: RequestInit }> = [];
let nextResponses: Array<{ ok: boolean; status: number; body: unknown }> = [];

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  const next = nextResponses.shift() ?? { ok: true, status: 200, body: {} };
  return {
    ok: next.ok,
    status: next.status,
    json: async () => next.body,
  } as unknown as Response;
});
vi.stubGlobal("fetch", fetchMock);

vi.mock("../lib/server/customer-cookie", () => ({
  readCustomerToken: vi.fn(async () => "session-token"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createSupportTicketAction,
  reopenSupportTicketAction,
  resolveSupportAction,
  sendSupportMessageAction,
  uploadSupportAttachmentAction,
} from "../lib/server/support-actions";

const CONTEXT = {
  orderNumber: "OS-1",
  orderLineId: "ol-1",
  productTitle: "Kablosuz Kulaklık",
  variantTitle: null,
  topic: "PRODUCT_NOT_WORKING",
};
const WARRANTY = { warrantyEndsAt: null, anchorSource: "NONE", inWarranty: null };
const GRAPH = {
  questionSetId: "qs-1",
  questionSetVersionId: "qsv-1",
  version: 1,
  entryQuestionKey: "q_entry",
  questions: [],
  transitions: [],
};

function detailBody(overrides: Record<string, unknown> = {}) {
  return {
    ticket: {
      ticketNumber: "S000001",
      status: "OPEN",
      topic: "PRODUCT_NOT_WORKING",
      productTitle: "Kablosuz Kulaklık",
      variantTitle: null,
      orderNumber: "OS-1",
      createdAt: "2026-08-10T00:00:00.000Z",
      lastActivityAt: "2026-08-10T00:00:00.000Z",
      resolvedAt: null,
      reopenCount: 0,
      canReopen: false,
      warranty: WARRANTY,
      suggestedResolutionText: null,
      answers: [],
      messages: [],
      attachments: [],
      sla: {
        cycle: 1,
        firstResponseDueAt: "2026-08-11T00:00:00.000Z",
        resolutionDueAt: "2026-08-13T00:00:00.000Z",
        firstResponseState: "INSIDE",
        resolutionState: "INSIDE",
      },
      ...overrides,
    },
  };
}

beforeEach(() => {
  calls.length = 0;
  nextResponses = [];
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveSupportAction", () => {
  it("başarılı → { status:'ok', data:{graph,context,warranty} } (x-customer-session ile)", async () => {
    nextResponses = [{ ok: true, status: 200, body: { graph: GRAPH, context: CONTEXT, warranty: WARRANTY } }];
    const result = await resolveSupportAction({
      orderNumber: "OS-1",
      orderLineId: "ol-1",
      topic: "PRODUCT_NOT_WORKING",
    });
    expect(result).toEqual({ status: "ok", data: { graph: GRAPH, context: CONTEXT, warranty: WARRANTY } });
    expect(calls[0]?.url).toContain("/support/resolve");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["x-customer-session"]).toBe("session-token");
  });

  it("başka müşterinin/olmayan order-line'ı → 404 ORDER_LINE_NOT_FOUND → error state", async () => {
    nextResponses = [{ ok: false, status: 404, body: { error: { code: "ORDER_LINE_NOT_FOUND" } } }];
    const result = await resolveSupportAction({
      orderNumber: "OS-1",
      orderLineId: "foreign",
      topic: "PRODUCT_NOT_WORKING",
    });
    expect(result).toEqual({ status: "error", code: "ORDER_LINE_NOT_FOUND", httpStatus: 404 });
  });
});

describe("createSupportTicketAction", () => {
  it("başarılı → { status:'success', ticketNumber }", async () => {
    nextResponses = [{ ok: true, status: 201, body: detailBody() }];
    const result = await createSupportTicketAction({
      orderNumber: "OS-1",
      orderLineId: "ol-1",
      topic: "PRODUCT_NOT_WORKING",
      questionSetVersionId: "qsv-1",
      answers: [{ questionKey: "q_entry", value: { optionKeys: ["opt_broken"] } }],
    });
    expect(result).toEqual({ status: "success", ticketNumber: "S000001" });
  });

  it("published olmayan versiyon → 409 VERSION_NOT_PUBLISHED → error state", async () => {
    nextResponses = [{ ok: false, status: 409, body: { error: { code: "VERSION_NOT_PUBLISHED" } } }];
    const result = await createSupportTicketAction({
      orderNumber: "OS-1",
      orderLineId: "ol-1",
      topic: "PRODUCT_NOT_WORKING",
      questionSetVersionId: "qsv-stale",
      answers: [],
    });
    expect(result).toEqual({ status: "error", code: "VERSION_NOT_PUBLISHED", httpStatus: 409 });
  });
});

describe("sendSupportMessageAction", () => {
  it("başarılı → success", async () => {
    nextResponses = [{ ok: true, status: 200, body: detailBody({ status: "WAITING_STORE" }) }];
    const result = await sendSupportMessageAction("S000001", { body: "Hâlâ çalışmıyor" });
    expect(result).toEqual({ status: "success" });
    expect(calls[0]?.url).toContain("/support/tickets/S000001/messages");
  });

  it("kapalı ticket'a mesaj → 409 TICKET_CLOSED → error state", async () => {
    nextResponses = [{ ok: false, status: 409, body: { error: { code: "TICKET_CLOSED" } } }];
    const result = await sendSupportMessageAction("S000001", { body: "merhaba" });
    expect(result).toEqual({ status: "error", code: "TICKET_CLOSED", httpStatus: 409 });
  });
});

describe("reopenSupportTicketAction", () => {
  it("başarılı → success (body göndermez)", async () => {
    nextResponses = [{ ok: true, status: 200, body: detailBody({ status: "OPEN", reopenCount: 1 }) }];
    const result = await reopenSupportTicketAction("S000001");
    expect(result).toEqual({ status: "success" });
    expect(calls[0]?.url).toContain("/support/tickets/S000001/reopen");
    expect(calls[0]?.init?.body).toBeUndefined();
  });

  it("7 gün penceresi geçti → 409 REOPEN_WINDOW_EXPIRED → error state", async () => {
    nextResponses = [{ ok: false, status: 409, body: { error: { code: "REOPEN_WINDOW_EXPIRED" } } }];
    const result = await reopenSupportTicketAction("S000001");
    expect(result).toEqual({ status: "error", code: "REOPEN_WINDOW_EXPIRED", httpStatus: 409 });
  });
});

describe("uploadSupportAttachmentAction", () => {
  it("dosya var → { ok:true, mediaId }", async () => {
    nextResponses = [{ ok: true, status: 201, body: { mediaId: "media-1" } }];
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" }));
    const result = await uploadSupportAttachmentAction(form);
    expect(result).toEqual({ ok: true, mediaId: "media-1" });
    expect(calls[0]?.url).toContain("/support/attachments");
  });

  it("dosya yok → { ok:false } (gateway'e gitmez)", async () => {
    const result = await uploadSupportAttachmentAction(new FormData());
    expect(result).toEqual({ ok: false });
    expect(calls.length).toBe(0);
  });
});
