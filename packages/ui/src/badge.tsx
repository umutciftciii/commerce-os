import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";

// Ince ring kenarli, yumusak tonlu rozetler: premium, olculu.
const tones: Record<Tone, string> = {
  neutral: "bg-slate-50 text-slate-600 ring-slate-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  info: "bg-brand-50 text-brand-700 ring-brand-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
};

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  /** Solunda durum noktasi gosterir (canli/durum rozetleri icin). */
  dot?: boolean;
  className?: string;
}

const dotTones: Record<Tone, string> = {
  neutral: "bg-slate-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-brand-500",
  danger: "bg-red-500",
};

export function Badge({ children, tone = "neutral", dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dotTones[tone])} />
      ) : null}
      {children}
    </span>
  );
}
