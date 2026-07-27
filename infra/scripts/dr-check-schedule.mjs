/**
 * PB-2/PB-3 — Worker DR smoke yardımcısı: BullMQ backup Job Scheduler kaydını sayar.
 * Zamanlama Redis'te (worker'da); api-gateway restart bunu ETKİLEMEZ. Kullanım: REDIS_URL=... node ...
 */
import { backupQueue, closeQueueConnections } from "../../packages/queues/dist/index.js";

const queue = backupQueue(process.env.REDIS_URL);
const schedulers = await queue.getJobSchedulers();
console.log(schedulers.length);
await closeQueueConnections();
process.exit(0);
