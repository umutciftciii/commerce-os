import { describe, expect, it } from "vitest";
import {
  createPaymentAccessToken,
  hashPaymentAccessToken,
  verifyPaymentAccessToken,
} from "../src/payments/tokens.js";

const SECRET = "test-session-secret-with-enough-length";

describe("payment access token", () => {
  it("stores only a hash, never the plain token", () => {
    const token = createPaymentAccessToken(SECRET);
    expect(token.tokenHash).not.toBe(token.token);
    expect(token.tokenHash).toBe(hashPaymentAccessToken(token.token, SECRET));
  });

  it("verifies a valid, unexpired token", () => {
    const token = createPaymentAccessToken(SECRET);
    expect(
      verifyPaymentAccessToken(token.token, { accessTokenHash: token.tokenHash, accessTokenExpiresAt: token.expiresAt }, SECRET),
    ).toBe(true);
  });

  it("rejects a wrong token, missing hash, or expired token", () => {
    const token = createPaymentAccessToken(SECRET);
    expect(
      verifyPaymentAccessToken("wrong", { accessTokenHash: token.tokenHash, accessTokenExpiresAt: token.expiresAt }, SECRET),
    ).toBe(false);
    expect(
      verifyPaymentAccessToken(token.token, { accessTokenHash: null, accessTokenExpiresAt: token.expiresAt }, SECRET),
    ).toBe(false);
    const expired = createPaymentAccessToken(SECRET, 30 * 60, new Date(Date.now() - 60 * 60 * 1000));
    expect(
      verifyPaymentAccessToken(expired.token, { accessTokenHash: expired.tokenHash, accessTokenExpiresAt: expired.expiresAt }, SECRET),
    ).toBe(false);
  });
});
