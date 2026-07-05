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

export function CategoryIcon() {
  return (
    <svg {...base} aria-hidden>
      <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h5l2 2.5h8A1.5 1.5 0 0 1 21 8v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17Z" />
      <path d="M3 9.5h18" />
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

export function PaymentIcon() {
  return (
    <svg {...base} aria-hidden>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14.5h4" />
    </svg>
  );
}

export function ShippingIcon() {
  return (
    <svg {...base} aria-hidden>
      <path d="M2.5 7.5h10v9h-10z" />
      <path d="M12.5 10.5h4l4 3.5v2.5h-8z" />
      <circle cx="6.5" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </svg>
  );
}

/** F4A — Kampanyalar (etiket/kupon simgesi). */
export function CampaignIcon() {
  return (
    <svg {...base} aria-hidden>
      <path d="M3 12.5 11.5 4H20v8.5L11.5 21z" />
      <circle cx="15.5" cy="8.5" r="1.4" />
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
