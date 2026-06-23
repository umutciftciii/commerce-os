/**
 * Demo vitrin katalogu icin ince adaptor.
 *
 * YALNIZCA YER TUTUCU — arkasinda gercek urun, fiyat veya stok yoktur. Gorunur
 * urun metinleri (isim, kategori, fiyat etiketi, aciklama) i18n sozlugunden
 * gelir; bu modul yalnizca sayfalarin kullandigi yardimcilari saglar. `handle`
 * sabit bir kimliktir ve cevrilmez. Gercek katalog verisi sonraki bir fazda
 * storefront/commerce servisleri tarafindan sunulacak.
 */
import { getStorefrontDict } from "../lib/i18n";
import type { StorefrontDictionary } from "@commerce-os/i18n";

export type SampleProduct = StorefrontDictionary["products"][number];

export function getSampleProducts(): readonly SampleProduct[] {
  return getStorefrontDict().products;
}

export function findSampleProduct(handle: string): SampleProduct | undefined {
  return getSampleProducts().find((product) => product.handle === handle);
}
