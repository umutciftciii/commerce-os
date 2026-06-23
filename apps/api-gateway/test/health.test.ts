import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

const config = {
  APP_ENV: "test" as const,
  SERVICE_NAME: "api-gateway-test",
  LOG_LEVEL: "error" as const,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  API_GATEWAY_PORT: 3000,
  WORKER_CONCURRENCY: 5,
};

describe("api health", () => {
  it("responds on /health", async () => {
    const app = createServer(config);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "api-gateway-test",
    });
    await app.close();
  });

  it("protects internal health routes", async () => {
    const app = createServer(config);
    const response = await app.inject({ method: "GET", url: "/internal/health/db" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("allows internal DB health with a valid token", async () => {
    const app = createServer(config, { checkDatabaseHealth: async () => true });
    const response = await app.inject({
      method: "GET",
      url: "/internal/health/db",
      headers: { authorization: `Bearer ${config.INTERNAL_API_TOKEN}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("allows internal Redis health with a valid token", async () => {
    const app = createServer(config, { checkRedisHealth: async () => true });
    const response = await app.inject({
      method: "GET",
      url: "/internal/health/redis",
      headers: { authorization: `Bearer ${config.INTERNAL_API_TOKEN}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
