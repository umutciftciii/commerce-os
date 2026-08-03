import { cn } from "@commerce-os/ui";

/**
 * TODO-169 — Karakter sayacı (editoryel kit). İade açıklaması gibi sınırlı metin
 * alanlarında kalan/kullanılan karakter sayısını gösterir.
 *
 * Erişilebilirlik (§18): `aria-live="polite"` ile değişim duyurulur; sınır aşımında
 * yalnız renkle değil, metnin kendisi (kalan negatif) durumu taşır. `id` verilirse
 * ilgili textarea `aria-describedby` ile bu sayaca bağlanabilir.
 */
export function CharCounter({
  value,
  max,
  id,
  className,
}: {
  value: number;
  max: number;
  id?: string;
  className?: string;
}) {
  const over = value > max;
  return (
    <span
      id={id}
      aria-live="polite"
      className={cn(
        "block text-right text-[11px] tabular-nums tracking-wideish",
        over ? "font-medium text-red-600" : "text-ink-subtle",
        className,
      )}
    >
      {value}/{max}
    </span>
  );
}
