/**
 * Client-safe dogrulama alt-modulu. `@commerce-os/contracts/validators` saf
 * yardimcilarini (TCKN/VKN/IBAN/TR-telefon + kart) oldugu gibi re-export eder.
 *
 * ONEMLI: Bu dosya bilincli olarak `./index.ts`'ten (ve dolayisiyla
 * `createApiClient`'tan) BAGIMSIZDIR. Vitrin "use client" component'leri bu
 * alt-modulu (`@commerce-os/api-client/validators`) kullanarak dogrulama
 * yardimcilarini alir; boylece gateway'e baglanan `createApiClient` client
 * bundle'a SIZMAZ.
 */
export * from "@commerce-os/contracts/validators";
