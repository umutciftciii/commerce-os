import { describe, expect, it } from "vitest";
import { createShippingSecretCipher } from "../src/shipping/encryption.js";
import { ShippingConfigError } from "../src/shipping/errors.js";

const KEY = Buffer.alloc(32, 9).toString("base64");

describe("shipping secret encryption", () => {
  it("roundtrips a secret via AES-256-GCM and never stores plaintext in the ciphertext", () => {
    const cipher = createShippingSecretCipher(KEY);
    const secret = "X-IBM-secret-değeri-1234";
    const encrypted = cipher.encrypt(secret);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith("v1:gcm:")).toBe(true);
    expect(cipher.decrypt(encrypted)).toBe(secret);
  });

  it("produces distinct ciphertexts for the same input (random IV)", () => {
    const cipher = createShippingSecretCipher(KEY);
    expect(cipher.encrypt("same")).not.toBe(cipher.encrypt("same"));
  });

  it("masks a secret to only the last 4 characters", () => {
    const cipher = createShippingSecretCipher(KEY);
    expect(cipher.mask("abcdef1234")).toBe("••••1234");
    expect(cipher.mask("abc")).toBe("••••");
  });

  it("throws CONFIG_MISSING when no key is provided — in EVERY environment (no fallback)", () => {
    for (const key of [undefined, null, ""]) {
      const error = (() => {
        try {
          createShippingSecretCipher(key);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(error).toBeInstanceOf(ShippingConfigError);
      expect((error as ShippingConfigError).code).toBe("CONFIG_MISSING");
    }
  });

  it("rejects an invalid (wrong-length) key", () => {
    const error = (() => {
      try {
        createShippingSecretCipher("too-short");
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ShippingConfigError);
    expect((error as ShippingConfigError).code).toBe("CONFIG_INVALID");
  });
});
