"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SectionCard,
  Skeleton,
  StatCard,
  useLocale,
} from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type { AdminStore, Plan } from "@commerce-os/api-client";
import { HealthIcon, PlanIcon, StoreIcon } from "../../components/icons";
import { useSessionUser } from "../../components/session-context";
import { adminApi, type SystemHealth } from "../../lib/client/api";
import { messageForError } from "../../lib/client/messages";

type StoreStatus = AdminStore["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      stores: AdminStore[];
      storeTotal: number;
      activeStores: number;
      plans: Plan[];
      planTotal: number;
      health: SystemHealth | null;
    };

const STATUS_TONES: Record<StoreStatus, "success" | "neutral" | "warning" | "danger"> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  SUSPENDED: "warning",
  CLOSED: "danger",
};

export default function DashboardPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.admin.dashboard;
  const c = dict.common;
  const statusLabels = dict.admin.stores.statusLabels as Record<StoreStatus, string>;
  const user = useSessionUser();

  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    async function load() {
      setState({ status: "loading" });
      try {
        const [stores, plans, health] = await Promise.all([
          adminApi.listStores(),
          adminApi.listPlans(),
          adminApi.systemHealth().catch(() => null),
        ]);
        if (!active) return;
        setState({
          status: "ready",
          stores: stores.data.slice(0, 5),
          storeTotal: stores.pagination.total,
          activeStores: stores.data.filter((store) => store.status === "ACTIVE").length,
          plans: plans.data.slice(0, 5),
          planTotal: plans.pagination.total,
          health,
        });
      } catch (error) {
        if (active) setState({ status: "error", message: messageForError(error, locale) });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [locale]);

  const greetingName = user?.name ?? user?.email ?? "";
  const ready = state.status === "ready" ? state : null;
  const healthOk = ready?.health?.health.status === "ok";

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={greetingName ? format(t.greeting, { name: greetingName }) : t.description}
      />

      {state.status === "error" ? (
        <Alert tone="error" title={t.loadError}>
          {state.message}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.stats.totalStores}
          value={ready ? ready.storeTotal : <Skeleton className="h-7 w-12" />}
          hint={t.stats.totalStoresHint}
        />
        <StatCard
          label={t.stats.activeStores}
          value={ready ? ready.activeStores : <Skeleton className="h-7 w-12" />}
          hint={t.stats.activeStoresHint}
        />
        <StatCard
          label={t.stats.plans}
          value={ready ? ready.planTotal : <Skeleton className="h-7 w-12" />}
          hint={t.stats.plansHint}
        />
        <StatCard
          label={t.stats.systemStatus}
          value={ready?.health ? (healthOk ? c.status.healthy : c.status.degraded) : "—"}
          badge={ready?.health ? c.status.live : undefined}
          badgeTone={healthOk ? "success" : "warning"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title={t.storesCard.title}
          description={t.storesCard.recentTitle}
          icon={<StoreIcon />}
          actions={
            <Link href="/stores">
              <Button variant="ghost" size="sm">
                {c.actions.manage}
              </Button>
            </Link>
          }
        >
          {!ready ? (
            <SummarySkeleton />
          ) : ready.stores.length === 0 ? (
            <EmptyState
              tag={t.storesCard.emptyTag}
              title={t.storesCard.emptyTitle}
              description={t.storesCard.emptyDescription}
              action={
                <Link href="/stores">
                  <Button size="sm">{t.storesCard.emptyAction}</Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {ready.stores.map((store) => (
                <li key={store.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{store.name}</p>
                    <p className="font-mono text-xs text-slate-400">{store.slug}</p>
                  </div>
                  <Badge tone={STATUS_TONES[store.status]}>{statusLabels[store.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={t.plansCard.title}
          description={t.plansCard.recentTitle}
          icon={<PlanIcon />}
          actions={
            <Link href="/plans">
              <Button variant="ghost" size="sm">
                {c.actions.manage}
              </Button>
            </Link>
          }
        >
          {!ready ? (
            <SummarySkeleton />
          ) : ready.plans.length === 0 ? (
            <EmptyState
              tag={t.plansCard.emptyTag}
              title={t.plansCard.emptyTitle}
              description={t.plansCard.emptyDescription}
              action={
                <Link href="/plans">
                  <Button size="sm">{t.plansCard.emptyAction}</Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {ready.plans.map((plan) => (
                <li key={plan.id} className="flex items-center justify-between py-2.5">
                  <p className="truncate text-sm font-medium text-slate-900">{plan.name}</p>
                  <span className="font-mono text-xs text-slate-400">{plan.code}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={t.healthCard.title}
          description={t.healthCard.description}
          icon={<HealthIcon />}
          actions={
            <Link href="/system-health">
              <Button variant="ghost" size="sm">
                {c.actions.view}
              </Button>
            </Link>
          }
        >
          {!ready ? (
            <SummarySkeleton />
          ) : ready.health ? (
            <ul className="divide-y divide-slate-100">
              <li className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-600">{t.healthCard.gatewayLabel}</span>
                <Badge tone={healthOk ? "success" : "warning"} dot>
                  {healthOk ? c.status.ok : c.status.degraded}
                </Badge>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-600">{t.healthCard.versionLabel}</span>
                <span className="font-mono text-xs text-slate-500">{ready.health.version.version}</span>
              </li>
            </ul>
          ) : (
            <EmptyState
              tag={t.healthCard.emptyTag}
              title={t.healthCard.emptyTitle}
              description={t.healthCard.emptyDescription}
              action={
                <Link href="/system-health">
                  <Button size="sm" variant="secondary">
                    {t.healthCard.emptyAction}
                  </Button>
                </Link>
              }
            />
          )}
        </SectionCard>
      </div>
    </>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex items-center justify-between">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}
