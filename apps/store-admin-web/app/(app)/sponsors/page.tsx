"use client";

/**
 * TODO-161A — Sponsor firmalar + sponsorluk KPI panosu. Üstte para-birimi bazlı KPI
 * (ADR-127: farklı para birimleri TOPLANMAZ), altta sponsor cari Data Grid'i. "Yeni sponsor"
 * modal ile firma açar. Satır adı sponsor detayına gider.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Modal, PageHeader, SkeletonRows, Textarea, useLocale } from "../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
} from "../../../components/data-grid";
import { getDictionary } from "@commerce-os/i18n";
import type { AdminListPagination, SponsorAccountSummary, SponsorAccountStatus, SponsorshipDashboardResponse } from "@commerce-os/api-client";
import { CustomerIcon } from "../../../components/icons";
import { storeApi, UiError } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";
import { sponsorshipError, type Locale } from "./labels";

const STATUS_TONE: Record<SponsorAccountStatus, "success" | "neutral"> = { ACTIVE: "success", INACTIVE: "neutral" };

function errorText(error: unknown, locale: Locale): string {
  if (error instanceof UiError) return sponsorshipError(error.code) ?? messageForError(error, locale);
  return messageForError(error, locale);
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: SponsorAccountSummary[]; pagination: AdminListPagination };

export default function SponsorsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <SponsorsView />
    </Suspense>
  );
}

function SponsorsView() {
  const locale = useLocale() as Locale;
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;

  const grid = useDataGridQuery<{ status: string }>({
    basePath: "/sponsors",
    sortOptions: ["createdAt", "companyName", "status"],
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    filterKeys: ["status"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(() => JSON.parse(requestKey) as Record<string, string | number>, [requestKey]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listSponsors(requestQuery);
      setState({ status: "ready", rows: result.data, pagination: result.pagination });
    } catch (error) {
      setState({ status: "error", message: errorText(error, locale) });
    }
  }, [locale, requestQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = state.status === "ready" ? state.rows : [];
  const pagination = state.status === "ready" ? state.pagination : null;

  const columns: DataGridColumn<SponsorAccountSummary>[] = [
    {
      key: "companyName",
      sortable: true,
      header: "Firma",
      cell: (r) => (
        <Link href={`/sponsors/${r.id}`} className="font-medium text-white/90 underline-offset-2 hover:text-indigo-200 hover:underline">
          {r.companyName}
        </Link>
      ),
    },
    { key: "contactName", header: "İlgili Kişi", cell: (r) => <span className="text-white/70">{r.contactName}</span> },
    { key: "email", header: "E-posta", cell: (r) => <span className="text-white/60">{r.email}</span> },
    { key: "status", sortable: true, header: "Durum", cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status === "ACTIVE" ? "Aktif" : "Pasif"}</Badge> },
    { key: "agreementCount", header: "Anlaşma", align: "right", cell: (r) => <span className="tabular-nums text-white/70">{r.activeAgreementCount}/{r.agreementCount}</span> },
    { key: "createdAt", header: "Oluşturma", cell: (r) => <span className="text-white/50">{formatDate(r.createdAt)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sponsorluk"
        title="Sponsor Firmalar"
        description="Reklamveren cari kayıtları, anlaşmalar ve tahsilat takibi. Platform içi kayıtlar tahakkuktur; resmî fatura değildir."
        actions={<Button onClick={() => setCreating(true)}>Yeni sponsor</Button>}
      />

      <SponsorshipDashboard locale={locale} />

      <SurfaceCard title="Sponsor cari" description="Firma dizini ve cari bakiye özeti" icon={<CustomerIcon />}>
        <DataGridToolbar
          labels={{
            searchPlaceholder: "Firma / kişi / e-posta ara",
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
              label: "Durum",
              options: [
                { value: "ACTIVE", label: "Aktif" },
                { value: "INACTIVE", label: "Pasif" },
              ],
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<{ status: string }>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[
            { value: "createdAt:desc", label: "En yeni" },
            { value: "createdAt:asc", label: "En eski" },
            { value: "companyName:asc", label: "Firma A→Z" },
          ]}
          sortValue={`${grid.sortBy}:${grid.sortOrder}`}
          onSortChange={(value) => {
            const [sortBy, sortOrder] = value.split(":");
            grid.setSort(sortBy, sortOrder === "asc" ? "asc" : "desc");
          }}
        />

        <DataGrid
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={grid.activeFilterCount > 0}
          caption="Sponsor cari"
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<CustomerIcon />}
          labels={{
            loading: g.loading,
            errorTitle: "Sponsorlar yüklenemedi",
            retry: c.actions.retry,
            emptyTitle: "Henüz sponsor yok",
            emptyDescription: "İlk reklamveren firmayı ekleyin.",
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

      {creating ? <CreateSponsorModal locale={locale} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} /> : null}
    </div>
  );
}

function SponsorshipDashboard({ locale }: { locale: Locale }) {
  const [data, setData] = useState<SponsorshipDashboardResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    storeApi
      .getSponsorshipDashboard()
      .then((r) => alive && setData(r.data))
      .catch((e) => alive && setError(errorText(e, locale)));
    return () => {
      alive = false;
    };
  }, [locale]);

  if (error) return null;
  if (!data) return <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">Pano yükleniyor…</div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Aktif sponsor" value={`${data.activeSponsors}`} sub={`${data.totalSponsors} toplam`} />
        <Kpi label="Aktif anlaşma" value={`${data.activeAgreements}`} sub={`${data.totalAgreements} toplam`} />
        <Kpi label="Vadesi geçen tahakkuk" value={`${data.overdueChargeCount}`} tone={data.overdueChargeCount > 0 ? "danger" : "neutral"} />
        <Kpi label="Para birimi" value={`${data.currencies.length}`} sub="ayrı gösterilir" />
      </div>
      {data.currencyMismatch && (data.currencyMismatch.mismatchedAttributionCount > 0 || data.currencyMismatch.mismatchedSettlementCount > 0) ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium text-amber-200">Para birimi uyuşmazlığı tespit edildi</p>
          <p className="mt-1 text-amber-100/80">
            Farklı para birimindeki gelir tek toplamda birleştirilmedi. Etkilenen mutabakatlar oluşturulamaz/kesinleştirilemez.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-amber-100/70 sm:grid-cols-4">
            <div><span className="text-amber-100/50">Uyuşmayan kayıt</span><div className="font-medium tabular-nums">{data.currencyMismatch.mismatchedAttributionCount}</div></div>
            <div><span className="text-amber-100/50">Etkilenen kampanya</span><div className="font-medium tabular-nums">{data.currencyMismatch.affectedCampaignCount}</div></div>
            <div><span className="text-amber-100/50">Etkilenen mutabakat</span><div className="font-medium tabular-nums">{data.currencyMismatch.mismatchedSettlementCount}</div></div>
            <div><span className="text-amber-100/50">Yabancı para birimleri</span><div className="font-medium tabular-nums">{data.currencyMismatch.foundForeignCurrencies.join(", ") || "—"}</div></div>
          </div>
          {data.currencyMismatch.lastDetectedAt ? (
            <p className="mt-2 text-xs text-amber-100/50">Son tespit: {formatDate(data.currencyMismatch.lastDetectedAt)}</p>
          ) : null}
        </div>
      ) : null}
      {data.currencies.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-white/50">
              <tr className="border-b border-white/10 text-left">
                <th className="px-4 py-2 font-medium">Para Birimi</th>
                <th className="px-4 py-2 text-right font-medium">Sözleşme</th>
                <th className="px-4 py-2 text-right font-medium">Tahakkuk</th>
                <th className="px-4 py-2 text-right font-medium">Tahsil</th>
                <th className="px-4 py-2 text-right font-medium">Kalan</th>
                <th className="px-4 py-2 text-right font-medium">Vadesi Geçen</th>
                <th className="px-4 py-2 text-right font-medium">Sponsorlu Net Gelir</th>
              </tr>
            </thead>
            <tbody>
              {data.currencies.map((cur) => (
                <tr key={cur.currency} className="border-b border-white/5 text-white/80">
                  <td className="px-4 py-2 font-medium">{cur.currency}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMinor(cur.contractedMinor, cur.currency)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMinor(cur.chargedMinor, cur.currency)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-300">{formatMinor(cur.collectedMinor, cur.currency)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMinor(cur.outstandingMinor, cur.currency)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-300">{formatMinor(cur.overdueMinor, cur.currency)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMinor(cur.sponsoredNetRevenueMinor, cur.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "danger" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/50">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-rose-300" : "text-white/90"}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-white/40">{sub}</div> : null}
    </div>
  );
}

function CreateSponsorModal({ locale, onClose, onCreated }: { locale: Locale; onClose: () => void; onCreated: () => void }) {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [taxOffice, setTaxOffice] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await storeApi.createSponsor({
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        taxNumber: taxNumber.trim() || null,
        taxOffice: taxOffice.trim() || null,
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open closeLabel="Kapat" onClose={onClose} title="Yeni sponsor firma">
      <div className="space-y-3">
        <Input label="Firma adı" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        <Input label="İlgili kişi" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
        <Input label="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Vergi no" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />
        </div>
        <Input label="Vergi dairesi" value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} />
        <Textarea label="Notlar" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>İptal</Button>
          <Button onClick={() => void submit()} disabled={busy || !companyName.trim() || !contactName.trim() || !email.trim()}>
            {busy ? "Kaydediliyor…" : "Oluştur"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
