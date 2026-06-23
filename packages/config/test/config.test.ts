import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/index.js";

const validEnv = {
  APP_ENV: "test",
  SERVICE_NAME: "test-service",
  LOG_LEVEL: "debug",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  API_GATEWAY_PORT: "4000",
  WORKER_CONCURRENCY: "3",
};

describe("loadConfig", () => {
  it("parses supported env values", () => {
    expect(loadConfig(validEnv).API_GATEWAY_PORT).toBe(4000);
    expect(loadConfig(validEnv).WORKER_CONCURRENCY).toBe(3);
  });

  it("rejects short internal tokens", () => {
    expect(() => loadConfig({ ...validEnv, INTERNAL_API_TOKEN: "short" })).toThrow();
  });
});
