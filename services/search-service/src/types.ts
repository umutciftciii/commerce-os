/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Search Read-Model · TIPLER + PORT.
 *
 * `SearchProvider` iş katmanının doğrudan Prisma/SQL'e bağlanmasını engelleyen PORT'tur. Faz A'da
 * yalnız INDEKSLEME operasyonları (index/remove/rebuild/backfill/status) açıktır; public `search`/
 * `facets` sorgu metotları GENİŞLEME NOKTASI olarak yorumda bırakıldı (Faz B). İlk implementasyon
 * `PostgresSearchProvider`; gelecekte `OpenSearchProvider` AYNI portu uygular (ADR-079 §upgrade-path).
 *
 * Bu dosya İZOLE tiplerdir (Prisma tiplerine bağımlı değil) → document-builder SAF kalır, birim test
 * DB'siz çalışır.
 */

// ── Kaynak (source-of-truth) projeksiyonu — data katmanının builder'a verdiği bounded girdi ──

export type SearchProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type SearchVariantStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type SearchAttributeStatus = "ACTIVE" | "ARCHIVED";
export type SearchAttributeDataType =
  | "TEXT"
  | "TEXTAREA"
  | "RICH_TEXT"
  | "INTEGER"
  | "DECIMAL"
  | "BOOLEAN"
  | "DATE"
  | "URL"
  | "SELECT"
  | "MULTI_SELECT"
  | "COLOR"
  | "IMAGE"
  | "FILE";

/** Bir attribute seçeneği (SELECT/COLOR/MULTI_SELECT). ARCHIVED seçenek facet'e/aramaya GİRMEZ. */
export interface SearchOptionRef {
  id: string;
  value: string;
  label: string;
  status: SearchAttributeStatus;
}

/** Aktif varyantın fiyat/stok projeksiyonu. `available` = onHand − reserved (InventoryItem); null = bilinmiyor. */
export interface SearchSourceVariant {
  id: string;
  status: SearchVariantStatus;
  priceMinor: number;
  currency: string;
  available: number | null;
}

/**
 * Ürünün ana kategorisine bağlı CategoryAttribute davranışı (yalnız filterable VEYA searchable olanlar
 * yüklenir). `variantDefining` değer kaynağını belirler (variant vs ürün seviyesi). definition PLATFORM
 * ya da STORE olabilir — tenant güvenliği DEĞER tablolarının storeId filtresiyle sağlanır (data katmanı).
 */
export interface SearchSourceCategoryAttribute {
  attributeDefinitionId: string;
  filterable: boolean;
  searchable: boolean;
  variantDefining: boolean;
  code: string;
  name: string;
  dataType: SearchAttributeDataType;
  definitionStatus: SearchAttributeStatus;
}

/** Ürün-seviyesi attribute değeri (ProductAttributeValue). Tip-güvenli: en fazla bir kolon dolu. */
export interface SearchSourceProductAttributeValue {
  attributeDefinitionId: string;
  valueText: string | null;
  valueInteger: number | null;
  /** DECIMAL — Prisma.Decimal → string (kayıpsız). */
  valueDecimal: string | null;
  valueBoolean: boolean | null;
  valueDate: Date | null;
  option: SearchOptionRef | null;
  /** MULTI_SELECT junction seçenekleri (deger kolonları boş). */
  multiOptions: SearchOptionRef[];
}

/** Varyant-seviyesi attribute değeri (VariantAttributeValue) — yalnız valueText veya option. */
export interface SearchSourceVariantAttributeValue {
  variantId: string;
  attributeDefinitionId: string;
  valueText: string | null;
  option: SearchOptionRef | null;
}

/** Bir ürünün arama dokümanını üretmek için gereken TÜM kaynak (data katmanı doldurur). */
export interface SearchSourceProduct {
  id: string;
  storeId: string;
  title: string;
  slug: string;
  brand: string | null;
  description: string | null;
  status: SearchProductStatus;
  priceVisible: boolean;
  primaryCategoryId: string | null;
  createdAt: Date;
  updatedAt: Date;
  variants: SearchSourceVariant[];
  categoryAttributes: SearchSourceCategoryAttribute[];
  productAttributeValues: SearchSourceProductAttributeValue[];
  variantAttributeValues: SearchSourceVariantAttributeValue[];
}

// ── Builder çıktısı — data katmanının DB'ye yazdığı denormalize satırlar ──

export type SearchAvailability = "IN_STOCK" | "OUT_OF_STOCK";

export interface SearchDocumentData {
  storeId: string;
  productId: string;
  primaryCategoryId: string | null;
  title: string;
  slug: string;
  brand: string | null;
  searchText: string;
  status: SearchProductStatus;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  currency: string | null;
  hasStock: boolean;
  availability: SearchAvailability;
  variantCount: number;
  productCreatedAt: Date;
  productUpdatedAt: Date;
}

/** Tek facet satırı — EN FAZLA bir typed kolon dolu (builder invariant + DB CHECK). */
export interface SearchFacetData {
  storeId: string;
  productId: string;
  categoryId: string;
  attributeDefinitionId: string;
  optionId: string | null;
  valueText: string | null;
  valueNumber: string | null;
  valueBoolean: boolean | null;
  valueDate: Date | null;
  normalizedText: string | null;
}

/**
 * Deterministik builder sonucu. `removed` → ürün public-görünür değil (status ≠ ACTIVE); read-model'den
 * silinmeli. Aksi halde doküman + facet satırları (delete-and-replace ile yazılır).
 */
export type SearchBuildResult =
  | { removed: true }
  | { removed: false; document: SearchDocumentData; facets: SearchFacetData[] };

// ── Provider port + operasyon sonuçları ──

export type IndexAction = "indexed" | "removed";

export interface IndexOutcome {
  productId: string;
  action: IndexAction;
  facetCount: number;
}

export interface BatchIndexOutcome {
  scanned: number;
  indexed: number;
  removed: number;
  failed: number;
  /** productId → hata mesajı (poison job tanısı; secret/PII taşımaz). */
  errors: Array<{ productId: string; message: string }>;
}

export interface RebuildReport extends BatchIndexOutcome {
  storeId: string;
  batches: number;
  durationMs: number;
}

export interface IndexStatus {
  storeId: string;
  documentCount: number;
  facetCount: number;
  lastIndexedAt: Date | null;
}

export interface RebuildOptions {
  /** Chunk boyutu (bounded batch; bellek + query patlaması guard'ı). */
  batchSize?: number;
  /** Yalnız bu productId kümesini yeniden indeksle (kategori/attribute şema değişimi → etkilenen ürünler). */
  productIds?: string[];
}

/**
 * SearchProvider — indeksleme portu. iş katmanı (worker/backfill/api-gateway) YALNIZ bu arayüze bağlanır;
 * PostgresSearchProvider tek implementasyondur. Public `search(storeId, query)` / `facets(storeId, query)`
 * metotları Faz B'de bu arayüze EKLENECEK (genişleme noktası) — Faz A'da bilinçle YOK.
 */
export interface SearchProvider {
  /** Tek ürünü yeniden indeksle (ACTIVE değilse/bulunamazsa güvenli remove). Atomik (tek transaction). */
  indexProduct(storeId: string, productId: string): Promise<IndexOutcome>;
  /** Bounded batch reindex (backfill/şema-değişimi fan-out'u; chunk başına bounded query). */
  indexProducts(storeId: string, productIds: string[]): Promise<BatchIndexOutcome>;
  /** Ürünü read-model'den kaldır (idempotent; yoksa no-op). */
  removeProduct(storeId: string, productId: string): Promise<void>;
  /** Mağazanın tüm (ilgili) ürünlerini chunk'lar halinde yeniden indeksle. Resumable + idempotent. */
  rebuildStore(storeId: string, options?: RebuildOptions): Promise<RebuildReport>;
  /** Backfill = rebuildStore'un anlamsal takma adı (ilk doldurma). Aynı garantiler. */
  backfillStore(storeId: string, options?: RebuildOptions): Promise<RebuildReport>;
  /** Read-model sağlık/durum sayaçları (health/observability). */
  getIndexStatus(storeId: string): Promise<IndexStatus>;
}
