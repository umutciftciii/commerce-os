import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/index.js";

describe("createLogger", () => {
  it("writes structured logs", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    createLogger("unit-test", "debug").info("hello", { requestId: "req_1" });
    expect(spy).toHaveBeenCalledOnce();
    expect(JSON.parse(String(spy.mock.calls[0]?.[0]))).toMatchObject({
      level: "info",
      service: "unit-test",
      message: "hello",
      requestId: "req_1",
    });
    spy.mockRestore();
  });
});
