"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  SkeletonRows,
  Textarea,
  useLocale,
  type DataTableColumn,
} from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type { InventoryItem } from "@commerce-os/api-client";
import { InventoryIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: InventoryItem[]; total: number };

function isLowStock(item: InventoryItem): boolean {
  return item.lowStockThreshold !== null && item.quantityAvailable <= item.lowStockThreshold;
}

export default function InventoryPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.inventory;
  const c = dict.common;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listInventory();
      setState({ status: "ready", items: result.data, total: result.pagination.total });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = state.status === "ready" ? state.items : [];

  const columns: DataTableColumn<InventoryItem>[] = [
    {
      header: t.table.product,
      cell: (item) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{item.title}</span>
          {isLowStock(item) ? <Badge tone="warning">{t.lowStockBadge}</Badge> : null}
        </div>
      ),
    },
    {
      header: t.table.sku,
      cell: (item) => <span className="font-mono text-xs text-slate-500">{item.sku}</span>,
    },
    {
      header: t.table.onHand,
      align: "right",
      cell: (item) => <span className="text-slate-700">{item.quantityOnHand}</span>,
    },
    {
      header: t.table.reserved,
      align: "right",
      cell: (item) => <span className="text-slate-500">{item.quantityReserved}</span>,
    },
    {
      header: t.table.available,
      align: "right",
      cell: (item) => <span className="font-medium text-slate-900">{item.quantityAvailable}</span>,
    },
    {
      header: t.table.threshold,
      align: "right",
      cell: (item) => <span className="text-slate-400">{item.lowStockThreshold ?? "—"}</span>,
    },
    {
      header: t.table.actions,
      align: "right",
      cell: (item) => (
        <Button variant="secondary" size="sm" onClick={() => setAdjusting(item)}>
          {t.adjustStock}
        </Button>
      ),
    },
  ];

  function onAdjusted() {
    setAdjusting(null);
    setNotice(t.adjustToast);
    void load();
  }

  return (
    <>
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />

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

      <SectionCard
        title={t.cardTitle}
        description={
          state.status === "ready" ? format(t.countLabel, { count: state.total }) : t.cardDescription
        }
        icon={<InventoryIcon />}
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

        {state.status === "ready" && items.length === 0 ? (
          <EmptyState
            tag={t.emptyTag}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<InventoryIcon />}
          />
        ) : null}

        {state.status === "ready" && items.length > 0 ? (
          <DataTable columns={columns} rows={items} rowKey={(item) => item.id} caption={t.cardTitle} />
        ) : null}
      </SectionCard>

      {adjusting ? (
        <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} onAdjusted={onAdjusted} />
      ) : null}
    </>
  );
}

function AdjustModal({
  item,
  onClose,
  onAdjusted,
}: {
  item: InventoryItem;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.inventory;
  const c = dict.common;
  const f = t.form;

  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = Number.parseInt(delta, 10);
    if (Number.isNaN(parsed) || parsed === 0) {
      setError(f.requiredDelta);
      return;
    }

    setSaving(true);
    try {
      await storeApi.adjustInventory(item.variantId, {
        quantityDelta: parsed,
        ...(reason.trim() !== "" ? { reason: reason.trim() } : {}),
      });
      onAdjusted();
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={f.title}
      description={format(f.subtitle, { title: item.title, sku: item.sku })}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {c.actions.cancel}
          </Button>
          <Button type="submit" form="adjust-form" disabled={saving}>
            {saving ? f.submitting : f.submit}
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <span className="text-slate-500">{f.currentLabel}: </span>
          <span className="font-semibold text-slate-900">{item.quantityAvailable}</span>
        </div>
        <div>
          <Input
            id="adjust-delta"
            type="number"
            label={f.deltaLabel}
            value={delta}
            onChange={(event) => setDelta(event.target.value)}
            disabled={saving}
            required
          />
          <p className="mt-1.5 text-xs text-slate-400">{f.deltaHint}</p>
        </div>
        <Textarea
          id="adjust-reason"
          label={f.reasonLabel}
          placeholder={f.reasonPlaceholder}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={saving}
          rows={2}
        />
      </form>
    </Modal>
  );
}
