import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontCtaKind, StorefrontPrice } from "./catalog-types";

/**
 * Saf etiket cozumleyiciler: makine-okunur CTA/fiyat enum'larini i18n
 * sozlugundeki gorunur metne cevirir. Istemci-guvenli (sunucu importu yok);
 * hem bilesenler hem testler kullanir. Boylece gorunur metin bilesenlerde
 * hardcoded olmaz.
 */
export function ctaLabel(kind: StorefrontCtaKind, t: StorefrontDictionary): string {
  switch (kind) {
    case "ADD_TO_CART":
      return t.cta.addToCart;
    case "BUY_NOW":
      return t.cta.buyNow;
    case "REQUEST_PRICE":
      return t.cta.requestPrice;
    case "BOOK_APPOINTMENT":
      return t.cta.bookAppointment;
    case "CONTACT_WHATSAPP":
      return t.cta.whatsapp;
    case "REQUEST_INFO":
    default:
      return t.cta.requestInfo;
  }
}

/**
 * Bir fiyat gorunumunun ana metnini cozer. amount/startingFrom -> bicimli tutar;
 * onRequest -> "fiyat sor" mesaji; hidden -> sade gizli mesaji. Sayisal fiyatin
 * gizli/talep modlarinda ASLA gosterilmemesini garanti eder.
 */
export function primaryPriceText(price: StorefrontPrice, t: StorefrontDictionary): string {
  switch (price.mode) {
    case "amount":
      return price.amountLabel ?? t.price.onRequest;
    case "startingFrom":
      return price.amountLabel ? format(t.price.startingFrom, { price: price.amountLabel }) : t.price.onRequest;
    case "onRequest":
      return t.price.onRequest;
    case "hidden":
    default:
      return t.price.hidden;
  }
}

/** Numerik fiyatin gosterilip gosterilmeyecegi (gizli/talep modunda gosterilmez). */
export function showsNumericPrice(price: StorefrontPrice): boolean {
  return (price.mode === "amount" || price.mode === "startingFrom") && price.amountLabel !== null;
}

/** Satis-modu insan-okunur etiketi (rozet/aciklama icin). */
export function salesModeLabel(salesMode: string, t: StorefrontDictionary): string {
  switch (salesMode) {
    case "ONLINE":
      return t.salesMode.online;
    case "INQUIRY":
      return t.salesMode.inquiry;
    case "APPOINTMENT":
      return t.salesMode.appointment;
    case "WHATSAPP":
      return t.salesMode.whatsapp;
    case "CATALOG_ONLY":
    default:
      return t.salesMode.catalogOnly;
  }
}
