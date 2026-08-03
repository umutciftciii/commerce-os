/**
 * TODO-167 (ADR-266) — Persistent Cart expiry sweep servisi (saf; advisory-lock + delegate).
 * Cutoff hesabi (retentionDays), dry-run (apply=false → sweep YOK), advisory-lock acquired/not,
 * idempotent delegate. Sweep DB mantigi cart-data.test'te; burada orkestrasyon test edilir.
 */
import { describe, expect, it, vi } from "vitest";
import { createCartExpirySweepService } from "../src/cart/expiry-service.js";
import type { LockOutcome } from "@commerce-os/db";

const FIXED = new Date("2026-08-03T00:00:00.000Z");
const acquiredLock =
  <T,>() =>
  async (_job: string, _store: string, fn: () => Promise<T>): Promise<LockOutcome<T>> => ({
    acquired: true,
    result: await fn(),
  });
const busyLock = async (): Promise<LockOutcome<never>> => ({ acquired: false });

describe("cart expiry sweep service", () => {
  it("computes a 90-day cutoff and delegates to sweepExpired under the lock", async () => {
    const sweepExpired = vi.fn(async () => 4);
    const service = createCartExpirySweepService({
      data: { sweepExpired },
      lock: acquiredLock() as never,
      now: () => FIXED,
      retentionDays: 90,
      batchLimit: 1000,
      logger: { info() {} },
    });
    const summary = await service.runOnce({ apply: true });
    expect(summary.expired).toBe(4);
    expect(summary.acquired).toBe(true);
    const call = sweepExpired.mock.calls[0][0];
    expect(call.limit).toBe(1000);
    // 90 gun once
    expect(call.olderThan.toISOString()).toBe("2026-05-05T00:00:00.000Z");
  });

  it("dry-run (apply=false) does not sweep", async () => {
    const sweepExpired = vi.fn(async () => 9);
    const service = createCartExpirySweepService({
      data: { sweepExpired },
      lock: acquiredLock() as never,
      now: () => FIXED,
      retentionDays: 90,
      batchLimit: 1000,
      logger: { info() {} },
    });
    const summary = await service.runOnce({ apply: false });
    expect(summary.expired).toBe(0);
    expect(sweepExpired).not.toHaveBeenCalled();
  });

  it("when the lock is not acquired, reports 0 and does not sweep", async () => {
    const sweepExpired = vi.fn(async () => 5);
    const service = createCartExpirySweepService({
      data: { sweepExpired },
      lock: busyLock as never,
      now: () => FIXED,
      retentionDays: 90,
      batchLimit: 1000,
      logger: { info() {} },
    });
    const summary = await service.runOnce({ apply: true });
    expect(summary.acquired).toBe(false);
    expect(summary.expired).toBe(0);
    expect(sweepExpired).not.toHaveBeenCalled();
  });
});
