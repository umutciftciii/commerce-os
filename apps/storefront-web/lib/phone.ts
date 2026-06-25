/**
 * Turkiye telefon numarasi yardimcilari (F3B.1 UX). Saf modul (next bagimligi yok);
 * hem client form formatlama hem server-side normalize/validasyon kullanir. TR cep
 * numarasi: 10 hane, "5" ile baslar (or. 5XX XXX XX XX). 0/+90/90 onekleri tolere
 * edilir ve duzeltilir.
 */

/** Girdiden yalnizca rakamlari alip TR yerel 10 haneye indirger (onek temizler). */
export function trLocalDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("90")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** Display formati: "5XX XXX XX XX" (kismi girisleri de kademeli bicimler). */
export function formatTrPhone(raw: string): string {
  const d = trLocalDigits(raw);
  const parts: string[] = [];
  if (d.length > 0) parts.push(d.slice(0, 3));
  if (d.length > 3) parts.push(d.slice(3, 6));
  if (d.length > 6) parts.push(d.slice(6, 8));
  if (d.length > 8) parts.push(d.slice(8, 10));
  return parts.join(" ");
}

/** Gecerli bir TR cep numarasi mi? (10 hane, "5" ile baslar) */
export function isValidTrPhone(raw: string): boolean {
  const d = trLocalDigits(raw);
  return d.length === 10 && d.startsWith("5");
}

/**
 * Sunucuya gonderilecek kanonik bicim: "+90XXXXXXXXXX". Gecersizse null.
 */
export function normalizeTrPhone(raw: string): string | null {
  const d = trLocalDigits(raw);
  return d.length === 10 && d.startsWith("5") ? `+90${d}` : null;
}
