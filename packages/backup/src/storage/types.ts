/**
 * PB-2/PB-3 — Offsite storage adapter kontratı (provider-bağımsız).
 *
 * Backup servisleri yalnız bu dar yüzeye bağlıdır → S3/R2/B2/MinIO/local implementasyonları takılabilir,
 * testlerde in-memory/local fake ile doğrulanır. Adapter'lar secret'ı `describe` içinde SIZDIRMAZ.
 */

export interface StoredObjectHead {
  key: string;
  size: number;
  /** Provider ETag (varsa). MD5 semantiği garanti değil; bütünlük için sha256 metadata tercih edilir. */
  etag?: string;
  /** PUT sırasında yazılan `x-amz-meta-sha256` (varsa) — remote bütünlük doğrulaması. */
  sha256?: string;
}

export interface ListedObject {
  key: string;
  size: number;
  lastModified?: Date;
}

export interface StorageAdapter {
  readonly kind: "local" | "s3";
  /** Secret İÇERMEYEN, loglanabilir kısa tanım (ör. `s3://bucket/prefix @ host`). */
  readonly describe: string;
  /** Dosyayı `key` altına yükler; opsiyonel sha256 metadata olarak yazılır. Head döndürür. */
  putFile(
    key: string,
    filePath: string,
    opts?: { sha256?: string; contentType?: string },
  ): Promise<StoredObjectHead>;
  /** `key`'i yerel dosyaya indirir. */
  getToFile(key: string, destPath: string): Promise<void>;
  /** `key` için HEAD; yoksa null. */
  head(key: string): Promise<StoredObjectHead | null>;
  /** `prefix` altındaki tüm objeleri listeler. */
  list(prefix: string): Promise<ListedObject[]>;
  /** `key`'i siler (idempotent — yoksa hata değil). */
  delete(key: string): Promise<void>;
}
