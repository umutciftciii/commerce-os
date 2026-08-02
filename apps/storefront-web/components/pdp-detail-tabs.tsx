"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useId, useState } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { salesModeLabel } from "../lib/labels";
import type { StorefrontProductDetail } from "../lib/catalog-types";

/**
 * PDP detay sekmeleri ("Storefront - PDP" tasarımı) — Final Polish (§4).
 *
 * Dört sekme: **Ürün açıklaması · Teknik özellikler · Kargo & İade · Değerlendirmeler**.
 * Değerlendirmeler artık başıboş bir bölüm değil, sekmenin içindedir (özet + liste +
 * yorum formu aynı panelde). Sekme başlığında yorum sayısı gösterilir. Deep-link/hash
 * (#description/#specs/#shipping/#reviews) desteklenir; başlıktaki puan bağlantısı
 * (#reviews) doğru sekmeyi açar. Erişilebilir tablist: `role=tab/tabpanel`,
 * `aria-selected`, ok tuşlarıyla gezinme; seçili olmayan paneller `hidden`.
 */
type TabId = "description" | "specs" | "shipping" | "reviews";

const HASH_TO_TAB: Record<string, TabId> = {
  description: "description",
  specs: "specs",
  shipping: "shipping",
  reviews: "reviews",
};

export function PdpDetailTabs({
  detail,
  t,
  reviewsSlot,
  reviewCount = 0,
}: {
  detail: StorefrontProductDetail;
  t: StorefrontDictionary;
  /** REVIEWS açıksa render edilecek değerlendirme bloğu; null ise sekme gizlenir. */
  reviewsSlot?: ReactNode;
  reviewCount?: number;
}) {
  const d = t.detail;
  const [active, setActive] = useState<TabId>("description");
  const baseId = useId();

  const tabs: { id: TabId; label: string }[] = [
    { id: "description", label: d.descriptionTitle },
    { id: "specs", label: d.specsTitle },
    { id: "shipping", label: d.shippingTabTitle },
    ...(reviewsSlot
      ? [
          {
            id: "reviews" as const,
            label: reviewCount > 0 ? `${d.reviewsTabTitle} (${reviewCount})` : d.reviewsTabTitle,
          },
        ]
      : []),
  ];

  const tabId = (id: TabId) => `${baseId}-tab-${id}`;
  const panelId = (id: TabId) => `${baseId}-panel-${id}`;

  // Deep-link/hash: yüklemede + hashchange'de ilgili sekmeyi aç ve görünüre kaydır.
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.slice(1);
      const target = HASH_TO_TAB[hash];
      if (!target) return;
      if (target === "reviews" && !reviewsSlot) return;
      setActive(target);
      document.getElementById(`${baseId}-tabs`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [baseId, reviewsSlot]);

  const selectTab = (id: TabId) => {
    setActive(id);
    // Paylaşılabilir deep-link: sekmeyi hash'e yaz (sayfayı zıplatmadan).
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  };

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
    selectTab(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div id={`${baseId}-tabs`} className="scroll-mt-24">
      {/* #reviews gibi eski deep-link'ler için sabit çapa (sekme yapısı içinde). */}
      <span id="reviews" aria-hidden className="block" />
      <div
        role="tablist"
        aria-label={d.detailTabsLabel}
        onKeyDown={onKeyDown}
        className="flex gap-6 overflow-x-auto border-b border-line sm:gap-8"
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
              onClick={() => selectTab(tab.id)}
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
        {/* TODO-165 Fashion Vertical — moda özellik özeti (materyal/kesim/bakım/sezon/koleksiyon).
            Yalnız fashion ürününde (detail.fashion) + en az bir attribute varsa; aksi halde render
            edilmez (fashion-dışı PDP birebir korunur). */}
        {detail.fashion && detail.fashion.attributes.length > 0 ? (
          <div className="mb-8">
            <h3 className="mb-3 text-sm font-semibold text-ink">{d.fashion.attributesTitle}</h3>
            <dl>
              {detail.fashion.attributes.map((attribute) => (
                <div
                  key={attribute.code}
                  className="grid grid-cols-[9rem_1fr] gap-4 border-b border-line py-3 text-sm last:border-b-0 sm:grid-cols-[11rem_1fr]"
                >
                  <dt className="text-ink-subtle">{attribute.name}</dt>
                  <dd className="text-ink">{attribute.values.join(", ")}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
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

      {/* Değerlendirmeler — özet + liste + yorum formu aynı panelde (§4). */}
      {reviewsSlot ? (
        <div
          id={panelId("reviews")}
          role="tabpanel"
          aria-labelledby={tabId("reviews")}
          hidden={active !== "reviews"}
          className="py-7"
        >
          {reviewsSlot}
        </div>
      ) : null}
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
