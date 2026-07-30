# packages/themes — Custom Theme Packages (TODO-164 · ADR-220)

Versiyonlanmış **presentation-only** custom theme paketleri. Her paket bir `manifest.json`
taşır ve YALNIZ izinli slot variant seçimi + token preset override eder.

## Sözleşme (invariant)

- **Business logic YOK.** Paket fiyat/stok/sepet/ödeme/sipariş/güvenlik mantığına dokunamaz;
  core'dan/müşteri klasöründen business logic import edemez.
- **Arbitrary kod YOK.** Manifest bildirimseldir (JSON); component/script enjekte edilmez.
- **Allowlist.** `slots` yalnız `supportedSlots` içindeki slotları ve slot registry'nin izin
  verdiği variant'ları kullanabilir. Bilinmeyen slot/variant server-side reddedilir.
- **Server-side doğrulama.** Manifest gateway'de `validateCustomThemePackage` ile denetlenir.
- **Registry üzerinden çözülür.** Bir paket ancak theme-key registry'ye kayıtlıysa çözülür;
  client bir `packageKey` uydurup override YAPAMAZ (sunucu-otoriter resolver).
- **Müşteri adı YOK.** `if store.slug === …` gibi koşullar yasaktır; paketler generic'tir.

## Bu fazdaki paket

- [`demo-aurora/`](./demo-aurora/manifest.json) — generic demo paket (PREMIUM_BOUTIQUE tabanlı).

Bir paket eklemek DB migration gerektirmez: `packages/theme/src/custom-package.ts`
`BUNDLED_CUSTOM_PACKAGES` dizisine manifest eklenir (kaynak-doğru orası), bu klasöre de
`manifest.json` belge/örnek kopyası konur.
