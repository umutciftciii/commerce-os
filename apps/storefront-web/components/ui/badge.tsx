import type { HTMLAttributes } from "react";
import { cn } from "@commerce-os/ui";

/**
 * Minimal vitrin rozeti/etiketi (ADIM 1). Rozet yiginindan kacinilir; keskin,
 * hairline ya da dolu tek renk. Buyuk harf + genis kerning premium his verir.
 */
// NOTR tonlar — rozet ikincil bir yuzeydir, aksan tasimaz (aksan yalniz tek CTA).
export type BadgeTone = "ink" | "outline" | "muted";

const tones: Record<BadgeTone, string> = {
  ink: "bg-ink text-surface",
  outline: "border border-line-strong text-ink",
  muted: "bg-surface-muted text-ink-muted",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "outline", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-none px-2.5 py-1 text-[10px] font-medium uppercase tracking-wideish",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
