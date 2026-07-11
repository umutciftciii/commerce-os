/**
 * ADR-065 — Site-geneli gorsel yonetimi (Faz 1).
 *
 * Depolama surucusu soyutlamasi. Faz 1'de tek implementasyon LocalDiskDriver'dir;
 * ileride S3Driver AYNI arayuzle eklenir ve cagiran kod degismez.
 *
 * `read` metodu BILINCLI olarak YOKTUR — gorseller statik servis katmaniyla
 * (@fastify/static, Adim 4) sunulur; surucu yalniz yazma/silme/varlik sorumlusudur.
 */
export interface StorageDriver {
  /** `body` buffer'ini `key` yoluna yazar (dizinler yoksa olusturulur). */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** `key` yolundaki dosyayi siler. Dosya yoksa sessizce basarili sayilir. */
  delete(key: string): Promise<void>;
  /** `key` yolunda dosya var mi? */
  exists(key: string): Promise<boolean>;
}
