"use client";

import { type KeyboardEvent, useId, useState } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { salesModeLabel } from "../lib/labels";
import type { StorefrontProductDetail } from "../lib/catalog-types";

/**
 * PDP detay sekmeleri ("Storefront - PDP" tasarımı).
 *
 * Uzun yığılmış bölümler (açıklama / özellik / paket / kullanım / kargo) yerine
 * tasarımdaki 3 sekme: **Ürün açıklaması · Teknik özellikler · Kargo & İade**.
 * Tamamen token-tabanlı (aksan taşımaz). Erişilebilir tablist: `role=tab/tabpanel`,
 * `aria-selected`, ok tuşlarıyla gezinme; seçili olmayan paneller `hidden`.
 * GERÇEK içerik (açıklama/marka/kategori/sku/seçenek) sunucudan; uydurma yok.
 */
type TabId = "description" | "specs" | "shipping";

export function PdpDetailTabs({
  detail,
  t,
}: {
  detail: StorefrontProductDetail;
  t: StorefrontDictionary;
}) {
  const d = t.detail;
  const [active, setActive] = useState<TabId>("description");
  const baseId = useId();

  const tabs: { id: TabId; label: string }[] = [
    { id: "description", label: d.descriptionTitle },
    { id: "specs", label: d.specsTitle },
    { id: "shipping", label: d.shippingTabTitle },
  ];

  const tabId = (id: TabId) => `${baseId}-tab-${id}`;
  const panelId = (id: TabId) => `${baseId}-panel-${id}`;

  // Klavye: Sol/Sağ ok ile sekmeler arası döngü (WAI-ARIA tabs deseni).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    const nextIndex =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : (index - 1 + tabs.length) % tabs.length;
    const next = tabs[nextIndex].id;
    setActive(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div className="mt-16 max-w-3xl lg:mt-20">
      <div
        role="tablist"
        aria-label={d.detailTabsLabel}
        onKeyDown={onKeyDown}
        className="flex gap-6 border-b border-line sm:gap-8"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={[
                "-mb-px whitespace-nowrap border-b-2 pb-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                selected ? "border-ink text-ink" : "border-transparent text-ink-subtle hover:text-ink",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Ürün açıklaması */}
      <div
        id={panelId("description")}
        role="tabpanel"
        aria-labelledby={tabId("description")}
        hidden={active !== "description"}
        className="py-7 text-sm leading-relaxed text-ink-muted"
      >
        <p className="whitespace-pre-line">{detail.description ?? d.descriptionFallback}</p>
        <ul className="mt-5 space-y-2">
          {d.benefits.map((benefit) => (
            <li key={benefit} className="flex gap-2.5">
              <span aria-hidden className="mt-0.5 text-ink">
                ✓
              </span>
              {benefit}
            </li>
          ))}
        </ul>
        <dl className="mt-6 space-y-3 border-t border-line pt-5">
          <InfoRow title={d.packageTitle} body={d.packageBody} />
          <InfoRow title={d.usageTitle} body={d.usageBody} />
        </dl>
      </div>

      {/* Teknik özellikler */}
      <div
        id={panelId("specs")}
        role="tabpanel"
        aria-labelledby={tabId("specs")}
        hidden={active !== "specs"}
        className="py-7"
      >
        <SpecsTable detail={detail} t={t} />
      </div>

      {/* Kargo & İade */}
      <div
        id={panelId("shipping")}
        role="tabpanel"
        aria-labelledby={tabId("shipping")}
        hidden={active !== "shipping"}
        className="py-7"
      >
        <dl className="space-y-5 text-sm leading-relaxed text-ink-muted">
          <InfoRow title={t.buyBox.delivery.title} body={t.buyBox.delivery.body} />
          <InfoRow title={t.buyBox.returns.title} body={t.buyBox.returns.body} />
          <InfoRow title={t.buyBox.secure.title} body={t.buyBox.secure.body} />
        </dl>
      </div>
    </div>
  );
}

function InfoRow({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-ink">{title}</dt>
      <dd className="mt-0.5 text-xs text-ink-muted">{body}</dd>
    </div>
  );
}

/**
 * Teknik özellik tablosu — tasarımdaki etiket/değer satır düzeni (hairline ayraç).
 * Değerler GERÇEK üründen; boş alan üretilmez (yalnız var olan alanlar listelenir).
 */
function SpecsTable({ detail, t }: { detail: StorefrontProductDetail; t: StorefrontDictionary }) {
  const d = t.detail;
  const rows: { label: string; value: string }[] = [];
  if (detail.brand) rows.push({ label: d.specBrand, value: detail.brand });
  if (detail.categoryLabel) rows.push({ label: d.specCategory, value: detail.categoryLabel });
  if (detail.sku) rows.push({ label: d.specSku, value: detail.sku });
  if (detail.variants.length > 0) {
    rows.push({ label: d.specOptions, value: detail.variants.map((variant) => variant.title).join(", ") });
  }
  rows.push({ label: d.specSalesMode, value: salesModeLabel(detail.commerce.salesMode, t) });

  return (
    <dl>
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[9rem_1fr] gap-4 border-b border-line py-3 text-sm last:border-b-0 sm:grid-cols-[11rem_1fr]"
        >
          <dt className="text-ink-subtle">{row.label}</dt>
          <dd className="text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
