// TODO-165B (recovery) — Buy box fashion kart fiyat özeti.
//
// • Çok renkli ürün → renk kartlarında "başlayan" fiyat (startingAt); beden kartlarında fiyat
//   GÖSTERİLMEZ (kesin fiyat renk+beden seçilince buy-box'ta belirir).
// • Tek renkli ürün → renk bölümü hiç render edilmez; beden kartlarında kesin fiyat.
// • Stokta olmayan (OOS) seçenek → "Tükendi" (t.detail.fashion.soldOut) etiketi.
// BuyBox client'tır; statik ilk render kontrol edilir (fiyat/kart hesabı server-authoritative
// option özetinden gelir — formatMinor çıktısı "₺…" içerir).
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getDictionary } from "@commerce-os/i18n";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("../lib/server/cart-actions", () => ({
  addToCartAction: vi.fn(),
  claimCouponAction: vi.fn(),
}));

import { BuyBox } from "../components/buy-box";
import { PdpSelectionProvider } from "../components/pdp-selection";
import { deriveProductCommerceView } from "../lib/sales-model";
import type {
  StorefrontFashionOption,
  StorefrontFashionView,
  StorefrontProductDetail,
  StorefrontVariantView,
} from "../lib/catalog-types";

const t = getDictionary("tr").storefront;
const SOLD_OUT = t.detail.fashion.soldOut; // "Tükendi"

const onlineSales = {
  salesMode: "ONLINE",
  priceVisibility: "VISIBLE",
  primaryAction: "ADD_TO_CART",
  purchasable: true,
  whatsappEnabled: false,
  inquiryEnabled: false,
  appointmentRequired: false,
  minOrderQuantity: 1,
  maxOrderQuantity: null,
} as const;

const COLOR = "attr-color";
const SIZE = "attr-size";

function v(
  id: string,
  title: string,
  sku: string,
  priceMinor: number,
  inStock: boolean,
): StorefrontVariantView {
  return {
    id,
    title,
    sku,
    priceLabel: null,
    compareAtLabel: null,
    priceMinor,
    compareAtMinor: null,
    currency: "TRY",
    available: inStock ? 10 : 0,
    inStock,
    mediaOptionId: null,
  };
}

function colorOption(
  optionId: string,
  label: string,
  startingPriceMinor: number | null,
  inStock: boolean,
): StorefrontFashionOption {
  return {
    optionId,
    value: label.toLowerCase(),
    label,
    colorHex: "#123456",
    colorFamily: label.toLowerCase(),
    order: 0,
    startingPriceMinor,
    compareAtMinor: null,
    priceCurrency: "TRY",
    inStock,
  };
}

function sizeOption(optionId: string, label: string, startingPriceMinor: number | null): StorefrontFashionOption {
  return {
    optionId,
    value: label,
    label,
    colorHex: null,
    colorFamily: null,
    order: 0,
    startingPriceMinor,
    compareAtMinor: null,
    priceCurrency: "TRY",
    inStock: true,
  };
}

function detail(fashion: StorefrontFashionView, variants: StorefrontVariantView[], defaultVariantId: string) {
  const d: StorefrontProductDetail = {
    id: "prod-1",
    handle: "prod-1",
    title: "Moda Ürünü",
    brand: null,
    categoryLabel: null,
    coverUrl: null,
    price: { mode: "amount", amountLabel: "₺100,00", compareAtLabel: null, lowestRecentLabel: null },
    commerce: deriveProductCommerceView(onlineSales),
    badgeKind: null,
    campaign: null,
    secondaryCoupon: null,
    description: null,
    sku: variants[0].sku,
    variants,
    callToActionLabel: null,
    whatsappMessageTemplate: null,
    inquiryFormTitle: null,
    appointmentNote: null,
    images: [],
    mediaDefiningAttributeId: null,
    seoTitle: null,
    seoDescription: null,
    fashion,
    related: [],
  };
  return renderToStaticMarkup(
    <PdpSelectionProvider defaultVariantId={defaultVariantId}>
      <BuyBox detail={d} t={t} />
    </PdpSelectionProvider>,
  );
}

describe("BuyBox · fashion kart fiyatları (TODO-165B)", () => {
  it("çok renkli ürün → renk kartlarında başlangıç fiyatı görünür", () => {
    const fashion: StorefrontFashionView = {
      optionAxes: [
        {
          attributeDefinitionId: COLOR,
          code: "fashion.color",
          name: "Renk",
          dataType: "COLOR",
          kind: "color",
          options: [colorOption("c-blk", "Siyah", 10000, true), colorOption("c-blu", "Mavi", 12000, true)],
        },
        {
          attributeDefinitionId: SIZE,
          code: "fashion.size",
          name: "Beden",
          dataType: "SELECT",
          kind: "size",
          options: [sizeOption("s-S", "S", 10000), sizeOption("s-M", "M", 10000)],
        },
      ],
      variantAxisOptions: [
        { variantId: "v1", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blk" }, { attributeDefinitionId: SIZE, optionId: "s-S" }] },
        { variantId: "v2", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blk" }, { attributeDefinitionId: SIZE, optionId: "s-M" }] },
        { variantId: "v3", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blu" }, { attributeDefinitionId: SIZE, optionId: "s-S" }] },
        { variantId: "v4", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blu" }, { attributeDefinitionId: SIZE, optionId: "s-M" }] },
      ],
      attributes: [],
      sizeSystemKey: "INTERNATIONAL",
      sizeChart: null,
    };
    const variants = [
      v("v1", "Siyah / S", "SKU-BLK-S", 10000, true),
      v("v2", "Siyah / M", "SKU-BLK-M", 10000, true),
      v("v3", "Mavi / S", "SKU-BLU-S", 12000, true),
      v("v4", "Mavi / M", "SKU-BLU-M", 12000, true),
    ];
    const html = detail(fashion, variants, "v1");
    // Renk kartı "başlayan" fiyatı: startingAt("{price}’den") → "₺100,00’den" / "₺120,00’den".
    expect(html).toContain("₺100,00");
    expect(html).toContain("₺120,00");
    expect(html).toContain("’den"); // startingAt şablonu (kart fiyat özeti)
  });

  it("tek renkli ürün → renk bölümü render edilmez; beden kartlarında fiyat görünür", () => {
    const fashion: StorefrontFashionView = {
      optionAxes: [
        {
          attributeDefinitionId: COLOR,
          code: "fashion.color",
          name: "Renk",
          dataType: "COLOR",
          kind: "color",
          // Tek renk: kart dizisi gösterilmez. Ayırt edici etiket ("Bordo") → yokluğu doğrulanır.
          options: [colorOption("c-only", "Bordo", 15000, true)],
        },
        {
          attributeDefinitionId: SIZE,
          code: "fashion.size",
          name: "Beden",
          dataType: "SELECT",
          kind: "size",
          options: [sizeOption("s-S", "S", 15000), sizeOption("s-M", "M", 15000)],
        },
      ],
      variantAxisOptions: [
        { variantId: "v1", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-only" }, { attributeDefinitionId: SIZE, optionId: "s-S" }] },
        { variantId: "v2", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-only" }, { attributeDefinitionId: SIZE, optionId: "s-M" }] },
      ],
      attributes: [],
      sizeSystemKey: "INTERNATIONAL",
      sizeChart: null,
    };
    const variants = [
      v("v1", "Bordo / S", "SKU-BRD-S", 15000, true),
      v("v2", "Bordo / M", "SKU-BRD-M", 15000, true),
    ];
    const html = detail(fashion, variants, "v1");
    // Renk bölümü yok → renk etiketi kart olarak render edilmez.
    expect(html).not.toContain("Bordo");
    // Beden kartlarında kesin fiyat (formatMinor(15000) = "₺150,00").
    expect(html).toContain("₺150,00");
  });

  it("OOS seçenek → 'Tükendi' etiketi gösterilir", () => {
    const fashion: StorefrontFashionView = {
      optionAxes: [
        {
          attributeDefinitionId: COLOR,
          code: "fashion.color",
          name: "Renk",
          dataType: "COLOR",
          kind: "color",
          options: [colorOption("c-blk", "Siyah", 10000, true), colorOption("c-blu", "Mavi", null, false)],
        },
        {
          attributeDefinitionId: SIZE,
          code: "fashion.size",
          name: "Beden",
          dataType: "SELECT",
          kind: "size",
          options: [sizeOption("s-S", "S", 10000), sizeOption("s-M", "M", 10000)],
        },
      ],
      variantAxisOptions: [
        { variantId: "v1", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blk" }, { attributeDefinitionId: SIZE, optionId: "s-S" }] },
        { variantId: "v2", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blk" }, { attributeDefinitionId: SIZE, optionId: "s-M" }] },
        // Mavi rengin TÜM varyantları OOS → renk kartı "Tükendi".
        { variantId: "v3", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blu" }, { attributeDefinitionId: SIZE, optionId: "s-S" }] },
        { variantId: "v4", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blu" }, { attributeDefinitionId: SIZE, optionId: "s-M" }] },
      ],
      attributes: [],
      sizeSystemKey: "INTERNATIONAL",
      sizeChart: null,
    };
    const variants = [
      v("v1", "Siyah / S", "SKU-BLK-S", 10000, true),
      v("v2", "Siyah / M", "SKU-BLK-M", 10000, true),
      v("v3", "Mavi / S", "SKU-BLU-S", 12000, false),
      v("v4", "Mavi / M", "SKU-BLU-M", 12000, false),
    ];
    // Default = stokta olan bir varyant (seçili stok rozeti "Stokta" kalır → "Tükendi" yalnız OOS karttan).
    const html = detail(fashion, variants, "v1");
    expect(html).toContain(SOLD_OUT);
  });
});
