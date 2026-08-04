import { describe, it, expect, vi } from "vitest";
import {
  isSmokeIdentity,
  assertSmokeCredentialTarget,
  withSmokeCredential,
  type SmokeCredentialDeps,
  type CredentialSnapshot,
} from "../scripts/smoke-credential-safety";

describe("smoke credential safety (TD-UX-6 hardening)", () => {
  it("isSmokeIdentity: izole önekler true, gerçek/seed false", () => {
    expect(isSmokeIdentity({ customerId: "smk_csess_1" })).toBe(true);
    expect(isSmokeIdentity({ customerId: "x", email: "smoke-buyer@test.local" })).toBe(true);
    // Gerçek (non-smoke) müşteri kimliği:
    expect(isSmokeIdentity({ customerId: "cust_real_1", email: "real-customer@example.com" })).toBe(false);
  });

  it("assertSmokeCredentialTarget: gerçek müşteri fail-closed atar; smk_ geçer", () => {
    expect(() =>
      assertSmokeCredentialTarget({ customerId: "cust_real_1", email: "real-customer@example.com" }),
    ).toThrow(/gerçek\/seed müşteri credential/);
    expect(() => assertSmokeCredentialTarget({ customerId: "smk_cust_1" })).not.toThrow();
  });

  function fakeDeps(initial: CredentialSnapshot | null) {
    const state = { cred: initial };
    const deps: SmokeCredentialDeps = {
      readCredential: vi.fn(async () => state.cred),
      setCredential: vi.fn(async (_id: string, passwordHash: string) => {
        state.cred = { passwordHash, passwordChangedAt: new Date(0) };
      }),
      restoreCredential: vi.fn(async (_id: string, snap: CredentialSnapshot) => {
        state.cred = snap;
      }),
      deleteCredential: vi.fn(async () => {
        state.cred = null;
      }),
    };
    return { deps, state };
  }

  it("gerçek hedefe HİÇBİR mutasyon yapılmaz (guard önce atar)", async () => {
    const { deps } = fakeDeps({ passwordHash: "orig", passwordChangedAt: new Date(0) });
    await expect(
      withSmokeCredential(deps, { customerId: "cust_real_1" }, "smokeHash", async () => "ok"),
    ).rejects.toThrow(/Smoke güvenlik ihlali/);
    expect(deps.setCredential).not.toHaveBeenCalled();
    expect(deps.deleteCredential).not.toHaveBeenCalled();
  });

  it("mevcut credential varsa: body başarılı → finally orijinali RESTORE eder", async () => {
    const original: CredentialSnapshot = { passwordHash: "ORIGINAL", passwordChangedAt: new Date(123) };
    const { deps, state } = fakeDeps(original);
    const out = await withSmokeCredential(deps, { customerId: "smk_cust_1" }, "SMOKEHASH", async () => "done");
    expect(out).toBe("done");
    expect(state.cred).toEqual(original); // birebir restore
    expect(deps.restoreCredential).toHaveBeenCalledWith("smk_cust_1", original);
  });

  it("body HATA atsa bile finally restore çalışır (cleanup-on-failure)", async () => {
    const original: CredentialSnapshot = { passwordHash: "ORIGINAL", passwordChangedAt: new Date(123) };
    const { deps, state } = fakeDeps(original);
    await expect(
      withSmokeCredential(deps, { customerId: "smk_cust_1" }, "SMOKEHASH", async () => {
        throw new Error("smoke body failed");
      }),
    ).rejects.toThrow("smoke body failed");
    expect(state.cred).toEqual(original); // hata olsa da restore edildi
  });

  it("önceden credential yoksa (izole fixture): finally SİLER (kalıntı bırakmaz)", async () => {
    const { deps, state } = fakeDeps(null);
    await withSmokeCredential(deps, { customerId: "smk_cust_1" }, "SMOKEHASH", async () => "ok");
    expect(deps.deleteCredential).toHaveBeenCalledWith("smk_cust_1");
    expect(state.cred).toBeNull();
  });

  it("restore hatası yayılır (smoke fail sayılır)", async () => {
    const original: CredentialSnapshot = { passwordHash: "ORIGINAL", passwordChangedAt: new Date(0) };
    const { deps } = fakeDeps(original);
    deps.restoreCredential = vi.fn(async () => {
      throw new Error("restore failed");
    });
    await expect(
      withSmokeCredential(deps, { customerId: "smk_cust_1" }, "SMOKEHASH", async () => "ok"),
    ).rejects.toThrow("restore failed");
  });
});
