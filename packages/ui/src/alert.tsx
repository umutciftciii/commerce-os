import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "error" | "success" | "warning" | "info";

const tones: Record<Tone, string> = {
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-brand-200 bg-brand-50 text-brand-700",
};

export interface AlertProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  /** Sag tarafta gosterilen istege bagli aksiyon (ornegin "Tekrar dene"). */
  action?: ReactNode;
  className?: string;
}

/** Baglamsal geri bildirim seridi (hata/basari/uyari). Sunum amacli. */
export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
        tones[tone],
        className,
      )}
    >
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <p className={cn(title ? "mt-0.5" : "", "leading-relaxed")}>{children}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
