import { loadConfig } from "@commerce-os/config";
import { disconnectPrisma } from "@commerce-os/db";
import { createLogger } from "@commerce-os/logger";
import { closeQueueConnections } from "@commerce-os/queues";
import { createServer } from "./server.js";
import { startShipmentSyncWorker } from "./shipping/sync-worker.js";
import { startBarcodeRetryWorker } from "./shipping/barcode-retry-worker.js";
import { startCampaignReconcileWorker } from "./campaigns/reconcile-worker.js";

const config = loadConfig();
const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);
const app = createServer(config);
// TODO-129 — zamanlanmis shipment sync dongusu (SHIPMENT_SYNC_ENABLED=false ise no-op).
// createServer'a DEGIL surec girisine baglidir: testler createServer'i worker'siz kurar.
const shipmentSyncWorker = startShipmentSyncWorker({ config, logger });
// TODO-123 — zamanlanmis barkod retry/backoff dongusu (BARCODE_RETRY_ENABLED=false ise no-op).
const barcodeRetryWorker = startBarcodeRetryWorker({ config, logger });
// TODO-155.2 — zamanlanmis kampanya rozeti reconciliation dongusu (CAMPAIGN_RECONCILE_ENABLED=false ise no-op).
const campaignReconcileWorker = startCampaignReconcileWorker({ config, logger });

const shutdown = async (signal: string) => {
  logger.info("api gateway shutting down", { signal });
  await shipmentSyncWorker.stop();
  await barcodeRetryWorker.stop();
  await campaignReconcileWorker.stop();
  await app.close();
  await closeQueueConnections();
  await disconnectPrisma();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: "0.0.0.0", port: config.API_GATEWAY_PORT });
logger.info("api gateway started", { port: config.API_GATEWAY_PORT });
