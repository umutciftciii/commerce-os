import { cn } from "./cn";

export interface SpinnerProps {
  /** Erisilebilir etiket; ekran okuyuculara yuklenme bildirir. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

const sizes = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
} as const;

/** Sade, marka tonlu donen yukleme gostergesi. Sunum amacli. */
export function Spinner({ label, size = "md", className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-2 text-sm text-slate-500", className)}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block animate-spin rounded-full border-slate-200 border-t-brand-600",
          sizes[size],
        )}
      />
      {label ? <span>{label}</span> : <span className="sr-only">{label ?? "..."}</span>}
    </span>
  );
}
