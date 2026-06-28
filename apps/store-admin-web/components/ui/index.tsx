"use client";

/**
 * Mağaza paneline özel KOYU "glassmorphism" UI kit.
 *
 * Paylaşılan @commerce-os/ui paketi storefront-web + admin-web tarafından da
 * kullanıldığı ve açık tema olduğu için ona dokunmuyoruz. Bunun yerine bu kit,
 * store-admin-web sayfalarının import ettiği bileşenlerin API-uyumlu (aynı
 * prop'lar) koyu tema karşılıklarını sağlar. Sayfalardaki tek değişiklik import
 * kaynağının "@commerce-os/ui" yerine "../components/ui" olması; tüm state,
 * handler ve API çağrıları aynı kalır.
 *
 * Locale/dil mantığı bir "akış" olduğundan paylaşılan paketten aynen yeniden
 * dışa aktarılır.
 */

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@commerce-os/ui";

export { cn } from "@commerce-os/ui";
export type { ClassValue } from "@commerce-os/ui";

// Dil/locale akışı: paylaşılan paketten aynen.
export { LocaleProvider, useLocale, LanguageSwitcher } from "@commerce-os/ui";
export type {
  LocaleProviderProps,
  LanguageSwitcherProps,
  LanguageSwitcherLabels,
} from "@commerce-os/ui";

/* ─────────────────────────── Tema sabitleri ─────────────────────────── */

const GLASS =
  "border border-white/[0.09] bg-white/[0.06] backdrop-blur-2xl backdrop-saturate-150";

/* ─────────────────────────────── Card ───────────────────────────────── */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl", GLASS, className)} {...props} />;
}

export interface SectionCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
  className,
}: SectionCardProps) {
  return (
    <section className={cn("overflow-hidden rounded-2xl", GLASS, className)}>
      <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-3.5">
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-400/20 bg-indigo-500/15 text-indigo-300">
              {icon}
            </span>
          ) : null}
          <div>
            <h2 className="text-[13px] font-semibold text-white/90">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[11px] text-white/30">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

/* ─────────────────────────────── Badge ──────────────────────────────── */

type Tone = "neutral" | "success" | "warning" | "info" | "danger" | "brand";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-white/[0.07] text-white/45 ring-white/[0.12]",
  success: "bg-emerald-400/[0.12] text-emerald-400 ring-emerald-400/[0.22]",
  warning: "bg-amber-400/[0.12] text-amber-400 ring-amber-400/[0.22]",
  info: "bg-blue-400/[0.12] text-blue-400 ring-blue-400/[0.22]",
  danger: "bg-red-400/[0.12] text-red-400 ring-red-400/[0.22]",
  brand: "bg-indigo-500/[0.12] text-indigo-300 ring-indigo-500/[0.22]",
};

const dotTones: Record<Tone, string> = {
  neutral: "bg-white/40",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  info: "bg-blue-400",
  danger: "bg-red-400",
  brand: "bg-indigo-400",
};

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}

export function Badge({ children, tone = "neutral", dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        badgeTones[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dotTones[tone])} /> : null}
      {children}
    </span>
  );
}

/* ─────────────────────────────── Button ─────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-[9px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 disabled:pointer-events-none disabled:opacity-50";

const btnVariants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-[0_4px_16px_rgba(99,102,241,0.35)] hover:from-indigo-400 hover:to-indigo-500",
  secondary:
    "border border-white/[0.11] bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white/80",
  ghost: "text-white/55 hover:bg-white/[0.06] hover:text-white/85",
  danger:
    "border border-red-400/20 bg-red-400/10 text-red-400/90 hover:bg-red-400/[0.16]",
};

const btnSizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-[13px]",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(btnBase, btnVariants[variant], btnSizes[size], className)}
      {...props}
    />
  );
}

/* ────────────────────────────── StatCard ────────────────────────────── */

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  badge?: string;
  badgeTone?: "neutral" | "success" | "warning" | "info";
  icon?: ReactNode;
}

export function StatCard({ label, value, hint, badge, badgeTone = "neutral", icon }: StatCardProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl p-5", GLASS)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-indigo-500/15 blur-3xl"
      />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
              {icon}
            </span>
          ) : null}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35">{label}</p>
        </div>
        {badge ? (
          <Badge tone={badgeTone} dot={badgeTone !== "neutral"}>
            {badge}
          </Badge>
        ) : null}
      </div>
      <div className="relative mt-3 text-[32px] font-extrabold leading-none tracking-tight text-white/95">
        {value}
      </div>
      {hint ? <p className="relative mt-1.5 text-xs text-white/30">{hint}</p> : null}
    </div>
  );
}

/* ────────────────────────────── PageHeader ──────────────────────────── */

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  eyebrow?: string;
}

export function PageHeader({ title, description, actions, breadcrumb, eyebrow }: PageHeaderProps) {
  return (
    <div className="mb-6 border-b border-white/[0.07] pb-5">
      {breadcrumb ? <div className="mb-2 text-sm text-white/30">{breadcrumb}</div> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-300/80">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-white/95">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/40">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ────────────────────────────── DataTable ───────────────────────────── */

export interface DataTableColumn<Row> {
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  className?: string;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  caption?: string;
  className?: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  caption,
  className,
}: DataTableProps<Row>) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-white/[0.07] bg-white/[0.02] text-left">
            {columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className={cn(
                  "px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white/[0.26]",
                  column.align === "right" ? "text-right" : "text-left",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-white/[0.05] transition-colors",
                onRowClick ? "cursor-pointer hover:bg-white/[0.03]" : undefined,
              )}
            >
              {columns.map((column, index) => (
                <td
                  key={index}
                  className={cn(
                    "px-4 py-3 align-middle text-white/70",
                    column.align === "right" ? "text-right" : "text-left",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────── Alert ──────────────────────────────── */

type AlertTone = "error" | "success" | "warning" | "info";

const alertTones: Record<AlertTone, string> = {
  error: "border-red-400/20 bg-red-400/[0.07] text-red-300",
  success: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
  warning: "border-amber-400/20 bg-amber-400/[0.07] text-amber-300",
  info: "border-indigo-400/20 bg-indigo-400/[0.07] text-indigo-200",
};

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
        alertTones[tone],
        className,
      )}
    >
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <p className={cn(title ? "mt-0.5" : "", "leading-relaxed text-white/70")}>{children}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ─────────────────────────── Input / Select ─────────────────────────── */

const fieldBase =
  "w-full rounded-[10px] border border-white/[0.12] bg-white/[0.05] text-[13px] text-white/80 placeholder:text-white/30 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-white/35">
      {children}
    </span>
  );
}

export function Input({ label, id, className, ...props }: InputProps) {
  const control = <input id={id} className={cn("h-10 px-3", fieldBase, className)} {...props} />;
  if (!label) return control;
  return (
    <label htmlFor={id} className="block">
      <FieldLabel>{label}</FieldLabel>
      {control}
    </label>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
}

export function Select({ label, id, className, options, ...props }: SelectProps) {
  const control = (
    <select id={id} className={cn("h-10 px-3 [&>option]:text-slate-900", fieldBase, className)} {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  if (!label) return control;
  return (
    <label htmlFor={id} className="block">
      <FieldLabel>{label}</FieldLabel>
      {control}
    </label>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, id, className, ...props }: TextareaProps) {
  const control = <textarea id={id} className={cn("px-3 py-2", fieldBase, className)} {...props} />;
  if (!label) return control;
  return (
    <label htmlFor={id} className="block">
      <FieldLabel>{label}</FieldLabel>
      {control}
    </label>
  );
}

/* ─────────────────────────── Spinner / Skeleton ─────────────────────── */

export interface SpinnerProps {
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

const spinnerSizes = { sm: "h-4 w-4 border-2", md: "h-6 w-6 border-2" } as const;

export function Spinner({ label, size = "md", className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-2 text-sm text-white/50", className)}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block animate-spin rounded-full border-white/15 border-t-indigo-400",
          spinnerSizes[size],
        )}
      />
      {label ? <span>{label}</span> : <span className="sr-only">...</span>}
    </span>
  );
}

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-white/[0.08]", className)} />;
}

export interface SkeletonRowsProps {
  rows?: number;
  className?: string;
}

export function SkeletonRows({ rows = 4, className }: SkeletonRowsProps) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────── EmptyState ───────────────────────────── */

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  tag?: string;
  className?: string;
}

export function EmptyState({ title, description, icon, action, tag, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl px-6 py-12 text-center",
        GLASS,
        className,
      )}
    >
      <div className="relative flex flex-col items-center">
        {tag ? (
          <span className="mb-3 inline-flex items-center rounded-full border border-indigo-400/20 bg-indigo-500/[0.12] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
            {tag}
          </span>
        ) : null}
        {icon ? (
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/40">
            {icon}
          </div>
        ) : null}
        <h3 className="text-sm font-semibold text-white/90">{title}</h3>
        {description ? (
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-white/40">{description}</p>
        ) : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Modal ──────────────────────────────── */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose'u ref'te tut: cagiran taraf onClose'u inline tanimlasa bile (her render'da
  // yeni kimlik) bu efekt YALNIZCA `open` degisince calisir. Aksi halde her render'da
  // (or. input'a her tus vurusunda) efekt yeniden kosup panelRef.focus() ile odagi
  // input'tan calardi — "yeni saglayici" modalindaki focus firlamasi bug'i buydu.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Portal yalnız mount sonrası (client). SSR'da document yok; ayrıca portal,
  // backdrop-blur'lu ata kartların (containing block) `position: fixed`'i hapsetmesini
  // engeller — modal her zaman viewport'a göre tam ekran açılır.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-hidden className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? "modal-description" : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col rounded-2xl",
          GLASS,
          "shadow-[0_24px_64px_rgba(0,0,0,0.5)] focus:outline-none",
          className,
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-[13px] font-semibold text-white/90">
              {title}
            </h2>
            {description ? (
              <p id="modal-description" className="mt-0.5 text-[11px] text-white/30">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────────── Container ────────────────────────────── */

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />
  );
}
