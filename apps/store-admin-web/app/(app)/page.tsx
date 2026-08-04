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
} from "../../components/ui";
import Link from "next/link";
import { getDictionary } from "@commerce-os/i18n";
import type { PendingWorkSummary } from "@commerce-os/api-client";
import { CategoryIcon, InventoryIcon, ProductIcon } from "../../components/icons";
import { storeApi, type DashboardSummary, type StoreContext } from "../../lib/client/api";
import { onPendingWorkChanged } from "../../lib/client/pending-work-events";
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

  // TODO-170-recovery — Bekleyen İşler (tür/adet/en eski bekleme + filtreli ekran linki). Mount'ta
  // yüklenir ve ilgili mutasyon sonrası (event) tazelenir. Store-scoped (BFF).
  const [pending, setPending] = useState<PendingWorkSummary | null>(null);
  useEffect(() => {
    let active = true;
    const loadPending = () => {
      storeApi
        .pendingWork()
        .then((res) => {
          if (active) setPending(res);
        })
        .catch(() => {
          /* opsiyonel kart; sessizce yok say */
        });
    };
    loadPending();
    const unsubscribe = onPendingWorkChanged(loadPending);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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
                <dt className="text-white/30">{t.storeCard.nameLabel}</dt>
                <dd className="mt-0.5 font-medium text-white/90">{summary.store.name}</dd>
              </div>
              <div>
                <dt className="text-white/30">{t.storeCard.slugLabel}</dt>
                <dd className="mt-0.5 font-mono text-xs text-white/60">{summary.store.slug}</dd>
              </div>
              <div>
                <dt className="text-white/30">{t.storeCard.statusLabel}</dt>
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
              <p className="text-sm font-medium text-white/90">{t.emptyTitle}</p>
              <p className="mt-1 text-sm text-white/45">{t.emptyDescription}</p>
            </div>
          ) : summary ? (
            <div className="text-3xl font-semibold tracking-tightish text-white/90">
              {summary.inventory.totalOnHand}
            </div>
          ) : null}
        </SectionCard>
      </div>

      <div className="mt-6">
        <PendingWorkCard pending={pending} locale={locale} />
      </div>
    </>
  );
}

/**
 * TODO-170-recovery — "Bekleyen İşler" kartı. Her satır: tür + adet + en eski bekleme süresi +
 * doğrudan ilgili filtreli ekrana link. 0 olan türler gizlenir; hepsi 0 ise dürüst boş-durum.
 * Etiketler yerel (paylaşılan i18n'e dokunmadan, store-nav deseniyle).
 */
function PendingWorkCard({
  pending,
  locale,
}: {
  pending: PendingWorkSummary | null;
  locale: string;
}) {
  const tr = locale === "tr";
  const title = tr ? "Bekleyen İşler" : "Pending work";
  const description = tr
    ? "Aksiyon bekleyen moderasyon ve iade işleri."
    : "Moderation and return work awaiting action.";
  const now = Date.now();
  const ageDays = (iso: string | null): number | null => {
    if (!iso) return null;
    return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
  };
  const oldestLabel = (iso: string | null): string => {
    const days = ageDays(iso);
    if (days === null) return "";
    if (days === 0) return tr ? "en eski: bugün" : "oldest: today";
    return tr ? `en eski: ${days} gün önce` : `oldest: ${days}d ago`;
  };

  const rows = pending
    ? [
        {
          key: "reviews",
          label: tr ? "değerlendirme onay bekliyor" : "reviews awaiting approval",
          count: pending.reviews.count,
          oldestAt: pending.reviews.oldestAt,
          href: "/reviews?status=PENDING",
        },
        {
          key: "newRequests",
          label: tr ? "iade talebi incelenmeyi bekliyor" : "return requests awaiting review",
          count: pending.returns.newRequests.count,
          oldestAt: pending.returns.newRequests.oldestAt,
          href: "/orders/returns?status=REQUESTED",
        },
        {
          key: "inspection",
          label: tr ? "iade ürün inceleme bekliyor" : "returns awaiting inspection",
          count: pending.returns.inspection.count,
          oldestAt: pending.returns.inspection.oldestAt,
          href: "/orders/returns?status=INSPECTION_REQUIRED",
        },
        {
          key: "financialAction",
          label: tr
            ? "iade inceleme sonrası finansal aksiyon bekliyor"
            : "returns awaiting post-inspection action",
          count: pending.returns.financialAction.count,
          oldestAt: pending.returns.financialAction.oldestAt,
          href: "/orders/returns?status=REFUND_PENDING",
        },
      ].filter((r) => r.count > 0)
    : [];

  return (
    <SectionCard title={title} description={description}>
      {pending === null ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/45">
          {tr ? "Şu anda bekleyen iş yok." : "No pending work right now."}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={row.href}
                className="flex items-center gap-3 py-2.5 transition-colors hover:bg-white/[0.03]"
              >
                <span className="inline-flex min-w-[28px] shrink-0 items-center justify-center rounded-md bg-indigo-500/90 px-2 py-1 text-sm font-semibold text-white">
                  {row.count > 99 ? "99+" : row.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white/90">
                    {row.count} {row.label}
                  </span>
                  {row.oldestAt ? (
                    <span className="block text-xs text-white/40">{oldestLabel(row.oldestAt)}</span>
                  ) : null}
                </span>
                <span aria-hidden className="text-white/30">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
