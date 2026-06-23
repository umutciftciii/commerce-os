import type { ReactNode } from "react";
import { cn } from "./cn";

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
}

export interface SidebarNavProps {
  items: NavItem[];
  /** Itemlerin ustunde gosterilen istege bagli buyuk harfli bolum etiketi. */
  heading?: string;
}

/** Sunum amacli kenar menusu. Aktif durum cagiran tarafindan belirlenir. */
export function SidebarNav({ items, heading }: SidebarNavProps) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Birincil">
      {heading ? (
        <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {heading}
        </p>
      ) : null}
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
            item.active
              ? "bg-white text-brand-700 shadow-sm ring-1 ring-slate-200/80"
              : "text-slate-600 hover:bg-white/70 hover:text-slate-900",
          )}
        >
          {item.active ? (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-600"
            />
          ) : null}
          {item.icon ? (
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center transition-colors",
                item.active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600",
              )}
            >
              {item.icon}
            </span>
          ) : null}
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export interface TopbarProps {
  /** Ust baglam etiketi (ornegin bolum adi). */
  title?: string;
  children?: ReactNode;
}

export function Topbar({ title, children }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/85 px-6 backdrop-blur-md">
      {title ? (
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <span className="hidden h-1.5 w-1.5 rounded-full bg-emerald-500 sm:inline-block" />
          {title}
        </div>
      ) : (
        <div />
      )}
      <div className="flex items-center gap-3">{children}</div>
    </header>
  );
}

export interface UserChipProps {
  name: string;
  role: string;
}

/** Topbar icin lokalize, sade kullanici/rol rozeti. */
export function UserChip({ name, role }: UserChipProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-card">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
        {initial}
      </span>
      <span className="hidden leading-tight sm:block">
        <span className="block text-xs font-semibold text-slate-900">{name}</span>
        <span className="block text-[11px] text-slate-400">{role}</span>
      </span>
    </div>
  );
}

export interface AppShellProps {
  brand: { name: string; subtitle?: string };
  nav: ReactNode;
  topbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** Yonetim uygulamasi cercevesi: sabit kenar menu + yapiskan topbar + kayan icerik. */
export function AppShell({ brand, nav, topbar, footer, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-canvas text-slate-900">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200/70 bg-canvas-subtle shadow-sidebar lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200/70 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-card ring-1 ring-brand-700/20">
            {brand.name.charAt(0).toUpperCase()}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tightish text-slate-900">
              {brand.name}
            </div>
            {brand.subtitle ? (
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                {brand.subtitle}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">{nav}</div>
        {footer ? (
          <div className="border-t border-slate-200/70 px-4 py-3 text-xs text-slate-400">
            {footer}
          </div>
        ) : null}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <main className="flex-1 px-6 py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
