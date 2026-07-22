"use client";

/**
 * TODO-159A (ADR-089) — Müşteri dizini ortak Admin Data Grid'e taşındı.
 * Arama (e-posta/ad/soyad/telefon), durum + üyelik filtresi, sıralama ve
 * sayfalama SUNUCUDA uygulanır.
 */

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  useLocale,
} from "../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
} from "../../../components/data-grid";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  AdminListPagination,
  StoreAdminCustomerSummary,
  StoreAdminCustomerStatus,
} from "@commerce-os/api-client";
import { CustomerIcon } from "../../../components/icons";
import { storeApi, type ActivationInfo } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";
import { ActivationLinkModal } from "./activation-link-modal";

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
  | { status: "ready"; customers: StoreAdminCustomerSummary[]; pagination: AdminListPagination };

type CustomerFilters = { status: string; hasCredential: string };

export default function CustomersPage() {
  // useSearchParams (Data Grid URL state) Suspense sınırı ister.
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <CustomersView />
    </Suspense>
  );
}

function CustomersView() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.customers;
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;
  const statusLabels = t.statusLabels as Record<StoreAdminCustomerStatus, string>;

  const grid = useDataGridQuery<CustomerFilters>({
    basePath: "/customers",
    sortOptions: ["createdAt", "firstName", "email"],
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    filterKeys: ["status", "hasCredential"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listCustomers(requestQuery);
      setState({ status: "ready", customers: result.data, pagination: result.pagination });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale, requestQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const customers = state.status === "ready" ? state.customers : [];
  const pagination = state.status === "ready" ? state.pagination : null;

  const columns: DataGridColumn<StoreAdminCustomerSummary>[] = [
    {
      key: "firstName",
      sortable: true,
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
      key: "contact",
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
      key: "status",
      header: t.table.status,
      className: "whitespace-nowrap",
      cell: (customer) => (
        <Badge tone={STATUS_TONES[customer.status]}>{statusLabels[customer.status]}</Badge>
      ),
    },
    {
      key: "membership",
      header: t.table.membership,
      className: "whitespace-nowrap",
      cell: (customer) => (
        <Badge tone={customer.hasCredential ? "info" : "neutral"}>
          {customer.hasCredential ? t.membership.member : t.membership.guest}
        </Badge>
      ),
    },
    {
      key: "orders",
      header: t.table.orders,
      className: "whitespace-nowrap",
      cell: (customer) => (
        <span className="tabular-nums text-white/60">
          {format(t.orderCountLabel, { count: customer.orderCount })}
        </span>
      ),
    },
    {
      key: "spend",
      header: t.table.spend,
      className: "whitespace-nowrap",
      cell: (customer) => (
        <span className="font-medium tabular-nums text-white/90">
          {formatMinor(customer.totalSpentMinor, customer.currency)}
        </span>
      ),
    },
    {
      key: "address",
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
      key: "created",
      sortable: true,
      header: t.table.created,
      className: "whitespace-nowrap",
      cell: (customer) => <span className="text-white/45">{formatDate(customer.createdAt)}</span>,
    },
    {
      key: "action",
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
            <Button onClick={() => setCreating(true)}>{t.create.cta}</Button>
          </div>
        }
      />

      {creating ? <CreateCustomerModal onClose={() => setCreating(false)} /> : null}

      {/*
        TODO-159A — Eski özet kartları (üye/doğrulanmış sayısı) YALNIZ o an yüklü
        sayfadan hesaplanıyordu; sunucu-taraflı sayfalamada bu rakam yanıltıcı olur.
        Mağaza-geneli doğru toplam artık sayfalama çubuğundaki "toplam kayıt"tır.
      */}

      <SurfaceCard
        title={t.cardTitle}
        description={
          pagination ? format(t.countLabel, { count: pagination.totalItems }) : t.cardDescription
        }
        icon={<CustomerIcon />}
      >
        <DataGridToolbar
          labels={{
            searchPlaceholder: t.grid.searchPlaceholder,
            searchLabel: g.searchLabel,
            searchSubmit: g.searchSubmit,
            filters: g.filters,
            filtersApply: g.filtersApply,
            filtersClear: g.filtersClear,
            filterAll: g.filterAll,
            removeFilter: g.removeFilter,
            sortLabel: g.sortLabel,
          }}
          search={grid.search}
          onSearchChange={grid.setSearch}
          filters={[
            {
              kind: "select",
              key: "status",
              label: t.grid.filters.status,
              options: (
                ["ACTIVE", "PASSIVE", "BLOCKED", "ARCHIVED"] as StoreAdminCustomerStatus[]
              ).map((value) => ({ value, label: statusLabels[value] })),
            },
            {
              kind: "select",
              key: "hasCredential",
              label: t.grid.filters.membership,
              options: [
                { value: "true", label: t.grid.membershipLabels.true },
                { value: "false", label: t.grid.membershipLabels.false },
              ],
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<CustomerFilters>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[
            { value: "createdAt:desc", label: t.grid.sort.newest },
            { value: "createdAt:asc", label: t.grid.sort.oldest },
            { value: "firstName:asc", label: t.grid.sort.nameAsc },
            { value: "firstName:desc", label: t.grid.sort.nameDesc },
            { value: "email:asc", label: t.grid.sort.emailAsc },
            { value: "email:desc", label: t.grid.sort.emailDesc },
          ]}
          sortValue={`${grid.sortBy}:${grid.sortOrder}`}
          onSortChange={(value) => {
            const [sortBy, sortOrder] = value.split(":");
            grid.setSort(sortBy, sortOrder === "asc" ? "asc" : "desc");
          }}
        />

        <DataGrid
          columns={columns}
          rows={customers}
          rowKey={(customer) => customer.id}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={grid.activeFilterCount > 0}
          caption={t.cardTitle}
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<CustomerIcon />}
          labels={{
            loading: g.loading,
            errorTitle: t.loadError,
            retry: c.actions.retry,
            emptyTitle: t.emptyTitle,
            emptyDescription: t.emptyDescription,
            emptyFilteredTitle: g.emptyFilteredTitle,
            emptyFilteredDescription: g.emptyFilteredDescription,
            selectRow: g.selectRow,
            selectAll: g.selectAll,
          }}
        />

        {pagination ? (
          <DataGridPagination
            labels={{
              rangeLabel: g.rangeLabel,
              rangeEmpty: g.rangeEmpty,
              previousPage: g.previousPage,
              nextPage: g.nextPage,
              pageSizeLabel: g.pageSizeLabel,
              goToPage: g.goToPage,
              pageOf: g.pageOf,
            }}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            onPageChange={grid.setPage}
            onPageSizeChange={grid.setPageSize}
          />
        ) : null}
      </SurfaceCard>
    </>
  );
}

/* ── Yeni müşteri oluşturma (TODO-087) ────────────────────────────────────────
 * Kısa create modal. Başarılı olunca: üyelik istendiyse önce tek seferlik
 * aktivasyon linkini gösterir, ardından detail route'una yönlendirir; üyelik
 * yoksa doğrudan yönlendirir (detail route kuralı korunur). */
function CreateCustomerModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.customers;
  const f = t.create;
  const c = dict.common;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "PASSIVE" | "BLOCKED">("ACTIVE");
  const [createMembership, setCreateMembership] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Üyelik linki üretildiyse önce gösterilir; "Detaya git" ile yönlendirilir.
  const [result, setResult] = useState<{ id: string; activation: ActivationInfo | null } | null>(null);

  function goToDetail(id: string) {
    onClose();
    router.push(`/customers/${id}`);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (fullName.trim().length === 0) {
      setError(f.fullNameRequired);
      return;
    }
    if (email.trim().length === 0 && phone.trim().length === 0) {
      setError(f.identifierRequired);
      return;
    }
    setSaving(true);
    try {
      const created = await storeApi.createCustomer({
        fullName: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        status,
        createMembership,
      });
      if (created.activation) {
        setResult({ id: created.customer.id, activation: created.activation });
      } else {
        goToDetail(created.customer.id);
      }
    } catch (err) {
      setError(messageForError(err, locale));
      setSaving(false);
    }
  }

  if (result?.activation) {
    return (
      <ActivationLinkModal
        activation={result.activation}
        onClose={() => goToDetail(result.id)}
        extraFooter={
          <Button variant="secondary" onClick={() => goToDetail(result.id)}>
            {f.goToDetail}
          </Button>
        }
      />
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={f.title}
      description={f.description}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {f.cancel}
          </Button>
          <Button type="submit" form="customer-create-form" disabled={saving}>
            {f.submit}
          </Button>
        </>
      }
    >
      <form id="customer-create-form" onSubmit={onSubmit} className="space-y-3" noValidate>
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : null}
        <Input
          id="cc-fullname"
          label={f.fullName}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={saving}
          required
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            id="cc-email"
            type="email"
            label={f.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={saving}
          />
          <Input
            id="cc-phone"
            label={f.phone}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={saving}
          />
        </div>
        <Select
          id="cc-status"
          label={f.status}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          disabled={saving}
          options={[
            { value: "ACTIVE", label: f.statusActive },
            { value: "PASSIVE", label: f.statusPassive },
            { value: "BLOCKED", label: f.statusBlocked },
          ]}
        />
        <label className="flex items-start gap-2 rounded-lg border border-white/[0.07] px-4 py-3 text-sm text-white/80">
          <input
            type="checkbox"
            checked={createMembership}
            onChange={(e) => setCreateMembership(e.target.checked)}
            disabled={saving}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium text-white/90">{f.membership}</span>
            <span className="block text-xs text-white/45">{f.membershipHint}</span>
          </span>
        </label>
      </form>
    </Modal>
  );
}
