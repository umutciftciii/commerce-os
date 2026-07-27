/**
 * TODO-161A.1 (ADR-136) — Dağıtık advisory lock.
 *
 * PB-2/PB-3 hardening: implementasyon `@commerce-os/db`'ye TAŞINDI (backup job'u artık `apps/worker`
 * sürecinde de çalışır → hem api-gateway hem worker AYNI kilit + AYNI süreç-tekil singleton'ı paylaşmalı).
 * Bu dosya geriye-uyumluluk için re-export köprüsüdür; mevcut import yolları (settlement/retention worker'ları,
 * server/main) değişmeden çalışır. Davranış birebir korunur.
 */
export {
  createPgAdvisoryLockManager,
  getDefaultAdvisoryLockManager,
  disconnectDefaultAdvisoryLockManager,
  type StoreJobLocker,
  type LockOutcome,
  type AdvisoryLockManager,
} from "@commerce-os/db";
