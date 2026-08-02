import type { ReactNode } from "react";
import { cn } from "@commerce-os/ui";

/**
 * Vitrin editoryel uyari kutusu (B1). Paylasilan @commerce-os/ui `Alert`'ten AYRI:
 * keskin koseler, hairline cerceve, olculu ton — auth/checkout/account akislari
 * artik vitrinin editoryel diliyle konusur (mor/yuvarlak admin kiti degil).
 *
 * Ton yalnizca renkle degil; metin mesajin kendisini tasir ve hata tonunda
 * `role="alert"` ile ekran okuyucuya duyurulur (durum salt-renkle anlatilmaz).
 */
export type AlertTone = "error" | "success" | "info" | "warning";

const tones: Record<AlertTone, string> = {
  error: "border-red-300 bg-red-50 text-red-800",
  success: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-line bg-surface text-ink-muted",
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-none border px-4 py-3 text-sm leading-relaxed", tones[tone], className)}
    >
      {children}
    </div>
  );
}
