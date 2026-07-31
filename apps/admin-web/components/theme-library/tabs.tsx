"use client";

import { useRef, type ReactNode } from "react";

/**
 * TODO-164B Dilim 2 — Erişilebilir sekme başlığı (Platform Theme Designer 9 sekme).
 * ARIA tablist deseni: roving tabindex, ok tuşlarıyla gezinme, Home/End, görünür focus.
 * @commerce-os/ui'de Tabs yok → admin-web yereli (paylaşılan kit'e dokunulmaz).
 */
export interface TabItem {
  id: string;
  label: string;
  badge?: ReactNode;
}

export function Tabs({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function focusTab(id: string) {
    onChange(id);
    refs.current[id]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next >= 0) {
      event.preventDefault();
      focusTab(tabs[next].id);
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className="flex flex-wrap gap-1 border-b border-slate-200"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={[
              "flex items-center gap-2 rounded-t-md px-3 py-2 text-sm font-medium outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
              selected
                ? "border-b-2 border-indigo-600 text-indigo-700"
                : "border-b-2 border-transparent text-slate-500 hover:text-slate-800",
            ].join(" ")}
          >
            <span>{tab.label}</span>
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className="pt-4 outline-none">
      {children}
    </div>
  );
}
