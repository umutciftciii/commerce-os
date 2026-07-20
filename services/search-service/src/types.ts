/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Search Read-Model · TIPLER + PORT.
 *
 * `SearchProvider` iş katmanının doğrudan Prisma/SQL'e bağlanmasını engelleyen PORT'tur. Faz A'da
 * yalnız INDEKSLEME operasyonları (index/remove/rebuild/backfill/status) açıktır; public `search`/
 * `facets` sorgu metotları GENİŞLEME NOKTASI olarak yorumda bırakıldı (Faz B). İlk implementasyon
 * `PostgresSearchProvider`; gelecekte `OpenSearchProvider` AYNI portu uygular (ADR-079 §upgrade-path).
 *
 * Bu dosya İZOLE tiplerdir (Prisma tiplerine bağımlı değil) → document-builder SAF kalır, birim test
 * DB'siz çalışır. TODO-155.2: kampanya rozeti için PAYLAŞILAN saf tipler (@commerce-os/contracts;
 * Prisma DEĞİL) içe aktarılır — PDP ile AYNI değerlendirici index-anında kullanılır.
 */
import type { CampaignRecord, PublicCampaignBadge } from "@commerce-os/contracts";

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
  /** TODO-155.1 — compareAt (liste/showroom fiyati); yoksa/≤fiyat null. Kart ustu-cizili + indirim% icin. */
  compareAtMinor: number | null;
  currency: string;
  available: number | null;
  /**
   * TODO-155.1 — EU Omnibus: bu varyantin son 30 gundeki en dusuk SATIS fiyati (data katmani
   * `ProductPriceChange` groupBy'dan doldurur; `now`-pencere data katmaninda cozulur → builder SAF kalir).
   * Yoksa null. Yalniz indirim aktifken karta yansir.
   */
  lowestRecentPriceMinor: number | null;
  /**
   * TODO-155.1 — Bu varyantin media-tanimlayici eksendeki (Renk) option id'si; urunun media-ekseni yoksa
   * ya da varyantin o eksende degeri yoksa null. Swatch "aktif varyanti olan renk" filtresi + default swatch icin.
   */
  mediaOptionId: string | null;
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

/**
 * TODO-155.2 — Varyant EKSEN option değeri (ProductVariantOptionValue; ADR-072). variantDefining+filterable
 * bir attribute'un facet kaynağı: swatch'ı besleyen aynı eksen seçimleri. VariantAttributeValue (Faz 2A)
 * boş olsa da varyant eksen seçimi burada durur → facet bu kaynaktan da türetilir (kök boşluk düzeltmesi).
 * Yalnız ACTIVE varyanta bağlı satırlar yüklenir (data katmanı); option ARCHIVED ise builder eler.
 */
export interface SearchSourceVariantOptionValue {
  attributeDefinitionId: string;
  option: SearchOptionRef;
}

/**
 * TODO-155.1 — Bir ürün görseli (ProductImage + MediaAsset join). `storageKey` IÇ alandir (public url
 * runtime'da resolveMediaUrl ile turetilir; DTO'ya SIZMAZ). `optionId` = media-tanimlayici eksen (Renk)
 * option'i; null = paylasilan (tum varyant gruplarinda). `position` ASC = kapak sirasi.
 */
export interface SearchSourceImage {
  mediaId: string;
  storageKey: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  position: number;
  optionId: string | null;
  attributeDefinitionId: string | null;
}

/** TODO-155.1 — Media-tanimlayici eksen (Renk) option'i (swatch meta). ARCHIVED option swatch'a GIRMEZ. */
export interface SearchSourceMediaOption {
  id: string;
  value: string;
  label: string;
  colorHex: string | null;
  sortOrder: number;
  status: SearchAttributeStatus;
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
  /** TODO-155.2 — variantDefining+filterable eksen option seçimleri (ProductVariantOptionValue). Facet kaynağı. */
  variantOptionValues: SearchSourceVariantOptionValue[];
  /**
   * TODO-155.2 — Ürünün TÜM kategori üyelikleri (kampanya kapsamı eşleşmesi; scope = productIds VEYA
   * categoryIds kesişimi). primaryCategoryId dahil; boş = kapsamsız kampanya yine uygulanır (tüm ürünler).
   */
  categoryIds: string[];
  /**
   * TODO-155.2 — Bu mağazanın rozet-üretebilir aktif public kampanyaları (store-seviyesi; her ürün için AYNI
   * referans — data katmanı bir kez yükler). Builder `selectIndexableCampaignSnapshot` ile en ucuz varyant
   * fiyatı üzerinden rozet snapshot'ı üretir (PDP ile aynı formül).
   */
  campaigns: CampaignRecord[];
  /** TODO-155.2 — Snapshot değerlendirme anı (data katmanı `new Date()`; builder SAF kalır → deterministik). */
  evaluationNow: Date;
  /** TODO-155.1 — Media-tanimlayici eksen (Renk) definition id'si; null = klasik galeri (swatch yok). */
  mediaDefiningAttributeId: string | null;
  /** TODO-155.1 — Urun galerisi (ProductImage + MediaAsset); position ASC. Kart primary/secondary + swatch kapak. */
  images: SearchSourceImage[];
  /** TODO-155.1 — Media ekseni option meta'si (swatch label/colorHex/sortOrder/status). */
  mediaAxisOptions: SearchSourceMediaOption[];
}

// ── Builder çıktısı — data katmanının DB'ye yazdığı denormalize satırlar ──

export type SearchAvailability = "IN_STOCK" | "OUT_OF_STOCK";

/**
 * TODO-155.1 — Kart görseli (IÇ storageKey + boyut). Public url route'ta resolveMediaUrl ile turetilir;
 * `storageKey` DTO'ya SIZMAZ. width/height varsa layout/placeholder (CLS) icin tasinir.
 */
export interface SearchListingImage {
  storageKey: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

/** TODO-155.1 — Tek swatch (media-tanimlayici eksen değeri). `image` yoksa route primaryImage'e fallback eder. */
export interface SearchListingSwatch {
  optionId: string;
  label: string;
  colorHex: string | null;
  isDefault: boolean;
  image: SearchListingImage | null;
}

/**
 * TODO-155.1 — BOUNDED kart medya/swatch projection'i (ProductSearchDocument.listing jsonb). Yalniz kart
 * gorunumu; tam galeri/variant payload DEGIL. swatches bounded (MAX_LISTING_SWATCHES); `swatchTotalCount`
 * tam sayidir (>swatches.length ise vitrin "+N" gosterir).
 */
export interface SearchListingProjection {
  primaryImage: SearchListingImage | null;
  secondaryImage: SearchListingImage | null;
  swatches: SearchListingSwatch[];
  swatchTotalCount: number;
}

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
  // TODO-155.1 — Listing projection (kart ticari + medya snapshot'i; hepsi türetilmiş, source-of-truth değil).
  compareAtMinor: number | null;
  discountPercent: number | null;
  omnibusPreviousPriceMinor: number | null;
  listing: SearchListingProjection | null;
  // TODO-155.2 — Kampanya rozeti snapshot'ı (public-safe) + kazanan kampanya geçerlilik penceresi.
  campaign: PublicCampaignBadge | null;
  campaignStartsAt: Date | null;
  campaignEndsAt: Date | null;
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
  // TODO-155.1 — Listing projection (read-model snapshot; kart bunu ikinci hydration turu OLMADAN render eder).
  // `listing.*.storageKey` IÇ alandir; api-gateway route public url'e cevirir (DTO'ya storageKey sizmaz).
  compareAtMinor: number | null;
  discountPercent: number | null;
  omnibusPreviousPriceMinor: number | null;
  listing: SearchListingProjection | null;
  // TODO-155.2 — Kampanya rozeti snapshot'ı (read-time bastırma UYGULANMIŞ; süresi geçmişse null döner).
  campaign: PublicCampaignBadge | null;
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

// ── AUTOCOMPLETE / SUGGEST PORT (TODO-156E · Faz 2C-8E) — HAFİF discovery kontratı ──
//
// Autocomplete AYRI, hafif bir sorgu yoludur: tam `search` motorunu ÇAĞIRMAZ (facet/pagination/
// disjunctive count YOK). YALNIZ read-model'den (ProductSearchDocument + ProductCategory taksonomi)
// okur; bounded projection üretir. Provider-BAĞIMSIZDIR — PostgresSearchProvider ilk implementasyondur,
// gelecekte OpenSearchProvider AYNI `suggest` imzasını uygular (ADR-079 §upgrade-path). Girdiler
// URL-yüzeyli (ham q + bounded limitler); Postgres-özel değildir.

/** Normalize edilmiş autocomplete isteği (gateway parser → provider). Tüm limitler bounded. */
export interface SuggestQuery {
  /** Serbest metin (ham; provider normalize eder). Çağıran min uzunluğu garanti eder (boş gelmez). */
  q: string;
  /** Ürün önerisi üst sınırı (bounded). */
  limitProducts: number;
  /** Kategori önerisi üst sınırı (bounded). */
  limitCategories: number;
  /** Marka önerisi üst sınırı (bounded). */
  limitBrands: number;
  /** Sorgu-tamamlama önerisi üst sınırı (bounded). */
  limitSuggestions: number;
}

/**
 * Tek autocomplete ürün önerisi — read-model doküman projeksiyonu (EAV/variant join YOK). TODO-156E UX:
 * autocomplete SATIN ALMA ekranı DEĞİL → fiyat/indirim/kampanya-fiyatı TAŞINMAZ (yalnız keşif). Zenginleştirme:
 * marka + kategori (route label'e çevirir) + kampanya ROZETİ (varlık + opsiyonel etiket; tutar YOK) + Yeni + stok.
 */
export interface SuggestProduct {
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  /** İÇ ana kategori id'si; route `resolveCategoryNames` ile görünen etikete çevirir (id DTO'ya SIZMAZ). */
  primaryCategoryId: string | null;
  availability: SearchAvailability;
  inStock: boolean;
  /** Kart kapak görseli (İÇ storageKey; route resolveMediaUrl ile public url'e çevirir — storageKey SIZMAZ). */
  image: SearchListingImage | null;
  /** Görüntülenebilir aktif kampanya var mı (read-time bastırma UYGULANMIŞ). Rozet gösterimi için; TUTAR taşımaz. */
  hasCampaign: boolean;
  /** Kampanya rozet etiketi (admin-kontrollü; yoksa null → UI jenerik "Kampanya" gösterir). İndirim tutarı DEĞİL. */
  campaignLabel: string | null;
  /** Ürün son NEW_WINDOW_DAYS içinde oluşturulduysa "Yeni" rozeti (productCreatedAt; deterministik). */
  isNew: boolean;
}

/** Tek marka önerisi + eşleşen ürün sayısı. */
export interface SuggestBrand {
  brand: string;
  productCount: number;
}

/** Bir kategori ata yolu düğümü (breadcrumb; kök→yaprak). */
export interface SuggestCategoryPathNode {
  slug: string;
  name: string;
}

/** Tek kategori önerisi + kök→yaprak breadcrumb (kendisi dahil). */
export interface SuggestCategory {
  id: string;
  slug: string;
  name: string;
  /** Kök→yaprak ata yolu (kategorinin kendisi son eleman). Breadcrumb sunumu için. */
  path: SuggestCategoryPathNode[];
}

/** Bir autocomplete isteğinin tam sonucu (4 grup). Tüm gruplar bounded + deterministik sıralı. */
export interface SuggestResult {
  /** Normalize edilmiş q yankısı (highlight/debug). */
  query: string;
  /** Sorgu-tamamlama önerileri (deterministik, tekilleştirilmiş, relevance sıralı). */
  suggestions: string[];
  products: SuggestProduct[];
  categories: SuggestCategory[];
  brands: SuggestBrand[];
  /** Eşleşen TOPLAM ürün sayısı (gösterilen `products` bounded; "tüm sonuçları görüntüle (N)" için). */
  total: number;
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
  /**
   * Public autocomplete / discovery önerileri (TODO-156E). AYRI HAFİF yol: tam `search` motorunu
   * ÇAĞIRMAZ (facet/pagination/count YOK). YALNIZ read-model'den (ProductSearchDocument) + kategori
   * taksonomisinden okur; bounded projection. Gelecekte OpenSearchProvider AYNI imzayı uygular.
   */
  suggest(storeId: string, query: SuggestQuery): Promise<SuggestResult>;
}
