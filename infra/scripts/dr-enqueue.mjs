/**
 * PB-2/PB-3 — Worker DR smoke yardımcısı: manuel backup job'unu BullMQ kuyruğuna koyar (worker işler).
 * Kullanım:  REDIS_URL=... node infra/scripts/dr-enqueue.mjs [--dry]
 */
// infra/scripts paket-dışı → dist'i doğrudan yol ile import et (bullmq/ioredis dep'leri queues node_modules'tan çözülür).
import { enqueueBackupJob, closeQueueConnections } from "../../packages/queues/dist/index.js";

const dryRun = process.argv.includes("--dry");
const id = await enqueueBackupJob(process.env.REDIS_URL, { trigger: "MANUAL", dryRun });
console.log(id);
await closeQueueConnections();
process.exit(0);
