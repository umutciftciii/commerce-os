import { describe, it, expect } from "vitest";
import { assertEndpointAllowed, S3StorageError, createS3StorageAdapter } from "../src/storage/s3.js";

describe("assertEndpointAllowed (https-only politikası)", () => {
  it("AWS virtual-host (endpoint yok) → izinli", () => {
    expect(() => assertEndpointAllowed({})).not.toThrow();
  });
  it("https endpoint → izinli", () => {
    expect(() => assertEndpointAllowed({ endpoint: "https://s3.example.com" })).not.toThrow();
    expect(() => assertEndpointAllowed({ endpoint: "https://s3.example.com", isProduction: true })).not.toThrow();
  });
  it("production + http endpoint → REDDEDİLİR (insecure override'a rağmen)", () => {
    expect(() =>
      assertEndpointAllowed({ endpoint: "http://minio:9000", isProduction: true, allowInsecureEndpoint: true }),
    ).toThrow(S3StorageError);
  });
  it("non-prod + http + insecure override YOK → reddedilir", () => {
    expect(() => assertEndpointAllowed({ endpoint: "http://localhost:9000" })).toThrow(S3StorageError);
  });
  it("non-prod + http + insecure override → izinli (local MinIO)", () => {
    expect(() =>
      assertEndpointAllowed({ endpoint: "http://localhost:9000", allowInsecureEndpoint: true }),
    ).not.toThrow();
  });
});

describe("createS3StorageAdapter", () => {
  it("describe secret içermez", () => {
    const a = createS3StorageAdapter({
      endpoint: "https://s3.example.com",
      region: "us-east-1",
      bucket: "backups",
      accessKeyId: "AKIA_SUPER_SECRET",
      secretAccessKey: "very-secret-value-1234",
      forcePathStyle: true,
    });
    expect(a.describe).not.toContain("AKIA_SUPER_SECRET");
    expect(a.describe).not.toContain("very-secret-value-1234");
    expect(a.describe).toContain("s3://backups");
  });
  it("production http endpoint ile kurulum reddedilir", () => {
    expect(() =>
      createS3StorageAdapter({
        endpoint: "http://minio:9000",
        region: "us-east-1",
        bucket: "b",
        accessKeyId: "ak",
        secretAccessKey: "sk",
        forcePathStyle: true,
        isProduction: true,
      }),
    ).toThrow(S3StorageError);
  });
});
