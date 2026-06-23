import { describe, expect, it } from "vitest";
import { PLATFORM_EVENTS_QUEUE, platformEventsQueue } from "../src/index.js";

describe("queue helpers", () => {
  it("creates the platform events queue", async () => {
    const queue = platformEventsQueue("redis://localhost:6379");
    expect(queue.name).toBe(PLATFORM_EVENTS_QUEUE);
    await queue.close();
  });
});
