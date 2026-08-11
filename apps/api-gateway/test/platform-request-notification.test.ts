import { describe, it, expect } from "vitest";
import { createLogPlatformRequestNotificationDispatcher } from "../src/platform-requests/notification";

describe("TODO-178 notification dispatcher — honest UNCONFIGURED (no fake SENT)", () => {
  it("reports not configured and returns UNCONFIGURED (never SENT/DELIVERED)", async () => {
    const dispatcher = createLogPlatformRequestNotificationDispatcher({ info: () => {} });
    expect(dispatcher.isConfigured).toBe(false);
    const result = await dispatcher.sendRequestNotification({
      storeId: "st1",
      requestId: "req1",
      requestNumber: "PR-000001",
      event: "REQUEST_OPENED",
      recipient: "PLATFORM",
    });
    expect(result.delivery).toBe("UNCONFIGURED");
  });

  it("never throws (best-effort; domain tx must not roll back on notification failure)", async () => {
    const dispatcher = createLogPlatformRequestNotificationDispatcher({
      info: () => {
        throw new Error("logger blew up");
      },
    });
    await expect(
      dispatcher.sendRequestNotification({
        storeId: "st1",
        requestId: "req1",
        requestNumber: "PR-000001",
        event: "REQUEST_RESOLVED",
        recipient: "STORE",
      }),
    ).resolves.toEqual({ delivery: "UNCONFIGURED" });
  });
});
