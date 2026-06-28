import { describe, expect, it } from "vitest";
import type { ShippingProviderConfig, ShippingProviderCredential } from "@prisma/client";
import {
  computeCredentialStatus,
  deriveConnectionStatus,
  serializeShippingProviderConfig,
  type ShippingEnvGuards,
} from "../src/shipping/serialize.js";

/**
 * TODO-094B — "credential kayitli" (credentialStatus) ile "gercek baglanti dogrulandi"
 * (connectionStatus) AYRIMI. connectionStatus null lastTestStatus icin UNTESTED'tir;
 * HTTP transport kapaliyken test ASLA OK yazmaz (route HTTP_DISABLED yazar).
 */

const ENV_OFF: ShippingEnvGuards = { orderCreate: false, barcodeCreate: false, labelPurchase: false };

function cred(type: ShippingProviderCredential["type"], configured: boolean): ShippingProviderCredential {
  return {
    id: `c_${type}`,
    providerConfigId: "spc_1",
    type,
    encryptedKey: configured ? "v1:gcm:xxx" : null,
    encryptedSecret: configured ? "v1:gcm:yyy" : null,
    encryptedCustomerNumber: configured ? "v1:gcm:zzz" : null,
    encryptedCustomerPassword: configured ? "v1:gcm:www" : null,
    identityType: 1,
    maskedKey: configured ? "••••1234" : null,
    configured,
    lastTestedAt: null,
    lastTestStatus: null,
    lastErrorCode: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function config(
  provider: ShippingProviderConfig["provider"],
  credentials: ShippingProviderCredential[],
  overrides: Partial<ShippingProviderConfig> = {},
): ShippingProviderConfig & { credentials: ShippingProviderCredential[] } {
  return {
    id: "spc_1",
    storeId: "store_1",
    provider,
    mode: "TEST",
    status: "DISABLED",
    displayName: "X",
    allowOrderCreate: false,
    allowBarcodeCreate: false,
    allowLabelPurchase: false,
    lastTestedAt: null,
    lastTestStatus: null,
    lastErrorCode: null,
    lastProviderHttpStatus: null,
    lastProviderTestType: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
    credentials,
  };
}

describe("computeCredentialStatus", () => {
  it("MOCK is always CONFIGURED (no credentials required)", () => {
    expect(computeCredentialStatus(config("MOCK", []))).toBe("CONFIGURED");
  });

  it("GELIVER MISSING without DEFAULT, CONFIGURED with it", () => {
    expect(computeCredentialStatus(config("GELIVER", []))).toBe("MISSING");
    expect(computeCredentialStatus(config("GELIVER", [cred("DEFAULT", true)]))).toBe("CONFIGURED");
  });

  it("DHL is INCOMPLETE with only some required credentials", () => {
    const partial = config("DHL_ECOMMERCE", [cred("IDENTITY", true), cred("STANDARD_QUERY", true)]);
    expect(computeCredentialStatus(partial)).toBe("INCOMPLETE");
  });

  it("DHL is CONFIGURED only when all four required credentials are set", () => {
    const full = config("DHL_ECOMMERCE", [
      cred("IDENTITY", true),
      cred("STANDARD_COMMAND", true),
      cred("STANDARD_QUERY", true),
      cred("BARCODE_COMMAND", true),
    ]);
    expect(computeCredentialStatus(full)).toBe("CONFIGURED");
  });
});

describe("deriveConnectionStatus", () => {
  it("null lastTestStatus → UNTESTED (configured ≠ tested)", () => {
    expect(deriveConnectionStatus(null)).toBe("UNTESTED");
  });

  it("maps persisted statuses including HTTP_DISABLED", () => {
    expect(deriveConnectionStatus("OK")).toBe("OK");
    expect(deriveConnectionStatus("HTTP_DISABLED")).toBe("HTTP_DISABLED");
    expect(deriveConnectionStatus("FAILED")).toBe("FAILED");
    expect(deriveConnectionStatus("SKIPPED")).toBe("SKIPPED");
  });
});

describe("serializeShippingProviderConfig — configured vs connection separation", () => {
  it("DHL with full creds but never tested: CONFIGURED + UNTESTED, no plaintext/ciphertext leaks", () => {
    const full = config("DHL_ECOMMERCE", [
      cred("IDENTITY", true),
      cred("STANDARD_COMMAND", true),
      cred("STANDARD_QUERY", true),
      cred("BARCODE_COMMAND", true),
    ]);
    const out = serializeShippingProviderConfig(full, ENV_OFF);
    expect(out.credentialStatus).toBe("CONFIGURED");
    expect(out.connectionStatus).toBe("UNTESTED");
    expect(out.lastProviderHttpStatus).toBeNull();
    // Ciphertext/secret ASLA serialize edilmez.
    expect(JSON.stringify(out)).not.toContain("v1:gcm");
  });

  it("reflects an HTTP_DISABLED last test (real call not made)", () => {
    const full = config(
      "DHL_ECOMMERCE",
      [
        cred("IDENTITY", true),
        cred("STANDARD_COMMAND", true),
        cred("STANDARD_QUERY", true),
        cred("BARCODE_COMMAND", true),
      ],
      {
        lastTestStatus: "HTTP_DISABLED",
        lastTestedAt: new Date("2026-06-29T10:00:00.000Z"),
        lastProviderTestType: "IDENTITY_TOKEN",
        lastProviderHttpStatus: null,
      },
    );
    const out = serializeShippingProviderConfig(full, ENV_OFF);
    expect(out.credentialStatus).toBe("CONFIGURED");
    expect(out.connectionStatus).toBe("HTTP_DISABLED");
    expect(out.lastProviderTestType).toBe("IDENTITY_TOKEN");
    expect(out.lastProviderTestAt).toBe("2026-06-29T10:00:00.000Z");
  });
});
