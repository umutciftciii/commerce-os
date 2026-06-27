"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Badge, Button, SkeletonRows, useLocale } from "../../../../components/ui";
import { getDictionary } from "@commerce-os/i18n";
import type {
  Product,
  ProductCategory,
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
import { ProductIcon } from "../../../../components/icons";
import { ProductForm } from "../product-form";
import { VariantsSection } from "../variants-manager";

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
  | { status: "ready"; product: Product; categories: ProductCategory[] };

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

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [product, cats] = await Promise.all([
        storeApi.getProduct(productId),
        storeApi.listCategories(),
      ]);
      setState({ status: "ready", product, categories: cats.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [productId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const product = state.status === "ready" ? state.product : null;
  const categories = state.status === "ready" ? state.categories : [];

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
          product ? (
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
                  categories={categories}
                  statusLabels={statusLabels}
                  formId={FORM_ID}
                  onSavingChange={setSaving}
                  onSaved={(message, updated) => {
                    setState({ status: "ready", product: updated, categories });
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
