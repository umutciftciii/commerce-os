/**
 * PB-2/PB-3 — S3-uyumlu offsite storage adapter'ı (AWS SDK v3).
 *
 * PB-2/PB-3 hardening: elle-yazılmış SigV4 signer KALDIRILDI → resmi `@aws-sdk/client-s3`. Provider-bağımsız:
 * endpoint verilirse path-style (MinIO/R2/B2), verilmezse AWS virtual-host. Kurallar (spec §2, §6):
 *  - Public ACL ASLA gönderilmez (obje private; ACL parametresi set edilmez).
 *  - PUT'ta sha256 metadata (`x-amz-meta-sha256`) → upload sonrası HEAD ile remote bütünlük.
 *  - **Bounded retry** (maxAttempts) + **timeout** (NodeHttpHandler connection/request).
 *  - **https-only**: production'da HTTP endpoint REDDEDİLİR; local/test MinIO için explicit insecure override.
 *  - Secret (access key/secret) `describe`/log'a ASLA sızmaz.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { sha256File } from "../checksum.js";
import type { ListedObject, StorageAdapter, StoredObjectHead } from "./types.js";

export interface S3AdapterConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** http endpoint'e izin (yalnız local/test MinIO; production'da yine reddedilir). */
  allowInsecureEndpoint?: boolean;
  /** production sertliği (http endpoint her koşulda reddedilir). */
  isProduction?: boolean;
  /** Bounded retry (varsayılan 3) + timeout (ms). */
  maxAttempts?: number;
  connectionTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export class S3StorageError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "S3StorageError";
    this.status = status;
  }
}

/** Endpoint https-only politikası (spec §2, §6). */
export function assertEndpointAllowed(config: {
  endpoint?: string;
  allowInsecureEndpoint?: boolean;
  isProduction?: boolean;
}): void {
  if (!config.endpoint) return; // AWS virtual-host (https)
  let protocol: string;
  try {
    protocol = new URL(config.endpoint).protocol;
  } catch {
    throw new S3StorageError(0, "Geçersiz S3 endpoint URL'i.");
  }
  if (protocol === "https:") return;
  if (protocol !== "http:") {
    throw new S3StorageError(0, `Desteklenmeyen endpoint şeması: ${protocol} (yalnız https/http).`);
  }
  // http:
  if (config.isProduction) {
    throw new S3StorageError(0, "Production'da HTTP object-storage endpoint REDDEDİLİR — https zorunlu.");
  }
  if (!config.allowInsecureEndpoint) {
    throw new S3StorageError(
      0,
      "HTTP endpoint yalnız DATABASE_BACKUP_S3_ALLOW_INSECURE=true ile (local/test MinIO) kullanılabilir.",
    );
  }
}

export function createS3StorageAdapter(config: S3AdapterConfig): StorageAdapter {
  assertEndpointAllowed(config);
  const endpoint = config.endpoint?.replace(/\/+$/, "");
  const client = new S3Client({
    region: config.region,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: config.maxAttempts ?? 3,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: config.connectionTimeoutMs ?? 10_000,
      requestTimeout: config.requestTimeoutMs ?? 120_000,
    }),
  });

  function statusOf(error: unknown): number {
    const meta = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata;
    return meta?.httpStatusCode ?? 0;
  }

  return {
    kind: "s3",
    describe: `s3://${config.bucket}${endpoint ? ` @ ${safeHost(endpoint)}` : ` @ s3.${config.region}.amazonaws.com`}`,

    async putFile(key, filePath, opts): Promise<StoredObjectHead> {
      const s = await stat(filePath);
      const sha256 = opts?.sha256 ?? (await sha256File(filePath));
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: createReadStream(filePath),
            ContentLength: s.size,
            ContentType: opts?.contentType ?? "application/octet-stream",
            Metadata: { sha256 },
            // ACL set EDİLMEZ → obje private (bucket varsayılanı). Public ACL asla gönderilmez.
          }),
        );
      } catch (error) {
        throw new S3StorageError(statusOf(error), `S3 PUT başarısız: ${(error as Error).name}`);
      }
      return { key, size: s.size, sha256 };
    },

    async getToFile(key, destPath): Promise<void> {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        if (!res.Body) throw new S3StorageError(statusOf(res), "S3 GET gövdesi boş.");
        await pipeline(res.Body as Readable, createWriteStream(destPath, { mode: 0o600 }));
      } catch (error) {
        if (error instanceof S3StorageError) throw error;
        throw new S3StorageError(statusOf(error), `S3 GET başarısız: ${(error as Error).name}`);
      }
    },

    async head(key): Promise<StoredObjectHead | null> {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return {
          key,
          size: res.ContentLength ?? 0,
          etag: res.ETag,
          sha256: res.Metadata?.sha256,
        };
      } catch (error) {
        const status = statusOf(error);
        if (status === 404 || (error as Error).name === "NotFound") return null;
        throw new S3StorageError(status, `S3 HEAD başarısız: ${(error as Error).name}`);
      }
    },

    async list(prefix): Promise<ListedObject[]> {
      const out: ListedObject[] = [];
      let token: string | undefined;
      try {
        do {
          const res = await client.send(
            new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, ContinuationToken: token }),
          );
          for (const obj of res.Contents ?? []) {
            if (obj.Key) out.push({ key: obj.Key, size: obj.Size ?? 0, lastModified: obj.LastModified });
          }
          token = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (token);
      } catch (error) {
        throw new S3StorageError(statusOf(error), `S3 LIST başarısız: ${(error as Error).name}`);
      }
      return out.sort((a, b) => a.key.localeCompare(b.key));
    },

    async delete(key): Promise<void> {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
      } catch (error) {
        const status = statusOf(error);
        if (status === 404) return; // idempotent
        throw new S3StorageError(status, `S3 DELETE başarısız: ${(error as Error).name}`);
      }
    },
  };
}

function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "endpoint";
  }
}
