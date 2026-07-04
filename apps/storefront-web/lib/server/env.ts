/**
 * Vitrin sunucu-tarafi yapilandirmasi. Bu modul YALNIZCA sunucuda calisir;
 * icindeki hicbir deger NEXT_PUBLIC_ ile baslamaz, dolayisiyla client bundle'a
 * girmez. Vitrin, katalog verisini gateway'in AUTH GEREKTIRMEYEN public-read
 * uclarindan okur (TD-032 / TODO-061); herhangi bir platform-admin kimligi,
 * login ya da token KULLANMAZ.
 */
import { optionalEnvString } from "@commerce-os/utils";

/**
 * Cozulecek demo mağaza slug'i (istemciden alinmaz; gateway store'u slug ile cozer).
 * TD-038: bos/whitespace `STOREFRONT_DEMO_STORE_SLUG` "yok" sayilir ve varsayilana duser.
 */
export function demoStoreSlug(): string {
  return optionalEnvString(process.env.STOREFRONT_DEMO_STORE_SLUG) ?? "demo-store";
}
