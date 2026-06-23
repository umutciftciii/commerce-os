/**
 * Tarih bicimlendirme. Varsayilan urun dili Turkce oldugundan tr-TR locale
 * kullanilir (runtime locale switcher sonraki faza birakildi).
 */
const dateFormatter = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}
