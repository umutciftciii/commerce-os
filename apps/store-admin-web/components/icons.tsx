import type { SVGProps } from "react";

/**
 * Mağaza paneli kenar menusu icin sade, tek renkli stroke ikon seti.
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

export function ProductIcon() {
  return (
    <svg {...base} aria-hidden>
      <path d="M21 7.5 12 12 3 7.5 12 3l9 4.5Z" />
      <path d="M3 7.5v9L12 21l9-4.5v-9" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function OrderIcon() {
  return (
    <svg {...base} aria-hidden>
      <path d="M6 2 4 6v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6l-2-4Z" />
      <path d="M4 6h16" />
      <path d="M9 10a3 3 0 0 0 6 0" />
    </svg>
  );
}

export function InventoryIcon() {
  return (
    <svg {...base} aria-hidden>
      <path d="M3 9 12 4l9 5v6l-9 5-9-5Z" />
      <path d="M3 9l9 5 9-5" />
      <path d="M12 14v7" />
    </svg>
  );
}

export function CustomerIcon() {
  return (
    <svg {...base} aria-hidden>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3.25 3.25 0 0 1 0 6" />
      <path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 20" />
    </svg>
  );
}

export function MarketplaceIcon() {
  return (
    <svg {...base} aria-hidden>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </svg>
  );
}

export function ThemeIcon() {
  return (
    <svg {...base} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="8.5" cy="9.5" r="1.25" />
      <circle cx="15" cy="9" r="1.25" />
      <circle cx="16" cy="14" r="1.25" />
      <path d="M12 21a3 3 0 0 1 0-6 2 2 0 0 0 0-4" />
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
