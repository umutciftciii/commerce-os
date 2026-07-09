import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@commerce-os/ui";

/**
 * Vitrin butonu (ADIM 1). Premium/editoryel: keskin koseler (rounded-none),
 * genis kerning, ince hareket (renk gecisi). Aksan (menekse) OLCULU kullanilir;
 * birincil aksiyon murekkep-siyah zemindir (Net-a-Porter/Ssense dili).
 *
 * `<Button>` gercek <button>, `<ButtonLink>` ayni gorunumde bir <Link>'tir —
 * mevcut `<Link><Button/></Link>` ic-ice sarmalama yerine tercih edilir.
 */
export type ButtonVariant = "primary" | "cta" | "secondary" | "ghost" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-none font-medium uppercase tracking-wideish transition-colors duration-200 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-40";

const variants: Record<ButtonVariant, string> = {
  // Varsayilan is-yuku butonu: murekkep-siyah, NOTR (accent yok).
  primary: "bg-ink text-surface hover:opacity-90",
  // Tek aksan CTA: SADECE sayfa basina bir birincil eylemde kullanilir
  // ( or. hero "Ürünleri keşfet"). Desature erik zemin.
  cta: "bg-accent text-accent-contrast hover:bg-accent-ink",
  secondary: "border border-ink text-ink hover:bg-ink hover:text-surface",
  ghost: "text-ink-muted hover:text-ink",
  link: "px-0 normal-case tracking-normal text-ink underline decoration-line underline-offset-4 hover:decoration-ink",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-5 text-[11px]",
  md: "h-11 px-7 text-xs",
  lg: "h-12 px-9 text-[13px]",
};

function classes(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return cn(base, variants[variant], variant === "link" ? "" : sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type,
  ...props
}: ButtonProps) {
  return (
    <button type={type ?? "button"} className={classes(variant, size, className)} {...props} />
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonLinkProps) {
  return <Link href={href} className={classes(variant, size, className)} {...props} />;
}
