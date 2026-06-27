import { describe, expect, it, vi } from "vitest";
import { createSecretCipher } from "../src/payments/encryption.js";
import { PaymentConfigError } from "../src/payments/types.js";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("payment secret encryption", () => {
  it("roundtrips a secret via AES-256-GCM and never stores plaintext in the ciphertext", () => {
    const cipher = createSecretCipher({ key: KEY, appEnv: "test" });
    const secret = "sk_live_super_secret_value";
    const encrypted = cipher.encrypt(secret);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith("v1:gcm:")).toBe(true);
    expect(cipher.decrypt(encrypted)).toBe(secret);
  });

  it("produces distinct ciphertexts for the same input (random IV)", () => {
    const cipher = createSecretCipher({ key: KEY, appEnv: "test" });
    expect(cipher.encrypt("same")).not.toBe(cipher.encrypt("same"));
  });

  it("masks a secret to only the last 4 characters", () => {
    const cipher = createSecretCipher({ key: KEY, appEnv: "test" });
    expect(cipher.mask("abcdef1234")).toBe("••••1234");
    expect(cipher.mask("abc")).toBe("••••");
  });

  it("uses an insecure dev fallback (with a loud warning) when no key in development", () => {
    const warn = vi.fn();
    const cipher = createSecretCipher({ key: undefined, appEnv: "development", warn });
    expect(cipher.usingDevFallback).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    expect(cipher.decrypt(cipher.encrypt("x"))).toBe("x");
  });

  it("throws when no key is provided in production/staging", () => {
    expect(() => createSecretCipher({ key: undefined, appEnv: "production" })).toThrow(PaymentConfigError);
    expect(() => createSecretCipher({ key: "", appEnv: "staging" })).toThrow(PaymentConfigError);
  });

  it("rejects an invalid (wrong-length) key", () => {
    expect(() => createSecretCipher({ key: "too-short", appEnv: "test" })).toThrow(PaymentConfigError);
  });
});
