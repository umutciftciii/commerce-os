/**
 * Client-safe dogrulama alt-modulu. `@commerce-os/contracts/validators` saf
 * yardimcilarini (TCKN/VKN/IBAN/TR-telefon + kart) oldugu gibi re-export eder.
 *
 * ONEMLI: Bu dosya bilincli olarak `./index.ts`'ten (ve dolayisiyla gateway'e
 * baglanan API istemci fabrikasindan) BAGIMSIZDIR. Vitrin "use client"
 * component'leri bu alt-modulu (`@commerce-os/api-client/validators`) kullanarak
 * dogrulama yardimcilarini alir; boylece o fabrika client bundle'a SIZMAZ.
 * NOT: Fabrika adi (bundle sentinel grep token'i) yorumda literal yazilmaz;
 * aksi halde minify edilmeyen yorumlar sentinel'i yanlis tetikleyebilir.
 */
export * from "@commerce-os/contracts/validators";
