import { describe, it, expect } from "vitest";
import { assertRestoreTargetAllowed, looksLikeProduction, RestoreGuardError } from "../src/guards.js";

const LOCAL = "postgresql://u:p@localhost:5433/restore_target";

function expectCode(fn: () => void, code: string): void {
  try {
    fn();
    throw new Error("beklenen guard hatası atılmadı");
  } catch (e) {
    expect(e).toBeInstanceOf(RestoreGuardError);
    expect((e as RestoreGuardError).code).toBe(code);
  }
}

describe("looksLikeProduction", () => {
  it("prod işaretlerini yakalar", () => {
    expect(looksLikeProduction("postgresql://u:p@prod-db.internal/app")).toBe(true);
    expect(looksLikeProduction("postgresql://u:p@x.rds.amazonaws.com/app")).toBe(true);
    expect(looksLikeProduction("postgresql://u:p@ep.neon.tech/app")).toBe(true);
    expect(looksLikeProduction(LOCAL)).toBe(false);
  });
});

describe("assertRestoreTargetAllowed", () => {
  it("onaysız → DESTRUCTIVE_CONFIRM_REQUIRED", () => {
    expectCode(
      () => assertRestoreTargetAllowed({ targetUrl: LOCAL, confirmDestructive: false }),
      "DESTRUCTIVE_CONFIRM_REQUIRED",
    );
  });

  it("mevcut DB'nin üzerine → SAME_AS_CURRENT_DB_BLOCKED", () => {
    expectCode(
      () =>
        assertRestoreTargetAllowed({
          targetUrl: LOCAL,
          currentDatabaseUrl: LOCAL,
          confirmDestructive: true,
        }),
      "SAME_AS_CURRENT_DB_BLOCKED",
    );
  });

  it("production hedef → onaysız PRODUCTION_TARGET_BLOCKED", () => {
    expectCode(
      () =>
        assertRestoreTargetAllowed({
          targetUrl: "postgresql://u:p@prod-db/app",
          confirmDestructive: true,
        }),
      "PRODUCTION_TARGET_BLOCKED",
    );
  });

  it("production hedef → çift onayla geçer", () => {
    expect(() =>
      assertRestoreTargetAllowed({
        targetUrl: "postgresql://u:p@prod-db/app",
        confirmDestructive: true,
        allowProductionTarget: true,
        confirmProductionRestore: true,
      }),
    ).not.toThrow();
  });

  it("allowlist dışı host → TARGET_NOT_ALLOWLISTED", () => {
    expectCode(
      () =>
        assertRestoreTargetAllowed({
          targetUrl: LOCAL,
          confirmDestructive: true,
          allowlistHosts: ["restore-host"],
        }),
      "TARGET_NOT_ALLOWLISTED",
    );
  });

  it("izole local hedef + onay → geçer", () => {
    expect(() =>
      assertRestoreTargetAllowed({
        targetUrl: LOCAL,
        confirmDestructive: true,
        allowlistHosts: ["localhost"],
      }),
    ).not.toThrow();
  });
});
