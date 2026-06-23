import { loadConfig } from "@commerce-os/config";
import { disconnectPrisma } from "@commerce-os/db";
import { createLogger } from "@commerce-os/logger";
import { closeQueueConnections } from "@commerce-os/queues";
import { createServer } from "./server.js";

const config = loadConfig();
const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);
const app = createServer(config);

const shutdown = async (signal: string) => {
  logger.info("api gateway shutting down", { signal });
  await app.close();
  await closeQueueConnections();
  await disconnectPrisma();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: "0.0.0.0", port: config.API_GATEWAY_PORT });
logger.info("api gateway started", { port: config.API_GATEWAY_PORT });
