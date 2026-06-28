"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "../../../components/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type { StoreAdminCustomerSummary, StoreAdminCustomerStatus } from "@commerce-os/api-client";
import { CustomerIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../lib/client/format";
import { MetricGrid, MetricTile, SurfaceCard } from "../../components/premium";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const STATUS_TONES: Record<StoreAdminCustomerStatus, Tone> = {
  ACTIVE: "success",
  PASSIVE: "neutral",
  BLOCKED: "danger",
  ARCHIVED: "warning",
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; customers: StoreAdminCustomerSummary[]; total: number };

export default function CustomersPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.customers;
  const c = dict.common;
  const statusLabels = t.statusLabels as Record<StoreAdminCustomerStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listCustomers();
      setState({ status: "ready", customers: result.data, total: result.pagination.total });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const customers = state.status === "ready" ? state.customers : [];

  // Özet kartlar canlı listeden hesaplanır (ek API çağrısı yok).
  const metrics = useMemo(() => {
    let members = 0;
    let verified = 0;
    for (const customer of customers) {
      if (customer.hasCredential) members += 1;
      if (customer.emailVerified) verified += 1;
    }
    return { members, verified };
  }, [customers]);

  const columns: DataTableColumn<StoreAdminCustomerSummary>[] = [
    {
      header: t.table.customer,
      className: "max-w-[18rem]",
      cell: (customer) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-white/90" title={customer.fullName}>
            {customer.fullName}
          </p>
          <p className="truncate text-xs text-white/30" title={customer.email ?? undefined}>
            {customer.email ?? t.noEmail}
          </p>
        </div>
      ),
    },
    {
      header: t.table.contact,
      className: "whitespace-nowrap",
      cell: (customer) => (
        <div className="space-y-0.5">
          <p className="text-sm text-white/60">{customer.phone ?? t.noPhone}</p>
          <div className="flex gap-1.5">
            {customer.emailVerified ? (
              <Badge tone="success" dot>
                {t.verified.email}
              </Badge>
            ) : null}
            {customer.phoneVerified ? (
              <Badge tone="info" dot>
                {t.verified.phone}
              </Badge>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      header: t.table.status,
      className: "whitespace-nowrap",
      cell: (customer) => (
        <Badge tone={STATUS_TONES[customer.status]}>{statusLabels[customer.status]}</Badge>
      ),
    },
    {
      header: t.table.membership,
      className: "whitespace-nowrap",
      cell: (customer) => (
        <Badge tone={customer.hasCredential ? "info" : "neutral"}>
          {customer.hasCredential ? t.membership.member : t.membership.guest}
        </Badge>
      ),
    },
    {
      header: t.table.orders,
      className: "whitespace-nowrap",
      cell: (customer) => (
        <span className="tabular-nums text-white/60">
          {format(t.orderCountLabel, { count: customer.orderCount })}
        </span>
      ),
    },
    {
      header: t.table.spend,
      className: "whitespace-nowrap",
      cell: (customer) => (
        <span className="font-medium tabular-nums text-white/90">
          {formatMinor(customer.totalSpentMinor, customer.currency)}
        </span>
      ),
    },
    {
      header: t.table.address,
      className: "max-w-[14rem]",
      cell: (customer) => (
        <span
          className="block truncate text-white/45"
          title={customer.defaultAddressSummary ?? undefined}
        >
          {customer.defaultAddressSummary ?? t.noAddress}
        </span>
      ),
    },
    {
      header: t.table.created,
      className: "whitespace-nowrap",
      cell: (customer) => <span className="text-white/45">{formatDate(customer.createdAt)}</span>,
    },
    {
      header: t.table.action,
      align: "right",
      className: "whitespace-nowrap",
      cell: (customer) => (
        <Link
          href={`/customers/${customer.id}`}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 px-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          {t.manageAction}
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              {c.actions.refresh}
            </Button>
            <Button variant="secondary">{c.actions.export}</Button>
          </div>
        }
      />

      {state.status === "ready" && customers.length > 0 ? (
        <div className="mb-5">
          <MetricGrid columns={3}>
            <MetricTile
              label={t.summary.total}
              value={state.total}
              hint={t.summary.totalHint}
              tone="brand"
            />
            <MetricTile
              label={t.summary.members}
              value={metrics.members}
              hint={t.summary.membersHint}
              tone="success"
            />
            <MetricTile
              label={t.summary.verified}
              value={metrics.verified}
              hint={t.summary.verifiedHint}
            />
          </MetricGrid>
        </div>
      ) : null}

      <SurfaceCard
        title={t.cardTitle}
        description={
          state.status === "ready" ? format(t.countLabel, { count: state.total }) : t.cardDescription
        }
        icon={<CustomerIcon />}
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

        {state.status === "ready" && customers.length === 0 ? (
          <EmptyState
            tag={t.emptyTag}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<CustomerIcon />}
          />
        ) : null}

        {state.status === "ready" && customers.length > 0 ? (
          <DataTable
            columns={columns}
            rows={customers}
            rowKey={(customer) => customer.id}
            caption={t.cardTitle}
          />
        ) : null}
      </SurfaceCard>
    </>
  );
}
