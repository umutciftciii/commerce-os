"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  SectionCard,
  SkeletonRows,
  useLocale,
} from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import type { Product, ProductCategory } from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { ProductForm } from "../product-form";
import { VariantsSection } from "../variants-manager";

type ProductStatus = Product["status"];

const STATUS_TONES: Record<ProductStatus, "success" | "neutral" | "warning"> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  ARCHIVED: "warning",
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; product: Product; categories: ProductCategory[] };

const FORM_ID = "product-edit-form";

/**
 * Ürün detay/düzenleme: modal değil, kendi route'unda (`/products/[id]`) tam sayfa.
 * Temel bilgiler + satış davranışı tek formda; varyantlar inline bölüm olarak yer alır.
 * Uzun form doğal sayfa scroll'u ile akar.
 */
export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.products;
  const c = dict.common;
  const d = t.detail;
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

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={product ? product.title : t.title}
        description={d.pageDescription}
        breadcrumb={
          <Link href="/products" className="text-brand-600 hover:text-brand-700 hover:underline">
            ← {d.backToList}
          </Link>
        }
        actions={
          product ? (
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONES[product.status]}>{statusLabels[product.status]}</Badge>
              <Button type="submit" form={FORM_ID} disabled={saving}>
                {saving ? c.states.saving : d.saveAction}
              </Button>
            </div>
          ) : null
        }
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button
                type="button"
                className="text-emerald-700 underline"
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
        <div className="space-y-5">
          <SectionCard title={d.basicInfoTitle} description={d.basicInfoSubtitle}>
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
          </SectionCard>

          <SectionCard title={d.variantsTitle}>
            <VariantsSection product={product} />
          </SectionCard>

          <SectionCard title={d.inventoryTitle} description={d.inventoryNote}>
            <Link
              href="/inventory"
              className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              {d.inventoryLink} →
            </Link>
          </SectionCard>
        </div>
      ) : null}
    </>
  );
}
