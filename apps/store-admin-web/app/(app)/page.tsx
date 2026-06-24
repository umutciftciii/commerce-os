"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  SectionCard,
  Skeleton,
  StatCard,
  useLocale,
} from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { CategoryIcon, InventoryIcon, ProductIcon } from "../../components/icons";
import { storeApi, type DashboardSummary, type StoreContext } from "../../lib/client/api";
import { messageForError } from "../../lib/client/messages";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: DashboardSummary };

export default function StoreDashboardPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.dashboard;
  const c = dict.common;
  const statusLabels = dict.storeAdmin.storeStatusLabels as Record<StoreContext["status"], string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const summary = await storeApi.dashboardSummary();
      setState({ status: "ready", summary });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const loading = state.status === "loading";
  const summary = state.status === "ready" ? state.summary : null;
  const skeleton = <Skeleton className="h-7 w-16" />;
  const empty =
    summary !== null &&
    summary.products.total === 0 &&
    summary.categories.total === 0 &&
    summary.inventory.records === 0;

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            {t.refresh}
          </Button>
        }
      />

      {state.status === "error" ? (
        <div className="mb-4">
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
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<ProductIcon />}
          label={t.stats.products}
          value={loading ? skeleton : (summary?.products.total ?? "—")}
          hint={t.stats.productsHint}
        />
        <StatCard
          icon={<ProductIcon />}
          label={t.stats.activeProducts}
          value={loading ? skeleton : (summary?.products.active ?? "—")}
          hint={t.stats.activeProductsHint}
        />
        <StatCard
          icon={<CategoryIcon />}
          label={t.stats.categories}
          value={loading ? skeleton : (summary?.categories.total ?? "—")}
          hint={t.stats.categoriesHint}
        />
        <StatCard
          icon={<InventoryIcon />}
          label={t.stats.lowStock}
          value={loading ? skeleton : (summary?.inventory.lowStock ?? "—")}
          badge={summary && summary.inventory.lowStock > 0 ? t.stats.lowStock : undefined}
          badgeTone="warning"
          hint={t.stats.lowStockHint}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title={t.storeCard.title} description={t.storeCard.description}>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ) : summary ? (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">{t.storeCard.nameLabel}</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{summary.store.name}</dd>
              </div>
              <div>
                <dt className="text-slate-400">{t.storeCard.slugLabel}</dt>
                <dd className="mt-0.5 font-mono text-xs text-slate-600">{summary.store.slug}</dd>
              </div>
              <div>
                <dt className="text-slate-400">{t.storeCard.statusLabel}</dt>
                <dd className="mt-1">
                  <Badge tone="info">{statusLabels[summary.store.status]}</Badge>
                </dd>
              </div>
            </dl>
          ) : null}
        </SectionCard>

        <SectionCard title={t.stats.totalStock} description={t.stats.totalStockHint}>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : empty ? (
            <div>
              <p className="text-sm font-medium text-slate-900">{t.emptyTitle}</p>
              <p className="mt-1 text-sm text-slate-500">{t.emptyDescription}</p>
            </div>
          ) : summary ? (
            <div className="text-3xl font-semibold tracking-tightish text-slate-900">
              {summary.inventory.totalOnHand}
            </div>
          ) : null}
        </SectionCard>
      </div>
    </>
  );
}
