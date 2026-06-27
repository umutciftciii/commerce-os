import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@commerce-os/ui";

/**
 * Store-admin'e ozel KOYU "glassmorphism" premium yuzey primitive'leri.
 * Tasarim dili: koyu zemin (radial + linear gradient), translucent cam yuzey
 * (white/[0.06] + backdrop-blur), ince beyaz kenar ve indigo aksan.
 *
 * Yalnizca store-admin-web ekranlarinda kullanildigi icin app-local tutuldu.
 * Bu dosyada yalnizca GORUNUM degisti; tum prop API'leri ve kullanim sekli ayni
 * kaldi, dolayisiyla cagiran sayfalardaki mantik etkilenmez.
 */

/** Tum cam yuzeylerin ortak kenar/golge/blur dili (koyu tema). */
export const GLASS_SURFACE =
  "rounded-2xl border border-white/[0.09] bg-white/[0.06] shadow-[0_1px_2px_0_rgb(0_0_0_/_0.2),0_18px_36px_-20px_rgb(0_0_0_/_0.5)] backdrop-blur-2xl backdrop-saturate-150";

/** Ham cam panel; baslik istemeyen serbest icerik bloklari icin. */
export function GlassPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(GLASS_SURFACE, className)}>{children}</div>;
}

export interface SurfaceCardProps {
  title?: string;
  /** Baslik uzerinde kucuk baglam etiketi. */
  eyebrow?: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Govde ic boslugunu kapatip icerigin tum yuzeyi kullanmasina izin verir. */
  flush?: boolean;
}

/**
 * Baslikli cam icerik yuzeyi. SectionCard'in premium karsiligi: yumusak ayrac,
 * istege bagli ikon kutusu, sagda aksiyon alani.
 */
export function SurfaceCard({
  title,
  eyebrow,
  description,
  icon,
  actions,
  children,
  className,
  flush,
}: SurfaceCardProps) {
  const hasHeader = Boolean(title || eyebrow || description || icon || actions);
  return (
    <section className={cn(GLASS_SURFACE, "overflow-hidden", className)}>
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-3.5">
          <div className="flex items-start gap-3">
            {icon ? (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-500/15 text-indigo-300">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? (
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-300/80">
                  {eyebrow}
                </p>
              ) : null}
              {title ? (
                <h2 className="text-[13px] font-semibold text-white/90">{title}</h2>
              ) : null}
              {description ? (
                <p className="mt-0.5 text-[11px] leading-relaxed text-white/30">{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? undefined : "px-5 py-5"}>{children}</div>
    </section>
  );
}

export interface DetailHeroProps {
  eyebrow?: string;
  title: string;
  /** Baslik altinda kisa kimlik metni (slug, e-posta vb.). */
  subtitle?: ReactNode;
  description?: string;
  /** Durum rozetleri satiri. */
  badges?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}

/**
 * Detay sayfalarinin guclu kimlik basligi: geri linki, eyebrow, baslik,
 * kisa kimlik, durum rozetleri ve ana aksiyonlar tek cam yuzeyde toplanir.
 */
export function DetailHero({
  eyebrow,
  title,
  subtitle,
  description,
  badges,
  actions,
  backHref,
  backLabel,
}: DetailHeroProps) {
  return (
    <div className="relative mb-6 overflow-hidden">
      <div className={cn(GLASS_SURFACE, "relative overflow-hidden px-6 py-5 sm:px-7 sm:py-6")}>
        {/* Hafif marka aurasi: sag ust kosede olculu indigo accent. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl"
        />
        <div className="relative">
          {backHref ? (
            <Link
              href={backHref}
              className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200"
            >
              <span aria-hidden>←</span>
              {backLabel}
            </Link>
          ) : null}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-300/80">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="truncate text-2xl font-bold tracking-tight text-white/95">
                {title}
              </h1>
              {subtitle ? (
                <div className="mt-1 text-sm text-white/40">{subtitle}</div>
              ) : null}
              {description ? (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/40">
                  {description}
                </p>
              ) : null}
              {badges ? <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div> : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type MetricTone = "neutral" | "brand" | "success" | "warning" | "danger";

const METRIC_ACCENTS: Record<MetricTone, string> = {
  neutral: "before:bg-white/20",
  brand: "before:bg-indigo-500",
  success: "before:bg-emerald-400",
  warning: "before:bg-amber-400",
  danger: "before:bg-red-400",
};

export interface MetricTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: MetricTone;
  icon?: ReactNode;
}

/** Liste/detay ust seridi icin kompakt cam KPI karti; solunda ince ton serisi. */
export function MetricTile({ label, value, hint, tone = "neutral", icon }: MetricTileProps) {
  return (
    <div
      className={cn(
        GLASS_SURFACE,
        "relative overflow-hidden px-4 py-4",
        "before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full",
        METRIC_ACCENTS[tone],
      )}
    >
      <div className="flex items-center justify-between gap-2 pl-2.5">
        <p className="text-xs font-medium text-white/40">{label}</p>
        {icon ? <span className="text-white/20">{icon}</span> : null}
      </div>
      <p className="mt-2 pl-2.5 text-2xl font-extrabold tracking-tight text-white/95">{value}</p>
      {hint ? <p className="mt-0.5 pl-2.5 text-xs text-white/30">{hint}</p> : null}
    </div>
  );
}

/** Responsive metrik seridi. Mobilde 2, genis ekranda esit kolonlar. */
export function MetricGrid({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode;
  columns?: 3 | 4 | 5;
  className?: string;
}) {
  const cols = {
    3: "sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  }[columns];
  return <div className={cn("grid gap-3", cols, className)}>{children}</div>;
}

/**
 * Detay sayfasi iki kolonlu yerlesimi: solda ana icerik, sagda kompakt baglam
 * rayi. Mobilde tek kolona iner (ray altta).
 */
export function DetailLayout({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">{main}</div>
      <aside className="space-y-5 lg:col-span-1">{rail}</aside>
    </div>
  );
}

/** Baglam rayinda kullanilan kompakt baslikli cam kart. */
export function RailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn(GLASS_SURFACE, "overflow-hidden")}>
      <header className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
        {icon ? <span className="text-indigo-300">{icon}</span> : null}
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{title}</h2>
      </header>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

/** Ray icindeki etiket/deger satiri. Deger ReactNode (rozet de olabilir). */
export function RailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-white/40">{label}</span>
      <span className="min-w-0 text-right font-medium text-white/70">{value}</span>
    </div>
  );
}

/** Olay zaman cizelgesi sarmalayicisi: sol dikey cizgi + noktalar. */
export function Timeline({ children }: { children: ReactNode }) {
  return <ol className="relative space-y-4 pl-1">{children}</ol>;
}

export interface TimelineItemProps {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  /** Son ogede alt baglanti cizgisini gizler. */
  last?: boolean;
  tone?: MetricTone;
}

const DOT_TONES: Record<MetricTone, string> = {
  neutral: "bg-white/30 ring-white/10",
  brand: "bg-indigo-500 ring-indigo-500/20",
  success: "bg-emerald-400 ring-emerald-400/20",
  warning: "bg-amber-400 ring-amber-400/20",
  danger: "bg-red-400 ring-red-400/20",
};

export function TimelineItem({
  title,
  meta,
  description,
  last,
  tone = "brand",
}: TimelineItemProps) {
  return (
    <li className="relative pl-6">
      {!last ? (
        <span
          aria-hidden
          className="absolute left-[5px] top-3 h-full w-px bg-gradient-to-b from-white/15 to-transparent"
        />
      ) : null}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ring-4",
          DOT_TONES[tone],
        )}
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-sm font-medium text-white/80">{title}</span>
        {meta ? <span className="text-xs text-white/30">{meta}</span> : null}
      </div>
      {description ? <p className="mt-0.5 text-sm text-white/50">{description}</p> : null}
    </li>
  );
}
