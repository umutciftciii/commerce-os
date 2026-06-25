import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@commerce-os/ui";

/**
 * Store-admin'e ozel "glass-inspired" premium yuzey primitive'leri. Apple cam
 * dilinden ilham alir ama birebir kopya degildir: light-first, kirik beyaz zemin,
 * ince gumus kenar (ring), translucent yuzey ve olculu backdrop-blur. #9743CD
 * marka vurgusu yalnizca accent/aktif gosterge icin kullanilir.
 *
 * Yalnizca products & orders ekranlarinda kullanildigi icin app-local tutuldu;
 * admin-web ile ortaklasmasi gerekirse packages/ui'ye tasinabilir.
 */

/** Tum cam yuzeylerin ortak kenar/golge/blur dili. */
export const GLASS_SURFACE =
  "rounded-2xl border border-white/70 bg-white/70 shadow-[0_1px_2px_0_rgb(15_23_42_/_0.04),0_18px_36px_-20px_rgb(15_23_42_/_0.18)] ring-1 ring-slate-200/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60";

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
        <header className="flex items-start justify-between gap-4 border-b border-slate-200/60 px-5 py-4">
          <div className="flex items-start gap-3">
            {icon ? (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/70 text-brand-600 shadow-card ring-1 ring-slate-200/70">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? (
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-600">
                  {eyebrow}
                </p>
              ) : null}
              {title ? (
                <h2 className="text-sm font-semibold tracking-tightish text-slate-900">{title}</h2>
              ) : null}
              {description ? (
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{description}</p>
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
        {/* Cok hafif marka aurasi: sag ust kosede olculu accent. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-brand-200/30 blur-3xl"
        />
        <div className="relative">
          {backHref ? (
            <Link
              href={backHref}
              className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              <span aria-hidden>←</span>
              {backLabel}
            </Link>
          ) : null}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-600">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="truncate text-2xl font-semibold tracking-tightish text-slate-900">
                {title}
              </h1>
              {subtitle ? (
                <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
              ) : null}
              {description ? (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
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
  neutral: "before:bg-slate-300",
  brand: "before:bg-brand-500",
  success: "before:bg-emerald-500",
  warning: "before:bg-amber-500",
  danger: "before:bg-red-500",
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
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon ? <span className="text-slate-300">{icon}</span> : null}
      </div>
      <p className="mt-2 pl-2.5 text-2xl font-semibold tracking-tightish text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 pl-2.5 text-xs text-slate-400">{hint}</p> : null}
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
      <header className="flex items-center gap-2 border-b border-slate-200/60 px-4 py-3">
        {icon ? <span className="text-brand-600">{icon}</span> : null}
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      </header>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

/** Ray icindeki etiket/deger satiri. Deger ReactNode (rozet de olabilir). */
export function RailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 text-right font-medium text-slate-700">{value}</span>
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
  neutral: "bg-slate-300 ring-slate-100",
  brand: "bg-brand-500 ring-brand-100",
  success: "bg-emerald-500 ring-emerald-100",
  warning: "bg-amber-500 ring-amber-100",
  danger: "bg-red-500 ring-red-100",
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
          className="absolute left-[5px] top-3 h-full w-px bg-gradient-to-b from-slate-200 to-transparent"
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
        <span className="text-sm font-medium text-slate-800">{title}</span>
        {meta ? <span className="text-xs text-slate-400">{meta}</span> : null}
      </div>
      {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
    </li>
  );
}
