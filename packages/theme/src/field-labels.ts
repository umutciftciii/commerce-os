import type { CanonicalFieldPath } from "./override-policy.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Field Labels & Descriptions (TODO-164B · ADR-236)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Teknik token/slot isimleri ("primary", "surface", "muted", "productCard")
 * kullanıcıya GÖSTERİLMEZ. Bu modül her canonical alanı kullanıcı diline çevirir:
 * okunur etiket + açıklama + storefront'ta nerede kullanıldığı + preview highlight
 * hedefi (CSS değişkeni / slot data-attr).
 *
 * `previewTarget` — Store Admin "önizlemede göster" aksiyonunda storefront preview
 * iframe'ine postMessage ile gönderilir; preview dinleyici eşleşen bölgeyi kısa
 * süre highlight eder. `kind` hedefin türünü belirtir (css-var | slot | asset).
 *
 * SAF veri modülü.
 */

export interface FieldLabel {
  path: CanonicalFieldPath;
  labelTr: string;
  labelEn: string;
  descriptionTr: string;
  /** Storefront'ta somut kullanım örneği (TR). */
  usageTr: string;
  /** Preview highlight hedefi. */
  previewTarget: { kind: "css-var" | "slot" | "asset"; value: string };
}

export const FIELD_LABELS: Readonly<Record<CanonicalFieldPath, FieldLabel>> = {
  "brand.logo": {
    path: "brand.logo",
    labelTr: "Logo",
    labelEn: "Logo",
    descriptionTr: "Mağaza logonuz. Başlık ve fatura/e-postalarda görünür.",
    usageTr: "Üst menü (header) sol köşe.",
    previewTarget: { kind: "asset", value: "logo" },
  },
  "brand.favicon": {
    path: "brand.favicon",
    labelTr: "Site simgesi (favicon)",
    labelEn: "Favicon",
    descriptionTr: "Tarayıcı sekmesinde görünen küçük simge.",
    usageTr: "Tarayıcı sekmesi.",
    previewTarget: { kind: "asset", value: "favicon" },
  },
  "brand.primaryColor": {
    path: "brand.primaryColor",
    labelTr: "Ana buton rengi",
    labelEn: "Primary button color",
    descriptionTr: "Sepete ekle, Satın al ve ana CTA butonlarında kullanılır.",
    usageTr: "“Sepete ekle” ve “Satın al” butonları.",
    previewTarget: { kind: "css-var", value: "--accent" },
  },
  "brand.accentColor": {
    path: "brand.accentColor",
    labelTr: "Vurgu rengi",
    labelEn: "Accent color",
    descriptionTr: "Öne çıkan rozet, etiket ve ikincil vurgularda kullanılır.",
    usageTr: "İndirim rozetleri, bölüm başlığı aksanı.",
    previewTarget: { kind: "css-var", value: "--accent" },
  },
  "color.background": {
    path: "color.background",
    labelTr: "Sayfa zemini",
    labelEn: "Page background",
    descriptionTr: "Sayfanın genel arka plan rengi.",
    usageTr: "Tüm sayfaların zemini.",
    previewTarget: { kind: "css-var", value: "--paper" },
  },
  "color.surface": {
    path: "color.surface",
    labelTr: "Kart zemini",
    labelEn: "Card background",
    descriptionTr: "Ürün kartları ve panellerin arka planı.",
    usageTr: "Ürün kartları, formlar, paneller.",
    previewTarget: { kind: "css-var", value: "--surface" },
  },
  "color.surfaceMuted": {
    path: "color.surfaceMuted",
    labelTr: "İkincil yüzey",
    labelEn: "Secondary surface",
    descriptionTr: "Yumuşak/soluk arka planlar (bölüm ayrımı).",
    usageTr: "Bölüm arası şeritler, sekmeler.",
    previewTarget: { kind: "css-var", value: "--surface-muted" },
  },
  "color.textPrimary": {
    path: "color.textPrimary",
    labelTr: "Ana metin",
    labelEn: "Primary text",
    descriptionTr: "Başlıklar ve gövde metninin ana rengi.",
    usageTr: "Ürün adı, başlıklar, fiyat.",
    previewTarget: { kind: "css-var", value: "--ink" },
  },
  "color.textSecondary": {
    path: "color.textSecondary",
    labelTr: "İkincil metin",
    labelEn: "Secondary text",
    descriptionTr: "Açıklama ve yardımcı metinlerin rengi.",
    usageTr: "Ürün açıklaması, yardımcı notlar.",
    previewTarget: { kind: "css-var", value: "--ink-muted" },
  },
  "color.border": {
    path: "color.border",
    labelTr: "Kenarlık",
    labelEn: "Border",
    descriptionTr: "Kart, form ve ayraç kenarlık rengi.",
    usageTr: "Kart çerçeveleri, form alanları.",
    previewTarget: { kind: "css-var", value: "--line" },
  },
  "color.link": {
    path: "color.link",
    labelTr: "Link ve vurgu rengi",
    labelEn: "Link color",
    descriptionTr: "Metin bağlantıları ve tıklanabilir vurgular.",
    usageTr: "Menü bağlantıları, “devamını oku”.",
    previewTarget: { kind: "css-var", value: "--accent" },
  },
  "color.success": {
    path: "color.success",
    labelTr: "Başarı",
    labelEn: "Success",
    descriptionTr: "Olumlu durum ve onay mesajları.",
    usageTr: "“Sepete eklendi”, stok var.",
    previewTarget: { kind: "css-var", value: "--ds-feedback-success" },
  },
  "color.warning": {
    path: "color.warning",
    labelTr: "Uyarı",
    labelEn: "Warning",
    descriptionTr: "Dikkat gerektiren uyarı mesajları.",
    usageTr: "Son birkaç ürün, düşük stok.",
    previewTarget: { kind: "css-var", value: "--ds-feedback-warning" },
  },
  "color.error": {
    path: "color.error",
    labelTr: "Hata",
    labelEn: "Error",
    descriptionTr: "Hata ve olumsuz durum mesajları.",
    usageTr: "Form hataları, ödeme başarısız.",
    previewTarget: { kind: "css-var", value: "--ds-feedback-error" },
  },
  "color.focus": {
    path: "color.focus",
    labelTr: "Odak rengi",
    labelEn: "Focus color",
    descriptionTr: "Klavye ile gezinirken odak halkası rengi (erişilebilirlik).",
    usageTr: "Buton/alan odak çerçevesi.",
    previewTarget: { kind: "css-var", value: "--line-strong" },
  },
  "typography.headingFont": {
    path: "typography.headingFont",
    labelTr: "Başlık yazı tipi",
    labelEn: "Heading font",
    descriptionTr: "Başlık ve vurgulu metinlerin yazı tipi.",
    usageTr: "Sayfa başlıkları, ürün adı.",
    previewTarget: { kind: "css-var", value: "--font-serif" },
  },
  "typography.bodyFont": {
    path: "typography.bodyFont",
    labelTr: "Gövde yazı tipi",
    labelEn: "Body font",
    descriptionTr: "Paragraf ve genel metinlerin yazı tipi.",
    usageTr: "Ürün açıklaması, gövde metni.",
    previewTarget: { kind: "css-var", value: "--font-sans" },
  },
  "typography.baseSize": {
    path: "typography.baseSize",
    labelTr: "Temel yazı boyutu",
    labelEn: "Base font size",
    descriptionTr: "Gövde metninin temel boyutu (okunabilirlik).",
    usageTr: "Genel metin boyutu.",
    previewTarget: { kind: "css-var", value: "--tb-base-size" },
  },
  "slot.header": {
    path: "slot.header",
    labelTr: "Üst menü düzeni",
    labelEn: "Header layout",
    descriptionTr: "Üst menünün yerleşim biçimi.",
    usageTr: "Sayfa üstü menü.",
    previewTarget: { kind: "slot", value: "header" },
  },
  "slot.footer": {
    path: "slot.footer",
    labelTr: "Alt bilgi düzeni",
    labelEn: "Footer layout",
    descriptionTr: "Sayfa altı bilgi alanının biçimi.",
    usageTr: "Sayfa altı (footer).",
    previewTarget: { kind: "slot", value: "footer" },
  },
  "slot.productCard": {
    path: "slot.productCard",
    labelTr: "Ürün kartı düzeni",
    labelEn: "Product card layout",
    descriptionTr: "Ürün kartlarının görsel yoğunluğu ve biçimi.",
    usageTr: "Listeleme sayfası ürün kartları.",
    previewTarget: { kind: "slot", value: "productCard" },
  },
  "slot.productDetailLayout": {
    path: "slot.productDetailLayout",
    labelTr: "Ürün sayfası düzeni",
    labelEn: "Product page layout",
    descriptionTr: "Ürün detay sayfasının yerleşim biçimi.",
    usageTr: "Ürün detay (PDP).",
    previewTarget: { kind: "slot", value: "productDetailLayout" },
  },
  "slot.productListingLayout": {
    path: "slot.productListingLayout",
    labelTr: "Listeleme düzeni",
    labelEn: "Listing layout",
    descriptionTr: "Ürün listeleme ızgarasının biçimi.",
    usageTr: "Kategori/listeleme (PLP).",
    previewTarget: { kind: "slot", value: "productListingLayout" },
  },
  "slot.hero": {
    path: "slot.hero",
    labelTr: "Vitrin (hero) düzeni",
    labelEn: "Hero layout",
    descriptionTr: "Ana sayfa vitrin alanının biçimi.",
    usageTr: "Ana sayfa üst vitrin.",
    previewTarget: { kind: "slot", value: "hero" },
  },
  "slot.homeSectionFrame": {
    path: "slot.homeSectionFrame",
    labelTr: "Ana sayfa bölüm çerçevesi",
    labelEn: "Home section frame",
    descriptionTr: "Ana sayfa bölümlerinin çerçeve/boşluk biçimi.",
    usageTr: "Ana sayfa bölümleri.",
    previewTarget: { kind: "slot", value: "homeSectionFrame" },
  },
  "responsive.mobileNavigation": {
    path: "responsive.mobileNavigation",
    labelTr: "Mobil menü",
    labelEn: "Mobile navigation",
    descriptionTr: "Mobil cihazlarda menü davranışı.",
    usageTr: "Mobilde gezinme menüsü.",
    previewTarget: { kind: "slot", value: "mobileNavigation" },
  },
  layoutPreset: {
    path: "layoutPreset",
    labelTr: "Hazır düzen",
    labelEn: "Layout preset",
    descriptionTr: "Mağazanın genel yerleşim şablonu.",
    usageTr: "Tüm sayfaların genel düzeni.",
    previewTarget: { kind: "slot", value: "layoutPreset" },
  },
};

export function getFieldLabel(path: CanonicalFieldPath): FieldLabel {
  return FIELD_LABELS[path];
}

export function listFieldLabels(): FieldLabel[] {
  return Object.values(FIELD_LABELS);
}
