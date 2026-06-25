"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Modal,
  PageHeader,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  Product,
  ProductCategory,
  ProductPriceVisibility,
  ProductPrimaryAction,
  ProductSalesMode,
} from "@commerce-os/api-client";
import { ProductIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { MetricGrid, MetricTile, SurfaceCard } from "../../components/premium";
import { ProductForm } from "./product-form";

type ProductStatus = Product["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; products: Product[]; total: number };

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

// Detay/düzenle = `/products/[id]` (modal değil). Liste sadece linkler.
const DETAIL_LINK_CLASS =
  "inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-card transition-colors hover:border-slate-300 hover:bg-slate-50";

export default function ProductsPage() {
  const router = useRouter();
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.products;
  const c = dict.common;
  const sm = t.salesModel;
  const statusLabels = t.statusLabels as Record<ProductStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [products, cats] = await Promise.all([
        storeApi.listProducts(),
        storeApi.listCategories(),
      ]);
      setCategories(cats.data);
      setState({ status: "ready", products: products.data, total: products.pagination.total });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const products = state.status === "ready" ? state.products : [];
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) map.set(category.id, category.name);
    return map;
  }, [categories]);

  // Ozet metrikleri canli listeden hesaplanir (yeni API cagrisi yok).
  const metrics = useMemo(() => {
    const active = products.filter((p) => p.status === "ACTIVE").length;
    const purchasable = products.filter((p) => (p.purchasable ?? true) === true).length;
    const catalogOnly = products.filter((p) => (p.salesMode ?? "ONLINE") === "CATALOG_ONLY").length;
    return { active, purchasable, catalogOnly };
  }, [products]);

  const columns: DataTableColumn<Product>[] = [
    {
      header: t.table.title,
      cell: (product) => (
        <div>
          <p className="font-medium text-slate-900">{product.title}</p>
          <p className="font-mono text-xs text-slate-400">{product.slug}</p>
        </div>
      ),
    },
    {
      header: t.table.status,
      cell: (product) => (
        <Badge tone={STATUS_TONES[product.status]}>{statusLabels[product.status]}</Badge>
      ),
    },
    {
      header: sm.columnHeader,
      cell: (product) => {
        // Eski (F2D oncesi) kayitlar icin guvenli varsayilanlar.
        const mode = (product.salesMode ?? "ONLINE") as ProductSalesMode;
        const visibility = (product.priceVisibility ?? "VISIBLE") as ProductPriceVisibility;
        const action = (product.primaryAction ?? "ADD_TO_CART") as ProductPrimaryAction;
        const purchasable = product.purchasable ?? true;
        return (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={SALES_MODE_TONES[mode]} dot>
                {sm.modeLabels[mode]}
              </Badge>
              {!purchasable ? (
                <Badge tone="warning">{sm.notPurchasableBadge}</Badge>
              ) : mode === "ONLINE" ? (
                <Badge tone="success">{sm.purchasableBadge}</Badge>
              ) : null}
            </div>
            <p className="text-xs text-slate-400">
              {sm.priceVisibilityLabels[visibility]} · {sm.actionLabels[action]}
            </p>
          </div>
        );
      },
    },
    {
      header: t.table.brand,
      cell: (product) => (
        <span className="text-slate-500">{product.brand ?? product.vendor ?? t.noBrand}</span>
      ),
    },
    {
      header: t.table.categories,
      cell: (product) => (
        <span className="text-slate-500">
          {product.categoryIds.length === 0
            ? "—"
            : product.categoryIds.map((id) => categoryNameById.get(id) ?? id).join(", ")}
        </span>
      ),
    },
    {
      header: t.table.actions,
      align: "right",
      cell: (product) => (
        <div className="flex justify-end gap-2">
          <Link href={`/products/${product.id}`} className={DETAIL_LINK_CLASS}>
            {t.detailAction}
          </Link>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button onClick={() => setCreating(true)}>{t.addProduct}</Button>}
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

      {state.status === "ready" && products.length > 0 ? (
        <div className="mb-5">
          <MetricGrid columns={4}>
            <MetricTile
              label={t.summary.total}
              value={state.total}
              hint={t.summary.totalHint}
              tone="brand"
            />
            <MetricTile
              label={t.summary.active}
              value={metrics.active}
              hint={t.summary.activeHint}
              tone="success"
            />
            <MetricTile
              label={t.summary.purchasable}
              value={metrics.purchasable}
              hint={t.summary.purchasableHint}
            />
            <MetricTile
              label={t.summary.catalog}
              value={metrics.catalogOnly}
              hint={t.summary.catalogHint}
            />
          </MetricGrid>
        </div>
      ) : null}

      <SurfaceCard
        title={t.cardTitle}
        description={
          state.status === "ready" ? format(t.countLabel, { count: state.total }) : t.cardDescription
        }
        icon={<ProductIcon />}
      >
        {state.status === "loading" ? <SkeletonRows rows={4} /> : null}

        {state.status === "error" ? (
          <Alert
            tone="error"
            title={t.loadError}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {c.actions.retry}
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}

        {state.status === "ready" && products.length === 0 ? (
          <EmptyState
            tag={t.emptyTag}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<ProductIcon />}
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                {t.emptyAction}
              </Button>
            }
          />
        ) : null}

        {state.status === "ready" && products.length > 0 ? (
          <DataTable
            columns={columns}
            rows={products}
            rowKey={(product) => product.id}
            caption={t.cardTitle}
          />
        ) : null}
      </SurfaceCard>

      {creating ? (
        <CreateProduct
          categories={categories}
          statusLabels={statusLabels}
          onClose={() => setCreating(false)}
          onCreated={(product) => {
            setCreating(false);
            // Create sonrasi: edit modal degil, dedicated detail route'una yonlendir.
            router.push(`/products/${product.id}`);
          }}
        />
      ) : null}
    </>
  );
}

/** Kısa create modal'ı (kural: kısa create/edit modal kalabilir). */
function CreateProduct({
  categories,
  statusLabels,
  onClose,
  onCreated,
}: {
  categories: ProductCategory[];
  statusLabels: Record<ProductStatus, string>;
  onClose: () => void;
  onCreated: (product: Product) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.products;
  const c = dict.common;
  const f = t.form;
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={f.createTitle}
      description={f.createSubtitle}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {c.actions.cancel}
          </Button>
          <Button type="submit" form="product-create-form" disabled={saving}>
            {saving ? c.states.saving : f.submitCreate}
          </Button>
        </>
      }
    >
      <ProductForm
        mode="create"
        categories={categories}
        statusLabels={statusLabels}
        formId="product-create-form"
        onSavingChange={setSaving}
        onSaved={(_message, product) => onCreated(product)}
      />
    </Modal>
  );
}
