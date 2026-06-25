/**
 * Vitrin sunucu-tarafi yapilandirmasi. Bu modul YALNIZCA sunucuda calisir;
 * icindeki hicbir deger NEXT_PUBLIC_ ile baslamaz, dolayisiyla client bundle'a
 * girmez. Demo asamasinda gateway'de public katalog ucu olmadigindan vitrin,
 * platform-admin kimligiyle sunucu-tarafinda oturum acar (bkz.
 * docs/TECHNICAL_DEBT.md — F3A gecici resolver). Kimlik bilgileri ve token
 * istemciye asla sizmaz.
 */

/** Cozulecek demo mağaza slug'i (istemciden alinmaz). */
export function demoStoreSlug(): string {
  return process.env.STOREFRONT_DEMO_STORE_SLUG ?? "demo-store";
}

/**
 * Vitrin sunucu kimligi. Seed edilen demo platform admin'e duser; uretimde
 * dusuk yetkili, public-read amacli bir kimlikle degistirilmelidir (TODO/TD).
 */
export function storefrontPlatformCredentials(): { email: string; password: string } {
  return {
    email: process.env.STOREFRONT_PLATFORM_EMAIL ?? "platform-admin@example.local",
    password: process.env.STOREFRONT_PLATFORM_PASSWORD ?? "local-admin-password",
  };
}
