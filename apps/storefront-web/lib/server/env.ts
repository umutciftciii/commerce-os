/**
 * Vitrin sunucu-tarafi yapilandirmasi. Bu modul YALNIZCA sunucuda calisir;
 * icindeki hicbir deger NEXT_PUBLIC_ ile baslamaz, dolayisiyla client bundle'a
 * girmez. Vitrin, katalog verisini gateway'in AUTH GEREKTIRMEYEN public-read
 * uclarindan okur (TD-032 / TODO-061); herhangi bir platform-admin kimligi,
 * login ya da token KULLANMAZ.
 */

/** Cozulecek demo mağaza slug'i (istemciden alinmaz; gateway store'u slug ile cozer). */
export function demoStoreSlug(): string {
  return process.env.STOREFRONT_DEMO_STORE_SLUG ?? "demo-store";
}
