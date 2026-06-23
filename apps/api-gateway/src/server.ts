import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import { healthResponseSchema } from "@commerce-os/contracts";
import { checkDatabaseHealth } from "@commerce-os/db";
import { createLogger } from "@commerce-os/logger";
import { checkRedisHealth } from "@commerce-os/queues";

export interface ServerHealthChecks {
  checkDatabaseHealth?: () => Promise<boolean>;
  checkRedisHealth?: (redisUrl: string) => Promise<boolean>;
}

function requireInternalToken(config: AppConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (token !== config.INTERNAL_API_TOKEN) {
      await reply.code(401).send({ error: "Unauthorized" });
    }
  };
}

export function createServer(
  config: AppConfig,
  healthChecks: ServerHealthChecks = {},
): FastifyInstance {
  const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);
  const dbHealthCheck = healthChecks.checkDatabaseHealth ?? checkDatabaseHealth;
  const redisHealthCheck = healthChecks.checkRedisHealth ?? checkRedisHealth;
  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (request) => {
    logger.info("request received", {
      method: request.method,
      url: request.url,
      requestId: request.id,
    });
  });

  app.get("/health", async () =>
    healthResponseSchema.parse({
      status: "ok",
      service: config.SERVICE_NAME,
      timestamp: new Date().toISOString(),
    }),
  );

  app.get("/version", async () => ({
    name: "commerce-os",
    service: config.SERVICE_NAME,
    version: "0.1.0",
  }));

  app.get(
    "/internal/health/db",
    { preHandler: requireInternalToken(config) },
    async (_request, reply) => {
      const ok = await dbHealthCheck();
      return reply.code(ok ? 200 : 503).send({ status: ok ? "ok" : "degraded" });
    },
  );

  app.get(
    "/internal/health/redis",
    { preHandler: requireInternalToken(config) },
    async (_request, reply) => {
      const ok = await redisHealthCheck(config.REDIS_URL);
      return reply.code(ok ? 200 : 503).send({ status: ok ? "ok" : "degraded" });
    },
  );

  return app;
}
