"use client";

/**
 * TODO-161A — Sponsorluk anlaşmaları listesi + yeni anlaşma modal'ı. Pricing model, tarih
 * penceresi, para birimi ve vergi anlaşma seviyesinde belirlenir (tek otorite — ADR-127).
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Modal, Select, SkeletonRows, Textarea, useLocale } from "../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
} from "../../../components/data-grid";
import { getDictionary } from "@commerce-os/i18n";
import type {
  AdminListPagination,
  SponsorAccountSummary,
  SponsorshipAgreementSummary,
  SponsorshipPricingModel,
} from "@commerce-os/api-client";
import { CampaignIcon } from "../../../components/icons";
import { storeApi, UiError } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor, inputToMinor } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";
import { AGREEMENT_STATUS_LABELS, PRICING_MODEL_LABELS, sponsorshipError, type Locale } from "../sponsors/labels";

function errorText(error: unknown, locale: Locale): string {
  if (error instanceof UiError) return sponsorshipError(error.code) ?? messageForError(error, locale);
  return messageForError(error, locale);
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: SponsorshipAgreementSummary[]; pagination: AdminListPagination };

export default function AgreementsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <AgreementsView />
    </Suspense>
  );
}

function AgreementsView() {
  const locale = useLocale() as Locale;
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;

  const grid = useDataGridQuery<{ status: string; pricingModel: string }>({
    basePath: "/sponsorship-agreements",
    sortOptions: ["createdAt", "agreementNumber", "title", "status", "endsAt"],
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    filterKeys: ["status", "pricingModel"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(() => JSON.parse(requestKey) as Record<string, string | number>, [requestKey]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listSponsorshipAgreements(requestQuery);
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

  const columns: DataGridColumn<SponsorshipAgreementSummary>[] = [
    {
      key: "agreementNumber",
      sortable: true,
      header: "Anlaşma",
      cell: (r) => (
        <Link href={`/sponsorship-agreements/${r.id}`} className="font-medium text-white/90 underline-offset-2 hover:text-indigo-200 hover:underline">
          {r.agreementNumber}
          <span className="block text-xs font-normal text-white/40">{r.title}</span>
        </Link>
      ),
    },
    { key: "sponsor", header: "Sponsor", cell: (r) => <span className="text-white/70">{r.sponsorCompanyName}</span> },
    { key: "pricingModel", header: "Model", cell: (r) => <span className="text-white/60">{PRICING_MODEL_LABELS[r.pricingModel]}</span> },
    {
      key: "status",
      sortable: true,
      header: "Durum",
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={r.status === "ACTIVE" ? "success" : r.status === "CANCELLED" ? "danger" : "neutral"}>{AGREEMENT_STATUS_LABELS[r.status]}</Badge>
          {r.hasOverdueCharge ? <Badge tone="danger">Vade</Badge> : null}
          {!r.commerciallyEligible ? <span title={r.ineligibilityReason ?? undefined}><Badge tone="warning">Risk</Badge></span> : null}
        </div>
      ),
    },
    { key: "outstandingMinor", header: "Kalan", align: "right", cell: (r) => <span className="tabular-nums text-white/70">{formatMinor(r.outstandingMinor, r.currency)}</span> },
    { key: "endsAt", sortable: true, header: "Bitiş", cell: (r) => <span className="text-white/50">{formatDate(r.endsAt)}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white/90">Sponsorluk Anlaşmaları</h1>
          <p className="text-sm text-white/50">Sözleşme koşulları, fiyatlandırma ve kampanya bağlama.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Yeni anlaşma</Button>
      </div>

      <SurfaceCard title="Anlaşmalar" description="Sözleşme dizini" icon={<CampaignIcon />}>
        <DataGridToolbar
          labels={{
            searchPlaceholder: "Anlaşma no / başlık / sponsor ara",
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
              options: (Object.keys(AGREEMENT_STATUS_LABELS) as (keyof typeof AGREEMENT_STATUS_LABELS)[]).map((value) => ({ value, label: AGREEMENT_STATUS_LABELS[value] })),
            },
            {
              kind: "select",
              key: "pricingModel",
              label: "Model",
              options: (Object.keys(PRICING_MODEL_LABELS) as SponsorshipPricingModel[]).map((value) => ({ value, label: PRICING_MODEL_LABELS[value] })),
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<{ status: string; pricingModel: string }>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[
            { value: "createdAt:desc", label: "En yeni" },
            { value: "endsAt:asc", label: "Bitişe göre" },
            { value: "agreementNumber:asc", label: "No A→Z" },
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
          caption="Anlaşmalar"
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<CampaignIcon />}
          labels={{
            loading: g.loading,
            errorTitle: "Anlaşmalar yüklenemedi",
            retry: c.actions.retry,
            emptyTitle: "Henüz anlaşma yok",
            emptyDescription: "İlk sponsorluk anlaşmasını oluşturun.",
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

      {creating ? <CreateAgreementModal locale={locale} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} /> : null}
    </div>
  );
}

function CreateAgreementModal({ locale, onClose, onCreated }: { locale: Locale; onClose: () => void; onCreated: () => void }) {
  const [sponsors, setSponsors] = useState<SponsorAccountSummary[]>([]);
  const [sponsorAccountId, setSponsorAccountId] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [pricingModel, setPricingModel] = useState<SponsorshipPricingModel>("FIXED_FEE");
  const [amount, setAmount] = useState("");
  const [rateBp, setRateBp] = useState("");
  const [taxPercent, setTaxPercent] = useState("20");
  const [paymentTermDays, setPaymentTermDays] = useState("30");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storeApi.listSponsors({ status: "ACTIVE", pageSize: 100 }).then((r) => {
      setSponsors(r.data);
      if (r.data[0]) setSponsorAccountId(r.data[0].id);
    }).catch(() => {});
  }, []);

  const needsUnit = pricingModel === "CPM" || pricingModel === "CPC" || pricingModel === "CPA";
  const needsFixed = pricingModel === "FIXED_FEE";
  const needsShare = pricingModel === "REVENUE_SHARE";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const amountMinor = inputToMinor(amount);
      await storeApi.createSponsorshipAgreement({
        sponsorAccountId,
        title: title.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        currency,
        pricingModel,
        agreedAmountMinor: needsFixed ? amountMinor : null,
        unitPriceMinor: needsUnit ? amountMinor : null,
        revenueSharePercentBp: needsShare ? Math.round(Number(rateBp) * 100) : null,
        taxRateBp: Math.round(Number(taxPercent) * 100),
        paymentTermDays: Number(paymentTermDays),
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }

  const valid = sponsorAccountId && title.trim() && startsAt && endsAt;

  return (
    <Modal open closeLabel="Kapat" onClose={onClose} title="Yeni sponsorluk anlaşması">
      <div className="space-y-3">
        <Select label="Sponsor firma" options={sponsors.map((s) => ({ value: s.id, label: s.companyName }))} value={sponsorAccountId} onChange={(e) => setSponsorAccountId(e.target.value)} />
        <Input label="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Başlangıç" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <Input label="Bitiş" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Para birimi" options={[{ value: "TRY", label: "TRY" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }]} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          <Select
            label="Fiyatlandırma"
            options={(Object.keys(PRICING_MODEL_LABELS) as SponsorshipPricingModel[]).map((v) => ({ value: v, label: PRICING_MODEL_LABELS[v] }))}
            value={pricingModel}
            onChange={(e) => setPricingModel(e.target.value as SponsorshipPricingModel)}
          />
        </div>
        {needsFixed ? <Input label="Sabit bedel" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="örn. 5000,00" /> : null}
        {needsUnit ? <Input label={pricingModel === "CPM" ? "Bin gösterim bedeli" : pricingModel === "CPC" ? "Tıklama bedeli" : "Dönüşüm bedeli"} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="örn. 2,50" /> : null}
        {needsShare ? <Input label="Gelir payı (%)" value={rateBp} onChange={(e) => setRateBp(e.target.value)} placeholder="örn. 15" /> : null}
        <div className="grid grid-cols-2 gap-3">
          <Input label="KDV (%)" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
          <Input label="Vade (gün)" value={paymentTermDays} onChange={(e) => setPaymentTermDays(e.target.value)} />
        </div>
        <Textarea label="Notlar" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>İptal</Button>
          <Button onClick={() => void submit()} disabled={busy || !valid}>{busy ? "Kaydediliyor…" : "Oluştur"}</Button>
        </div>
      </div>
    </Modal>
  );
}
