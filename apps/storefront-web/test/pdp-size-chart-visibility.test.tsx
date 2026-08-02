// TODO-165B (recovery) — Buy box "Beden tablosu" görünürlüğü.
//
// Beden tablosu aksiyonu artık YALNIZ `fashion.sizeChart` varlığına bağlıdır (axis-kind bağımsız):
//   • size ekseni VAR    → tablo düğmesi beden başlığının yanında,
//   • size ekseni YOK    → fashion bölümü başında BAĞIMSIZ görünür,
//   • sizeChart NULL     → hiç görünmez.
// BuyBox client'tır (useRouter + Server Action); statik markup smoke'unda yalnız ilk render kontrol
// edilir (SizeChartModal kapalıyken null döner → "Beden tablosu" metni yalnız düğmeden gelir).
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
  StorefrontFashionSizeChart,
  StorefrontFashionView,
  StorefrontProductDetail,
  StorefrontVariantView,
} from "../lib/catalog-types";

const t = getDictionary("tr").storefront;
const SIZE_GUIDE = t.detail.fashion.sizeGuide; // "Beden tablosu"

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
const AXIS2 = "attr-axis2";

const sizeChart: StorefrontFashionSizeChart = {
  id: "sc1",
  name: "Kadın Üst Beden Tablosu",
  sizeSystemKey: "INTERNATIONAL",
  measurementUnit: "cm",
  columns: [{ key: "chest", label: "Göğüs" }],
  rows: [
    { size: "S", cells: { chest: "90" } },
    { size: "M", cells: { chest: "96" } },
  ],
};

function variants(): StorefrontVariantView[] {
  return [
    { id: "v-blk-1", title: "Siyah / 1", sku: "SKU-BLK-1", priceLabel: "₺100,00", compareAtLabel: null, priceMinor: 10000, compareAtMinor: null, currency: "TRY", available: 10, inStock: true, mediaOptionId: null },
    { id: "v-blk-2", title: "Siyah / 2", sku: "SKU-BLK-2", priceLabel: "₺100,00", compareAtLabel: null, priceMinor: 10000, compareAtMinor: null, currency: "TRY", available: 10, inStock: true, mediaOptionId: null },
    { id: "v-blu-1", title: "Mavi / 1", sku: "SKU-BLU-1", priceLabel: "₺120,00", compareAtLabel: null, priceMinor: 12000, compareAtMinor: null, currency: "TRY", available: 10, inStock: true, mediaOptionId: null },
    { id: "v-blu-2", title: "Mavi / 2", sku: "SKU-BLU-2", priceLabel: "₺120,00", compareAtLabel: null, priceMinor: 12000, compareAtMinor: null, currency: "TRY", available: 10, inStock: true, mediaOptionId: null },
  ];
}

// İkinci eksen `kind` parametrik: "size" → tablo düğmesi beden başlığı yanında;
// "other" → beden ekseni YOK → tablo düğmesi bağımsız.
function fashion(secondKind: "size" | "other", chart: StorefrontFashionSizeChart | null): StorefrontFashionView {
  return {
    optionAxes: [
      {
        attributeDefinitionId: COLOR,
        code: "fashion.color",
        name: "Renk",
        dataType: "COLOR",
        kind: "color",
        options: [
          { optionId: "c-blk", value: "black", label: "Siyah", colorHex: "#111", colorFamily: "black", order: 0, startingPriceMinor: 10000, compareAtMinor: null, priceCurrency: "TRY", inStock: true },
          { optionId: "c-blu", value: "blue", label: "Mavi", colorHex: "#00f", colorFamily: "blue", order: 1, startingPriceMinor: 12000, compareAtMinor: null, priceCurrency: "TRY", inStock: true },
        ],
      },
      {
        attributeDefinitionId: AXIS2,
        code: secondKind === "size" ? "fashion.size" : "fashion.fit",
        name: secondKind === "size" ? "Beden" : "Kalıp",
        dataType: "SELECT",
        kind: secondKind,
        options: [
          { optionId: "o-1", value: "1", label: "1", colorHex: null, colorFamily: null, order: 0, startingPriceMinor: 10000, compareAtMinor: null, priceCurrency: "TRY", inStock: true },
          { optionId: "o-2", value: "2", label: "2", colorHex: null, colorFamily: null, order: 1, startingPriceMinor: 10000, compareAtMinor: null, priceCurrency: "TRY", inStock: true },
        ],
      },
    ],
    variantAxisOptions: [
      { variantId: "v-blk-1", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blk" }, { attributeDefinitionId: AXIS2, optionId: "o-1" }] },
      { variantId: "v-blk-2", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blk" }, { attributeDefinitionId: AXIS2, optionId: "o-2" }] },
      { variantId: "v-blu-1", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blu" }, { attributeDefinitionId: AXIS2, optionId: "o-1" }] },
      { variantId: "v-blu-2", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-blu" }, { attributeDefinitionId: AXIS2, optionId: "o-2" }] },
    ],
    attributes: [],
    sizeSystemKey: "INTERNATIONAL",
    sizeChart: chart,
  };
}

function detail(fashionView: StorefrontFashionView): StorefrontProductDetail {
  return {
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
    sku: "SKU-BLK-1",
    variants: variants(),
    callToActionLabel: null,
    whatsappMessageTemplate: null,
    inquiryFormTitle: null,
    appointmentNote: null,
    images: [],
    mediaDefiningAttributeId: null,
    seoTitle: null,
    seoDescription: null,
    fashion: fashionView,
    related: [],
  };
}

function render(fashionView: StorefrontFashionView) {
  return renderToStaticMarkup(
    <PdpSelectionProvider defaultVariantId="v-blk-1">
      <BuyBox detail={detail(fashionView)} t={t} />
    </PdpSelectionProvider>,
  );
}

describe("BuyBox · beden tablosu görünürlüğü (TODO-165B)", () => {
  it("sizeChart DOLU + size ekseni VAR → tablo düğmesi görünür", () => {
    const html = render(fashion("size", sizeChart));
    expect(html).toContain(SIZE_GUIDE);
  });

  it("sizeChart DOLU + size ekseni YOK (yalnız renk/other eksen) → tablo düğmesi YİNE görünür (bağımsız)", () => {
    const html = render(fashion("other", sizeChart));
    expect(html).toContain(SIZE_GUIDE);
  });

  it("sizeChart NULL → tablo düğmesi görünmez", () => {
    const html = render(fashion("size", null));
    expect(html).not.toContain(SIZE_GUIDE);
  });
});
