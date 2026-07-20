/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Component Variant Catalog (ADR-087)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Her bileşenin desteklenen görsel varyantları. UI ilk fazda hepsini render
 * ETMEK zorunda değildir; MİMARİ destekler (ThemeDocument.components[x].variant
 * bir değer seçer). Yeni varyant = katalog dizisine bir değer (migration YOK).
 */
export const COMPONENT_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  button: ["filled", "outline", "soft", "ghost"],
  card: ["flat", "elevated", "glass", "minimal"],
  badge: ["solid", "soft", "outline"],
  input: ["outline", "filled", "underline"],
  navbar: ["transparent", "solid", "floating"],
  footer: ["solid", "minimal"],
  hero: ["full", "editorial", "split"],
  productCard: ["compact", "comfortable", "premium"],
  categoryCard: ["compact", "comfortable", "overlay"],
  sectionTitle: ["editorial", "centered", "minimal"],
  modal: ["elevated", "glass"],
  drawer: ["solid", "glass"],
  toast: ["solid", "soft"],
  pagination: ["soft", "outline"],
  breadcrumb: ["minimal", "chevron"],
  filterChip: ["soft", "outline", "solid"],
};

/** İlk fazda Theme Engine'e taşınan bileşenler (storefront). */
export const THEMED_COMPONENTS = [
  "navbar",
  "footer",
  "hero",
  "button",
  "badge",
  "productCard",
  "categoryCard",
  "sectionTitle",
] as const;

export function componentVariants(component: string): readonly string[] {
  return COMPONENT_VARIANTS[component] ?? [];
}

export function isValidVariant(component: string, variant: string): boolean {
  return componentVariants(component).includes(variant);
}
