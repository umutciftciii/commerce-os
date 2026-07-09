import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@commerce-os/ui";

/**
 * Tipografi bilesenleri (ADIM 1). Tek kaynak hiyerarsi: serif (Playfair) buyuk
 * editoryel basliklar, sans (Inter) govde/etiket. Renk ve aile token'lardan gelir
 * (tema-edilebilir). Her bilesenin `as` prop'u ile semantik etiketi degistirilebilir.
 */
type BaseProps = HTMLAttributes<HTMLElement> & { as?: ElementType };

/** En buyuk vitrin basligi (hero). Serif, ince, sikisik kerning. */
export function Display({ as: Tag = "h1", className, ...props }: BaseProps) {
  return (
    <Tag
      className={cn(
        "font-serif text-4xl font-normal leading-[1.05] tracking-tightish text-ink sm:text-5xl lg:text-6xl",
        className,
      )}
      {...props}
    />
  );
}

/** Bolum basligi. Serif, orta-buyuk. */
export function Heading({ as: Tag = "h2", className, ...props }: BaseProps) {
  return (
    <Tag
      className={cn(
        "font-serif text-2xl font-normal leading-tight tracking-tightish text-ink sm:text-3xl",
        className,
      )}
      {...props}
    />
  );
}

/** Alt baslik / kart basligi. Sans, orta agirlik. */
export function Subheading({ as: Tag = "h3", className, ...props }: BaseProps) {
  return (
    <Tag className={cn("text-sm font-medium leading-snug text-ink", className)} {...props} />
  );
}

/** Eyebrow: bolum uzeri kucuk, buyuk harf, genis kerning etiket. */
export function Eyebrow({ as: Tag = "p", className, ...props }: BaseProps) {
  return (
    <Tag
      className={cn(
        "text-[11px] font-medium uppercase tracking-luxe text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}

/** One cikan giris paragrafi. Sans, biraz buyuk, rahat satir araligi. */
export function Lead({ as: Tag = "p", className, ...props }: BaseProps) {
  return (
    <Tag
      className={cn("text-base leading-relaxed text-ink-muted sm:text-lg", className)}
      {...props}
    />
  );
}

/** Govde metni. */
export function Text({ as: Tag = "p", className, ...props }: BaseProps) {
  return <Tag className={cn("text-sm leading-relaxed text-ink-muted", className)} {...props} />;
}

/** Sessiz/ikincil kucuk metin. */
export function Muted({ as: Tag = "p", className, ...props }: BaseProps) {
  return <Tag className={cn("text-xs leading-relaxed text-ink-subtle", className)} {...props} />;
}
