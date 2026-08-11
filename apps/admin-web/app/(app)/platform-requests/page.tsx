"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  SectionCard,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "@commerce-os/ui";
import type {
  PlatformRequestInboxQuery,
  PlatformRequestListResponse,
  PlatformUserDirectoryItem,
} from "@commerce-os/api-client";
import { PLATFORM_REQUEST_UNASSIGNED_FILTER } from "@commerce-os/api-client";
import { adminApi } from "../../../lib/client/api";
import { AssigneeSelector } from "../../../components/platform-requests/assignee-selector";
import { messageForError } from "../../../lib/client/messages";
import {
  statusLabel,
  statusTone,
  priorityLabel,
  priorityTone,
  slaStateLabel,
  slaTone,
  STATUS_KEYS,
  PRIORITY_KEYS,
} from "../../../components/platform-requests/labels";

type Item = PlatformRequestListResponse["items"][number];
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

const PAGE_SIZE = 25;

export default function PlatformRequestsPage() {
  const locale = useLocale() as "tr" | "en";
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [data, setData] = useState<PlatformRequestListResponse | null>(null);
  const [categories, setCategories] = useState<Array<{ key: string; labelTr: string; labelEn: string }>>([]);

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const [slaRisk, setSlaRisk] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  // TD-178-6: assignee filtresi — mode ALL/UNASSIGNED/USER; USER'da seçilen kullanıcı id + adı.
  const [assigneeMode, setAssigneeMode] = useState<"ALL" | "UNASSIGNED" | "USER">("ALL");
  const [assigneeUser, setAssigneeUser] = useState<PlatformUserDirectoryItem | null>(null);
  const [page, setPage] = useState(1);

  const assigneeParam =
    assigneeMode === "UNASSIGNED"
      ? PLATFORM_REQUEST_UNASSIGNED_FILTER
      : assigneeMode === "USER" && assigneeUser
        ? assigneeUser.id
        : undefined;

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const query: PlatformRequestInboxQuery = {
      status: status || undefined,
      priority: priority || undefined,
      categoryKey: categoryKey || undefined,
      assignee: assigneeParam,
      slaRisk: slaRisk ? "true" : undefined,
      search: appliedSearch || undefined,
      page,
      pageSize: PAGE_SIZE,
    };
    try {
      const r = await adminApi.listPlatformRequests(query);
      setData(r);
      setState({ status: "ready" });
    } catch (e) {
      setState({ status: "error", message: messageForError(e, locale) });
    }
  }, [locale, status, priority, categoryKey, assigneeParam, slaRisk, appliedSearch, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void adminApi
      .listPlatformRequestCategories()
      .then((r) => setCategories(r.items))
      .catch(() => setCategories([]));
  }, []);

  // Filtre değişince ilk sayfaya dön.
  const onFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const columns: DataTableColumn<Item>[] = [
    { header: locale === "tr" ? "Talep No" : "Request no", cell: (r) => <span className="font-mono text-xs">{r.requestNumber}</span> },
    { header: locale === "tr" ? "Mağaza" : "Store", cell: (r) => <span className="text-sm">{r.storeName}</span> },
    {
      header: locale === "tr" ? "Kategori" : "Category",
      cell: (r) => <span className="text-sm">{locale === "tr" ? r.category.labelTr : r.category.labelEn}</span>,
    },
    { header: locale === "tr" ? "Konu" : "Subject", cell: (r) => <span className="font-medium">{r.subject}</span> },
    { header: locale === "tr" ? "Öncelik" : "Priority", cell: (r) => <Badge tone={priorityTone(r.priority)}>{priorityLabel(r.priority, locale)}</Badge> },
    { header: locale === "tr" ? "Durum" : "Status", cell: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(r.status, locale)}</Badge> },
    {
      header: locale === "tr" ? "Atanan" : "Assignee",
      cell: (r) =>
        r.assigneeName ? (
          <span className="text-sm">{r.assigneeName}</span>
        ) : (
          <span className="text-xs text-slate-400">{locale === "tr" ? "atanmamış" : "unassigned"}</span>
        ),
    },
    { header: locale === "tr" ? "İlk yanıt" : "First response", cell: (r) => <Badge tone={slaTone(r.firstResponseState)}>{slaStateLabel(r.firstResponseState, locale)}</Badge> },
    { header: locale === "tr" ? "Çözüm" : "Resolution", cell: (r) => <Badge tone={slaTone(r.resolutionState)}>{slaStateLabel(r.resolutionState, locale)}</Badge> },
    { header: locale === "tr" ? "Son aktivite" : "Last activity", cell: (r) => <span className="text-xs text-slate-500">{new Date(r.lastActivityAt).toLocaleString(locale)}</span> },
  ];

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <PageHeader
        title={locale === "tr" ? "Mağaza Talepleri" : "Store Requests"}
        description={
          locale === "tr"
            ? "Mağazaların platform müdahalesi gerektiren talepleri (operasyonel inbox)."
            : "Store requests needing platform intervention (operational inbox)."
        }
      />

      <SectionCard title={locale === "tr" ? "Filtreler" : "Filters"}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{locale === "tr" ? "Durum" : "Status"}</span>
            <select className="rounded-md border border-slate-200 px-2 py-1.5 text-sm" value={status} onChange={(e) => onFilter(setStatus)(e.target.value)}>
              <option value="">{locale === "tr" ? "Tümü" : "All"}</option>
              {STATUS_KEYS.map((k) => (
                <option key={k} value={k}>{statusLabel(k, locale)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{locale === "tr" ? "Öncelik" : "Priority"}</span>
            <select className="rounded-md border border-slate-200 px-2 py-1.5 text-sm" value={priority} onChange={(e) => onFilter(setPriority)(e.target.value)}>
              <option value="">{locale === "tr" ? "Tümü" : "All"}</option>
              {PRIORITY_KEYS.map((k) => (
                <option key={k} value={k}>{priorityLabel(k, locale)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{locale === "tr" ? "Kategori" : "Category"}</span>
            <select className="rounded-md border border-slate-200 px-2 py-1.5 text-sm" value={categoryKey} onChange={(e) => onFilter(setCategoryKey)(e.target.value)}>
              <option value="">{locale === "tr" ? "Tümü" : "All"}</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>{locale === "tr" ? c.labelTr : c.labelEn}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={slaRisk} onChange={(e) => { setSlaRisk(e.target.checked); setPage(1); }} />
            {locale === "tr" ? "SLA riski" : "SLA risk"}
          </label>
          <div className="text-sm">
            <span className="mb-1 block text-slate-500">{locale === "tr" ? "Atanan" : "Assignee"}</span>
            <div className="flex items-center gap-2">
              <select
                aria-label={locale === "tr" ? "Atanan filtresi" : "Assignee filter"}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                value={assigneeMode}
                onChange={(e) => {
                  const mode = e.target.value as "ALL" | "UNASSIGNED" | "USER";
                  setAssigneeMode(mode);
                  if (mode !== "USER") setAssigneeUser(null);
                  setPage(1);
                }}
              >
                <option value="ALL">{locale === "tr" ? "Tümü" : "All"}</option>
                <option value="UNASSIGNED">{locale === "tr" ? "Atanmamış" : "Unassigned"}</option>
                <option value="USER">{locale === "tr" ? "Belirli kullanıcı" : "Specific user"}</option>
              </select>
              {assigneeMode === "USER" && assigneeUser ? (
                <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs">
                  {assigneeUser.name ?? assigneeUser.email}
                  <button type="button" className="text-slate-500" aria-label={locale === "tr" ? "Temizle" : "Clear"} onClick={() => { setAssigneeUser(null); setPage(1); }}>✕</button>
                </span>
              ) : null}
            </div>
            {assigneeMode === "USER" && !assigneeUser ? (
              <div className="mt-2 w-64">
                <AssigneeSelector locale={locale} onPick={(u) => { setAssigneeUser(u); setPage(1); }} />
              </div>
            ) : null}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); setAppliedSearch(search.trim()); setPage(1); }}
          >
            <Input
              label={locale === "tr" ? "Ara (no / konu)" : "Search (no / subject)"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" variant="secondary" size="sm">{locale === "tr" ? "Ara" : "Search"}</Button>
          </form>
        </div>
      </SectionCard>

      <SectionCard title={locale === "tr" ? "Talepler" : "Requests"}>
        {state.status === "loading" ? (
          <SkeletonRows rows={6} />
        ) : state.status === "error" ? (
          <Alert tone="error">
            {state.message}
            <Button variant="secondary" size="sm" onClick={() => void load()}>{locale === "tr" ? "Tekrar dene" : "Retry"}</Button>
          </Alert>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={locale === "tr" ? "Talep yok" : "No requests"}
            description={locale === "tr" ? "Filtrelere uyan talep bulunamadı." : "No requests match the filters."}
          />
        ) : (
          <>
            <DataTable columns={columns} rows={data.items} rowKey={(r) => r.requestId} onRowClick={(r) => router.push(`/platform-requests/${r.requestId}`)} />
            <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
              <span>{locale === "tr" ? `Toplam ${total} talep` : `${total} requests total`}</span>
              <span className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  {locale === "tr" ? "Önceki" : "Prev"}
                </Button>
                <span>{page} / {totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  {locale === "tr" ? "Sonraki" : "Next"}
                </Button>
              </span>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
