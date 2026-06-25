import type {
  ProductPriceVisibility,
  ProductSalesMode,
  ProductPrimaryAction,
} from "@commerce-os/api-client";
import type { PriceDisplayMode, ProductCommerceView } from "./catalog-types";

/**
 * Satis-modeli -> vitrin davranisi turetimi (F3A CTA mapping). Saf, locale'den
 * bagimsiz fonksiyon: yalnizca enum/bayrak doner, gorunur metin URETMEZ. Gateway
 * kontrati salesMode/priceVisibility/primaryAction tutarliligini garanti eder
 * (bkz. packages/contracts isConsistentSalesModel); burada yine de her satis
 * modu icin guvenli, ongorulebilir bir gorunum uretilir.
 */
export interface SalesModelInput {
  salesMode: ProductSalesMode;
  priceVisibility: ProductPriceVisibility;
  primaryAction: ProductPrimaryAction;
  purchasable: boolean;
  whatsappEnabled: boolean;
  inquiryEnabled: boolean;
  appointmentRequired: boolean;
  minOrderQuantity: number;
  maxOrderQuantity: number | null;
}

/** priceVisibility -> fiyat gosterim modu. */
export function derivePriceMode(visibility: ProductPriceVisibility): PriceDisplayMode {
  switch (visibility) {
    case "VISIBLE":
      return "amount";
    case "STARTING_FROM":
      return "startingFrom";
    case "ON_REQUEST":
      return "onRequest";
    case "HIDDEN":
      return "hidden";
    default:
      return "hidden";
  }
}

/**
 * Bir urunun satis-modeline gore vitrin CTA/fiyat gorunumunu turetir. ONLINE
 * disindaki tum modlarda satin alma (sepete ekle/adet) kapalidir.
 */
export function deriveProductCommerceView(input: SalesModelInput): ProductCommerceView {
  const priceMode = derivePriceMode(input.priceVisibility);
  const base = {
    salesMode: input.salesMode,
    priceVisibility: input.priceVisibility,
    priceMode,
    minQuantity: input.minOrderQuantity,
    maxQuantity: input.maxOrderQuantity,
    showWhatsappTemplate: false,
    showInquiry: false,
    showAppointmentNote: false,
  } as const;

  switch (input.salesMode) {
    case "ONLINE": {
      const purchasable = input.purchasable;
      return {
        ...base,
        purchasable,
        showQuantity: purchasable,
        primaryCta: "ADD_TO_CART",
        primaryCtaDisabled: !purchasable,
        secondaryCta: purchasable ? "BUY_NOW" : null,
      };
    }
    case "INQUIRY":
      return {
        ...base,
        purchasable: false,
        showQuantity: false,
        primaryCta: "REQUEST_PRICE",
        primaryCtaDisabled: false,
        secondaryCta: null,
        showInquiry: true,
      };
    case "APPOINTMENT":
      return {
        ...base,
        purchasable: false,
        showQuantity: false,
        primaryCta: "BOOK_APPOINTMENT",
        primaryCtaDisabled: false,
        secondaryCta: null,
        showAppointmentNote: true,
      };
    case "WHATSAPP":
      return {
        ...base,
        purchasable: false,
        showQuantity: false,
        primaryCta: "CONTACT_WHATSAPP",
        primaryCtaDisabled: false,
        secondaryCta: null,
        showWhatsappTemplate: input.whatsappEnabled,
      };
    case "CATALOG_ONLY":
    default:
      return {
        ...base,
        purchasable: false,
        showQuantity: false,
        primaryCta: "REQUEST_INFO",
        // primaryAction NONE ise satin alma/iletisim aksiyonu yok -> pasif CTA.
        primaryCtaDisabled: input.primaryAction === "NONE",
        secondaryCta: null,
      };
  }
}
