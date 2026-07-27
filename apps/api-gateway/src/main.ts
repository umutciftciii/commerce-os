import { loadConfig } from "@commerce-os/config";
import { disconnectPrisma } from "@commerce-os/db";
import { createLogger } from "@commerce-os/logger";
import { closeQueueConnections } from "@commerce-os/queues";
import { createServer } from "./server.js";
import { startShipmentSyncWorker } from "./shipping/sync-worker.js";
import { startBarcodeRetryWorker } from "./shipping/barcode-retry-worker.js";
import { startCampaignReconcileWorker } from "./campaigns/reconcile-worker.js";
import { startSettlementSchedulerWorker } from "./commercial-automation/settlement-scheduler-worker.js";
import { startRetentionWorker } from "./commercial-automation/retention-worker.js";
import { startRecentlyViewedRetentionWorker } from "./recently-viewed/retention-worker.js";
import { startRecommendationEventRetentionWorker } from "./recommendation-events/retention-worker.js";
import { disconnectDefaultAdvisoryLockManager } from "./commercial-automation/advisory-lock.js";

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
// TODO-161A.1 (TD-125) — zamanlanmis settlement scheduler (SETTLEMENT_SCHEDULER_ENABLED=false ise no-op).
const settlementSchedulerWorker = startSettlementSchedulerWorker({ config, logger });
// TODO-161A.1 (TD-121+TD-113) — zamanlanmis attribution retention purge (ATTRIBUTION_RETENTION_ENABLED=false ise no-op).
const retentionWorker = startRetentionWorker({ config, logger });
// TODO-161B (ADR-139) — zamanlanmis Recently Viewed retention (RECENTLY_VIEWED_RETENTION_ENABLED=false ise no-op).
const recentlyViewedRetentionWorker = startRecentlyViewedRetentionWorker({ config, logger });
// TD-130 (ADR-148) — zamanlanmis Recommendation event retention (RECOMMENDATION_EVENT_RETENTION_ENABLED=false ise no-op).
const recommendationEventRetentionWorker = startRecommendationEventRetentionWorker({ config, logger });
// PB-2/PB-3 — DB backup zamanlaması + yürütmesi api-gateway'den KALDIRILDI → apps/worker (BullMQ Job
// Scheduler). API gateway yalnız /internal/backup/{health,status,run} sunar; run yalnız worker'a enqueue eder.

const shutdown = async (signal: string) => {
  logger.info("api gateway shutting down", { signal });
  await shipmentSyncWorker.stop();
  await barcodeRetryWorker.stop();
  await campaignReconcileWorker.stop();
  await settlementSchedulerWorker.stop();
  await retentionWorker.stop();
  await recentlyViewedRetentionWorker.stop();
  await recommendationEventRetentionWorker.stop();
  await disconnectDefaultAdvisoryLockManager();
  await app.close();
  await closeQueueConnections();
  await disconnectPrisma();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: "0.0.0.0", port: config.API_GATEWAY_PORT });
logger.info("api gateway started", { port: config.API_GATEWAY_PORT });
