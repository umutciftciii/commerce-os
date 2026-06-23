import type { ReactNode } from "react";
import { cn } from "./cn";

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
}

/** Presentational sidebar navigation. Active state is decided by the caller. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            item.active
              ? "bg-brand-50 text-brand-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          {item.icon ? (
            <span className="flex h-5 w-5 items-center justify-center text-current">
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
  title?: string;
  children?: ReactNode;
}

export function Topbar({ title, children }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="flex items-center gap-3">{children}</div>
    </header>
  );
}

export interface AppShellProps {
  brand: { name: string; subtitle?: string };
  nav: ReactNode;
  topbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** Admin application frame: fixed sidebar + sticky topbar + scrollable content. */
export function AppShell({ brand, nav, topbar, footer, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            {brand.name.charAt(0).toUpperCase()}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">{brand.name}</div>
            {brand.subtitle ? <div className="text-xs text-slate-400">{brand.subtitle}</div> : null}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">{nav}</div>
        {footer ? (
          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400">{footer}</div>
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
