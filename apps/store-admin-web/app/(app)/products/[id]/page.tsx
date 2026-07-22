"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Alert, Badge, Button, SkeletonRows, useLocale } from "../../../../components/ui";
import { getDictionary } from "@commerce-os/i18n";
import type {
  Product,
  ProductPriceVisibility,
  ProductPrimaryAction,
  ProductSalesMode,
} from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate } from "../../../../lib/client/format";
import {
  DetailHero,
  DetailLayout,
  RailCard,
  RailRow,
  SurfaceCard,
} from "../../../components/premium";
import { InventoryIcon, PaymentIcon, ProductIcon } from "../../../../components/icons";
import { ProductForm } from "../product-form";
import { VariantsSection } from "../variants-manager";
import { PricingWorkspace } from "../pricing/pricing-workspace";
import { InventoryWorkspace } from "../inventory/inventory-workspace";

type ProductEditTab = "general" | "pricing" | "inventory";
const PRODUCT_EDIT_TABS: ProductEditTab[] = ["general", "pricing", "inventory"];
const TAB_ICONS: Record<ProductEditTab, ReactNode> = {
  general: <ProductIcon />,
  pricing: <PaymentIcon />,
  inventory: <InventoryIcon />,
};

type ProductStatus = Product["status"];

const STATUS_TONES: Record<ProductStatus, "success" | "neutral" | "warning"> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  ARCHIVED: "warning",
};

const SALES_MODE_TONES: Record<ProductSalesMode, "success" | "info" | "warning" | "neutral"> = {
  ONLINE: "success",
  INQUIRY: "info",
  APPOINTMENT: "warning",
  WHATSAPP: "success",
  CATALOG_ONLY: "neutral",
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; product: Product };

const FORM_ID = "product-edit-form";

/**
 * Ürün detay/düzenleme: modal değil, kendi route'unda (`/products/[id]`) tam sayfa.
 * Üstte güçlü kimlik başlığı (DetailHero), altında iki kolon: solda form + varyantlar,
 * sağda kompakt bağlam rayı (satış profili, künye, yönetim notu). Uzun form doğal
 * sayfa scroll'u ile akar.
 */
export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const searchParams = useSearchParams();
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.products;
  const c = dict.common;
  const d = t.detail;
  const sm = t.salesModel;
  const statusLabels = t.statusLabels as Record<ProductStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // TODO-151A — Ürün düzenleme sekmeleri. "Genel" mevcut form + varyantlar; "Fiyatlandırma"
  // tam genişlik ticari çalışma alanı; "Stok" Inventory Engine sekmesi.
  // TODO-152A — Global Stok izleme merkezinden gelen derin-link (?tab=inventory) ilk sekmeyi belirler.
  const [tab, setTab] = useState<ProductEditTab>(() => {
    const q = searchParams.get("tab");
    return q === "pricing" || q === "inventory" ? q : "general";
  });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      // TODO-159B (ADR-090) — Kategori kataloğu artık ÖNDEN çekilmez: form
      // seçili kategorileri `ids` çözüm moduyla, aramayı da sunucudan alır.
      const product = await storeApi.getProduct(productId);
      setState({ status: "ready", product });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [productId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const product = state.status === "ready" ? state.product : null;

  const mode = (product?.salesMode ?? "ONLINE") as ProductSalesMode;
  const visibility = (product?.priceVisibility ?? "VISIBLE") as ProductPriceVisibility;
  const action = (product?.primaryAction ?? "ADD_TO_CART") as ProductPrimaryAction;
  const purchasable = product?.purchasable ?? true;

  return (
    <>
      <DetailHero
        eyebrow={t.eyebrow}
        title={product ? product.title : t.title}
        subtitle={
          product ? <span className="font-mono text-xs text-white/30">{product.slug}</span> : null
        }
        description={d.pageDescription}
        backHref="/products"
        backLabel={d.backToList}
        badges={
          product ? (
            <>
              <Badge tone={STATUS_TONES[product.status]} dot>
                {statusLabels[product.status]}
              </Badge>
              <Badge tone={SALES_MODE_TONES[mode]}>{sm.modeLabels[mode]}</Badge>
              {purchasable ? (
                mode === "ONLINE" ? (
                  <Badge tone="success">{sm.purchasableBadge}</Badge>
                ) : null
              ) : (
                <Badge tone="warning">{sm.notPurchasableBadge}</Badge>
              )}
            </>
          ) : null
        }
        actions={
          product && tab === "general" ? (
            <Button type="submit" form={FORM_ID} disabled={saving}>
              {saving ? c.states.saving : d.saveAction}
            </Button>
          ) : null
        }
      />

      {notice ? (
        <div className="mb-5">
          <Alert
            tone="success"
            action={
              <button
                type="button"
                className="text-emerald-300 underline"
                onClick={() => setNotice(null)}
              >
                {c.actions.dismiss}
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}

      {state.status === "loading" ? <SkeletonRows rows={6} /> : null}

      {state.status === "error" ? (
        <Alert
          tone="error"
          title={d.loadError}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {c.actions.retry}
            </Button>
          }
        >
          {state.message}
        </Alert>
      ) : null}

      {product ? (
        <nav
          role="tablist"
          aria-label={t.eyebrow}
          className="mb-5 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1"
        >
          {PRODUCT_EDIT_TABS.map((key) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={[
                  "inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  "[&>span>svg]:h-4 [&>span>svg]:w-4",
                  active
                    ? "border-indigo-400/60 bg-indigo-500/[0.22] text-white shadow-[0_0_0_1px_rgba(129,140,248,0.20)]"
                    : "border-white/10 bg-white/[0.02] text-white/55 hover:border-white/20 hover:bg-white/[0.06] hover:text-white/90",
                ].join(" ")}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center ${active ? "text-indigo-200" : ""}`}
                  aria-hidden
                >
                  {TAB_ICONS[key]}
                </span>
                {d.tabs[key]}
              </button>
            );
          })}
        </nav>
      ) : null}

      {product && tab === "pricing" ? <PricingWorkspace productId={product.id} /> : null}

      {product && tab === "inventory" ? <InventoryWorkspace productId={product.id} /> : null}

      {product && tab === "general" ? (
        <DetailLayout
          main={
            <>
              <SurfaceCard
                title={d.basicInfoTitle}
                description={d.basicInfoSubtitle}
                icon={<ProductIcon />}
              >
                <ProductForm
                  mode="edit"
                  product={product}
                  statusLabels={statusLabels}
                  formId={FORM_ID}
                  onSavingChange={setSaving}
                  onSaved={(message, updated) => {
                    setState({ status: "ready", product: updated });
                    setNotice(message);
                  }}
                />
              </SurfaceCard>

              <SurfaceCard title={d.variantsTitle}>
                <VariantsSection product={product} />
              </SurfaceCard>
            </>
          }
          rail={
            <>
              <RailCard title={d.rail.salesProfile}>
                <div className="divide-y divide-white/[0.06]">
                  <RailRow label={d.rail.status} value={statusLabels[product.status]} />
                  <RailRow label={d.rail.salesMode} value={sm.modeLabels[mode]} />
                  <RailRow
                    label={d.rail.priceVisibility}
                    value={sm.priceVisibilityLabels[visibility]}
                  />
                  <RailRow label={d.rail.primaryAction} value={sm.actionLabels[action]} />
                  <RailRow
                    label={d.rail.purchasability}
                    value={
                      <Badge tone={purchasable ? "success" : "warning"}>
                        {purchasable ? sm.purchasableBadge : sm.notPurchasableBadge}
                      </Badge>
                    }
                  />
                </div>
              </RailCard>

              <RailCard title={d.rail.stockProfile}>
                <p className="text-sm text-white/45">{d.inventoryNote}</p>
                <Link
                  href="/inventory"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200"
                >
                  {d.inventoryLink} <span aria-hidden>→</span>
                </Link>
              </RailCard>

              <RailCard title={d.rail.metadata}>
                <div className="divide-y divide-white/[0.06]">
                  <RailRow label={t.form.slugLabel} value={product.slug} />
                  <RailRow label={d.rail.created} value={formatDate(product.createdAt)} />
                  <RailRow label={d.rail.lastUpdated} value={formatDate(product.updatedAt)} />
                </div>
              </RailCard>

              <RailCard title={d.rail.managementNoteTitle}>
                <p className="text-sm leading-relaxed text-white/45">{d.rail.managementNote}</p>
              </RailCard>
            </>
          }
        />
      ) : null}
    </>
  );
}
