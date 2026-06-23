import type { SVGProps } from "react";

/**
 * Kenar menu icin sade, tek renkli stroke ikon seti (Lucide tarzi).
 * currentColor kullanir; aktif/pasif renk SidebarNav tarafindan yonetilir.
 */
const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function DashboardIcon() {
  return (
    <svg {...base} aria-hidden>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function StoreIcon() {
  return (
    <svg {...base} aria-hidden>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </svg>
  );
}

export function PlanIcon() {
  return (
    <svg {...base} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 14h4" />
    </svg>
  );
}

export function HealthIcon() {
  return (
    <svg {...base} aria-hidden>
      <path d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...base} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.91 1V21a2 2 0 1 1-4 0v-.18a1.65 1.65 0 0 0-2.91-1l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 13a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 6.4l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 2.91-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.91 1l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 11H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
