import { describe, it, expect } from "vitest";
import { createLogSupportNotificationDispatcher } from "../src/product-support/notification";

describe("support notification dispatcher stub (ADR-289 §8; TD-110 honest)", () => {
  const logs: string[] = [];
  const dispatcher = createLogSupportNotificationDispatcher({ info: (m) => logs.push(m) });

  it("reports isConfigured=false when no real provider exists", () => {
    expect(dispatcher.isConfigured).toBe(false);
  });

  it("never fabricates SENT/DELIVERED — returns UNCONFIGURED", async () => {
    const r = await dispatcher.sendTicketNotification({
      storeId: "s1",
      ticketId: "t1",
      ticketNumber: "S000001",
      event: "TICKET_OPENED",
      recipient: "CUSTOMER",
      recipientEmail: "c@example.test",
    });
    expect(r.delivery).toBe("UNCONFIGURED");
    expect(r.delivery).not.toBe("SENT");
  });

  it("does not throw (delivery failure must not roll back the ticket transaction)", async () => {
    await expect(
      dispatcher.sendTicketNotification({
        storeId: "s1",
        ticketId: "t1",
        ticketNumber: "S000002",
        event: "TICKET_REOPENED",
        recipient: "STORE_ADMIN",
      }),
    ).resolves.toEqual({ delivery: "UNCONFIGURED" });
  });
});
