/**
 * TODO-167 (ADR-266) — Persistent Cart expiry sweep servisi.
 *
 * Global (cross-store) sweep: lastActivityAt < (now - retentionDays) olan ACTIVE cart'lari
 * EXPIRED yapar. Advisory-lock (distributed overlap guard) + idempotent (sweepExpired conditional
 * update). Hard-delete YOK — CONVERTED/MERGED/EXPIRED korunur (retention/anonymization future).
 * SAF orkestrasyon (Prisma/scheduler yok) — dogrudan test edilir.
 */
import type { StoreJobLocker } from "@commerce-os/db";
import type { CartData } from "./data.js";

/** Global sweep advisory-lock job adi + sentinel store scope'u. */
export const CART_EXPIRY_JOB = "CART_EXPIRY_SWEEP";
const GLOBAL_SCOPE = "__global__";
const DAY_MS = 86_400_000;

export interface CartExpirySweepSummary {
  apply: boolean;
  acquired: boolean;
  expired: number;
  cutoff: string;
}

export interface CartExpirySweepDeps {
  data: Pick<CartData, "sweepExpired">;
  lock: StoreJobLocker;
  now: () => Date;
  retentionDays: number;
  batchLimit: number;
  logger: { info: (m: string, meta?: Record<string, unknown>) => void };
}

export function createCartExpirySweepService(deps: CartExpirySweepDeps) {
  return {
    async runOnce({ apply }: { apply: boolean }): Promise<CartExpirySweepSummary> {
      const cutoff = new Date(deps.now().getTime() - deps.retentionDays * DAY_MS);
      if (!apply) {
        return { apply: false, acquired: true, expired: 0, cutoff: cutoff.toISOString() };
      }
      // Advisory-lock: cok-instance overlap guard (sweep zaten idempotent; lock ekstra kat).
      const outcome = await deps.lock(CART_EXPIRY_JOB, GLOBAL_SCOPE, async () =>
        deps.data.sweepExpired({ olderThan: cutoff, limit: deps.batchLimit }),
      );
      const expired = outcome.acquired ? outcome.result : 0;
      deps.logger.info("cart expiry sweep", {
        apply,
        acquired: outcome.acquired,
        expired,
        cutoff: cutoff.toISOString(),
      });
      return { apply: true, acquired: outcome.acquired, expired, cutoff: cutoff.toISOString() };
    },
  };
}
