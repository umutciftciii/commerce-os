/**
 * Demo vitrin katalogu icin ince adaptor.
 *
 * YALNIZCA YER TUTUCU — arkasinda gercek urun, fiyat veya stok yoktur. Gorunur
 * urun metinleri (isim, kategori, fiyat etiketi, aciklama) i18n sozlugunden
 * gelir; bu modul yalnizca sayfalarin kullandigi yardimcilari saglar. `handle`
 * sabit bir kimliktir ve cevrilmez. Gercek katalog verisi sonraki bir fazda
 * storefront/commerce servisleri tarafindan sunulacak.
 */
import { getDefaultDictionary } from "@commerce-os/i18n";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { getStorefrontDict } from "../lib/i18n";

export type SampleProduct = StorefrontDictionary["products"][number];

/** Aktif locale'deki demo urunler (sunucu; cookie'den cozulur). */
export async function getSampleProducts(): Promise<readonly SampleProduct[]> {
  return (await getStorefrontDict()).products;
}

export async function findSampleProduct(handle: string): Promise<SampleProduct | undefined> {
  return (await getSampleProducts()).find((product) => product.handle === handle);
}

/**
 * Statik route uretimi icin urun handle listesi. Handle'lar locale'den
 * bagimsizdir; bu yardimci cookie OKUMAZ ve `generateStaticParams` icinde
 * (istek baglami yokken) guvenle kullanilir.
 */
export function sampleProductHandles(): string[] {
  return getDefaultDictionary().storefront.products.map((product) => product.handle);
}
