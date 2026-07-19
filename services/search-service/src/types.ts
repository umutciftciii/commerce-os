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

// ── PUBLIC SORGU PORTU (TODO-155 · Faz 2C-8B) — provider-bağımsız arama/facet kontratı ──
//
// Bu tipler PROVIDER-BAĞIMSIZDIR: hiçbir Prisma tipi, SQL fragment, tsvector/pg_trgm detayı veya raw query
// sonuç adı SIZMAZ. PostgresSearchProvider ilk implementasyondur; gelecekte OpenSearchProvider AYNI portu
// uygular (ADR-079 §upgrade-path). Girdiler URL-yüzeyli iş kimlikleridir (categorySlug, attribute `code`,
// option `value`) — Postgres-özel değil; OpenSearch provider da aynı şekilde çözer.

/** Desteklenen sıralama anahtarları (İLK FAZ). best_selling/most_viewed/discount/AI = Faz E (burada YOK). */
export type SearchSortKey =
  | "relevance"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "title_asc"
  | "title_desc";

export const SEARCH_SORT_KEYS: readonly SearchSortKey[] = [
  "relevance",
  "newest",
  "price_asc",
  "price_desc",
  "title_asc",
  "title_desc",
] as const;

/**
 * Tek bir dinamik attribute filtresi (facet daraltması). `code` = AttributeDefinition.code (URL-yüzeyli).
 * TEKDÜZE gösterim (parser dataType bilmez): `values` (option/text/boolean — facet İÇİNDE OR) VEYA numeric
 * `min`/`max`. Provider `code`→dataType çözüp doğru kolonu seçer (boolean → values[0] "true"/"false").
 * Farklı SearchFilter'lar birbirine AND uygulanır (facet'ler ARASI AND — §6 semantiği).
 */
export interface SearchFilter {
  code: string;
  /** Option/text/boolean değerleri (ham URL değeri; provider normalize/çözer). Aynı facet içinde OR. */
  values?: string[];
  /** Numeric/DATE aralık alt/üst sınırı (DATE = epoch ms). */
  min?: number;
  max?: number;
}

/** Normalize edilmiş public arama sorgusu (api-gateway parser → provider). Tüm alanlar allowlist'li. */
export interface SearchQuery {
  /** Serbest metin (ham; provider normalize eder). Boş/undefined → kategori/filtre listeleme. */
  q?: string;
  /** Kategori slug'ı (ProductCategory.slug). Verilirse alt kategoriler DAHİL (subtree — ADR-079 kararı). */
  categorySlug?: string;
  /** 1-tabanlı sayfa. */
  page: number;
  /** Sayfa boyutu (bounded). */
  pageSize: number;
  sort: SearchSortKey;
  /** Taban fiyat (minor) alt/üst sınırı — ürünün varyant fiyat ARALIĞI ile overlap. */
  minPrice?: number;
  maxPrice?: number;
  /** Yalnız stokta (hasStock=true) ürünler. */
  inStock?: boolean;
  filters: SearchFilter[];
}

/** Facet gösterim/etkileşim modu (dataType'tan türetilir; UI kontratı). */
export type SearchFacetSelectionMode = "MULTI" | "RANGE" | "BOOLEAN";

/** Bir option/text/boolean facet değeri + count + seçili durumu. */
export interface SearchFacetValue {
  /** Option facet için AttributeOption.id; text/boolean için null. */
  optionId: string | null;
  /** Ham değer (option.value / text değeri / "true"|"false"). */
  value: string;
  /** Görünen etiket (option.label / text değeri / Evet-Hayır türevi). */
  label: string;
  /** COLOR facet için renk kodu; aksi null. */
  colorHex: string | null;
  /** Bu değere sahip (mevcut daraltmada) ürün sayısı. */
  count: number;
  /** Aktif sorguda bu değer seçili mi. */
  selected: boolean;
}

/** Numeric facet aralık özeti. */
export interface SearchFacetRange {
  availableMin: number | null;
  availableMax: number | null;
  selectedMin: number | null;
  selectedMax: number | null;
}

/** Tek bir facet (sonuç uzayından + CategoryAttribute.filterable'dan türetilmiş). */
export interface SearchFacet {
  attributeDefinitionId: string;
  code: string;
  name: string;
  dataType: SearchAttributeDataType;
  unit: string | null;
  displayOrder: number;
  selectionMode: SearchFacetSelectionMode;
  /** Option/text/boolean facet değerleri (numeric facet'te boş dizi). */
  values: SearchFacetValue[];
  /** Numeric facet aralığı (yalnız INTEGER/DECIMAL/DATE facet'te dolu). */
  range: SearchFacetRange | null;
}

/** Tek bir arama sonucu ürünü — YALNIZ read-model doküman projeksiyonu (EAV/Product join'i YOK). */
export interface SearchResultItem {
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  primaryCategoryId: string | null;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  currency: string | null;
  availability: SearchAvailability;
  inStock: boolean;
  variantCount: number;
}

/** Numaralı pagination özeti (§10). */
export interface SearchPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Bir arama isteğinin tam sonucu (items + facets + pagination + uygulanan sort). */
export interface SearchResult {
  sort: SearchSortKey;
  pagination: SearchPagination;
  items: SearchResultItem[];
  facets: SearchFacet[];
}

/** Provider'ın public sorgu sırasında fırlattığı KONTROLLÜ hata kodları (SQL/Prisma mesajı SIZMAZ). */
export type SearchErrorCode =
  | "CATEGORY_NOT_FOUND"
  | "ATTRIBUTE_NOT_FILTERABLE"
  | "INVALID_FILTER_VALUE";

/** Provider kontrollü hatası; api-gateway kodu HTTP durumuna eşler (errorBody). */
export class SearchError extends Error {
  readonly code: SearchErrorCode;
  constructor(code: SearchErrorCode, message: string) {
    super(message);
    this.name = "SearchError";
    this.code = code;
  }
}

/**
 * SearchProvider — indeksleme + public sorgu portu. iş katmanı (worker/backfill/api-gateway) YALNIZ bu
 * arayüze bağlanır; PostgresSearchProvider tek implementasyondur. `search` Faz B'de (TODO-155) EKLENDİ;
 * gelecekte OpenSearchProvider AYNI imzayı uygular (ADR-079 §upgrade-path).
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
  /**
   * Public arama + facet sorgusu (TODO-155). YALNIZ search read-model'den okur (ProductSearchDocument +
   * ProductFacetValue); Product/EAV tabloları source-of-truth gibi yeniden JOIN EDİLMEZ (ADR-079 kilidi).
   * Kategori/attribute taksonomisi yalnız çözüm/meta için okunur. Kontrollü hatalar `SearchError` fırlatır.
   */
  search(storeId: string, query: SearchQuery): Promise<SearchResult>;
}
