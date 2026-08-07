import { loadConfig } from "@commerce-os/config";
import { disconnectPrisma, prisma } from "@commerce-os/db";
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
import { startDiscoveryEventRetentionWorker } from "./home/discovery-event-retention-worker.js";
import { startCartExpiryWorker } from "./cart/expiry-worker.js";
import { startCreditExpiryWorker } from "./customer-credit/expiry-worker.js";
import { disconnectDefaultAdvisoryLockManager } from "./commercial-automation/advisory-lock.js";
import { createWorkerCapabilityGate } from "./capabilities/worker-gate.js";

const config = loadConfig();
const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);
const app = createServer(config);
// TODO-163 Faz 3 (TD-153) — OPSİYONEL, store-scope'lu worker'lar için TEK paylaşılan capability gate
// (store-scoped, bounded TTL cache, fail-closed, tenant-safe). CORE worker'lara (shipment sync / barkod
// retry / apps/worker inventory·backup) ENJEKTE EDİLMEZ → çekirdek asla capability ile kapanmaz.
const capabilityGate = createWorkerCapabilityGate(prisma, { logger });
// TODO-129 — zamanlanmis shipment sync dongusu (SHIPMENT_SYNC_ENABLED=false ise no-op). CORE (SHIPPING) → gate YOK.
// createServer'a DEGIL surec girisine baglidir: testler createServer'i worker'siz kurar.
const shipmentSyncWorker = startShipmentSyncWorker({ config, logger });
// TODO-123 — zamanlanmis barkod retry/backoff dongusu (BARCODE_RETRY_ENABLED=false ise no-op). CORE (SHIPPING) → gate YOK.
const barcodeRetryWorker = startBarcodeRetryWorker({ config, logger });
// TODO-155.2 — zamanlanmis kampanya rozeti reconciliation dongusu (CAMPAIGN_RECONCILE_ENABLED=false ise no-op).
const campaignReconcileWorker = startCampaignReconcileWorker({ config, logger, capabilityGate });
// TODO-161A.1 (TD-125) — zamanlanmis settlement scheduler (SETTLEMENT_SCHEDULER_ENABLED=false ise no-op).
const settlementSchedulerWorker = startSettlementSchedulerWorker({ config, logger, capabilityGate });
// TODO-161A.1 (TD-121+TD-113) — zamanlanmis attribution retention purge (ATTRIBUTION_RETENTION_ENABLED=false ise no-op).
const retentionWorker = startRetentionWorker({ config, logger, capabilityGate });
// TODO-161B (ADR-139) — zamanlanmis Recently Viewed retention (RECENTLY_VIEWED_RETENTION_ENABLED=false ise no-op).
const recentlyViewedRetentionWorker = startRecentlyViewedRetentionWorker({ config, logger, capabilityGate });
// TD-130 (ADR-148) — zamanlanmis Recommendation event retention (RECOMMENDATION_EVENT_RETENTION_ENABLED=false ise no-op).
const recommendationEventRetentionWorker = startRecommendationEventRetentionWorker({ config, logger, capabilityGate });
// TODO-162 (ADR-205) — zamanlanmis Home Discovery event retention (HOME_DISCOVERY_EVENT_RETENTION_ENABLED=false ise no-op).
const discoveryEventRetentionWorker = startDiscoveryEventRetentionWorker({ config, logger, capabilityGate });
// TODO-167 (ADR-266) — zamanlanmis Persistent Cart expiry sweep (CART_EXPIRY_SWEEP_ENABLED=false ise no-op).
const cartExpiryWorker = startCartExpiryWorker({ config, logger });
// TODO-174B (ADR-284) — zamanlanmis Store Credit lot expiry sweep (CREDIT_EXPIRY_SWEEP_ENABLED=false ise
// no-op). available bakiye zaten expiresAt>now ile doğru; worker yalnız EXPIRED materialize + EXPIRE entry.
const creditExpiryWorker = startCreditExpiryWorker({ config, logger });
// H-3 pre-ship — rezervasyon süre-aşımı süpürücü api-gateway'den KALDIRILDI → apps/worker (BullMQ Job
// Scheduler). api-gateway yalnız manuel expiry/reconcile enqueue + status/reconcile-scan sunar.
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
  await discoveryEventRetentionWorker.stop();
  await cartExpiryWorker.stop();
  await creditExpiryWorker.stop();
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
