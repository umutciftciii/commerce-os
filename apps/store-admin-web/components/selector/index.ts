/**
 * TODO-159B (ADR-090) — Admin Searchable Selector ortak yüzeyi.
 *
 * Seçim yapan her ekran YALNIZ buradan import eder: arama motoru + seçili-çözüm
 * önbelleği + alan/modal bileşenleri + katalog kaynakları. Ekran başına ayrı
 * arama/sayfalama çözümü YAZILMAZ.
 */
export { useSelectorSearch, useSelectedItems } from "./use-selector-search";
export type {
  SelectorFetchParams,
  SelectorPage,
  SelectorPagination,
  SelectorSource,
  SelectorStatus,
  SelectorSearchState,
  SelectedItemsState,
} from "./use-selector-search";
export { EntitySelectorField, EntitySelectorModal } from "./entity-selector";
export type {
  EntitySelectorFieldProps,
  EntitySelectorLabels,
  EntitySelectorModalProps,
  SelectorPresenter,
} from "./entity-selector";
export {
  buildSelectorLabels,
  useBrandSelectorBinding,
  useCategorySelectorBinding,
  useProductSelectorBinding,
  useSizeChartSelectorBinding,
} from "./catalog-sources";
export type {
  BrandSelectorBinding,
  CategorySelectorBinding,
  ProductSelectorBinding,
  SizeChartSelectorBinding,
} from "./catalog-sources";
