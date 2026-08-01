"use client";

// TODO-165 (ADR-249) — Beden Tablosu editörü. Taslak kolon/beden düzeni (grid) + durum geçişleri
// (Kaydet / Yayınla / Geri Al / Arşivle) + kapsam ataması (STORE / CATEGORY / PRODUCT). Beden
// sistemi tipli registry'den gelir; kolon/hücre değerleri serbest metin (gateway Zod ile denetlenir).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  Select,
  SkeletonRows,
  useLocale,
} from "../../../../components/ui";
import type {
  SizeChartAssignRequest,
  SizeChartContract,
  SizeChartUpdateRequest,
} from "@commerce-os/api-client";
import {
  getSizeSystem,
  isSizeSystemKey,
  orderedValues,
} from "@commerce-os/contracts/size-systems";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
// TODO-165A Task 26 — raw Category/Product ID `<Input>`'ların yerini aranabilir
// `EntitySelectorField` aldı (ADR-090 deseni; ürün formundaki AYNI seçiciler). Atama
// listesindeki isimler `useSelectedItems` ile ÇÖZÜLÜR (ham id artık HİÇBİR YERDE GÖSTERİLMEZ).
import {
  EntitySelectorField,
  useCategorySelectorBinding,
  useProductSelectorBinding,
  useSelectedItems,
} from "../../../../components/selector";

type SizeChartStatus = SizeChartContract["status"];
type Scope = SizeChartAssignRequest["scope"];

const STATUS_TONES: Record<SizeChartStatus, "success" | "neutral" | "warning"> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};
const STATUS_LABELS: Record<SizeChartStatus, string> = {
  DRAFT: "Taslak",
  PUBLISHED: "Yayında",
  ARCHIVED: "Arşiv",
};
const SCOPE_LABELS: Record<Scope, string> = {
  STORE: "Tüm Mağaza",
  CATEGORY: "Kategori",
  PRODUCT: "Ürün",
};
const MEASUREMENT_UNITS = ["CM", "IN", "NONE"] as const;

// Editör iç modeli: kolon/hücre eşlemesini stabil tutmak için kolonlara iç kimlik (cid) verilir;
// kaydederken cid → kolon.key'e serileştirilir (key değişse bile hücreler kaymaz).
type EditorColumn = { cid: string; key: string; label: string; unit: string };
type EditorRow = { rid: string; size: string; cells: Record<string, string> };

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${idSeq}_${Math.random().toString(36).slice(2, 7)}`;
}

function toEditorColumns(columns: SizeChartContract["draftColumns"]): EditorColumn[] {
  return columns.map((col) => ({ cid: nextId("c"), key: col.key, label: col.label, unit: col.unit ?? "" }));
}
function toEditorRows(
  rows: SizeChartContract["draftRows"],
  columns: EditorColumn[],
): EditorRow[] {
  const keyToCid = new Map(columns.map((col) => [col.key, col.cid]));
  return rows.map((row) => {
    const cells: Record<string, string> = {};
    for (const [key, value] of Object.entries(row.cells)) {
      const cid = keyToCid.get(key);
      if (cid) cells[cid] = String(value);
    }
    return { rid: nextId("r"), size: row.size, cells };
  });
}

export default function SizeChartDetailPage() {
  const params = useParams<{ id: string }>();
  const chartId = params.id;
  const locale = useLocale();

  // TODO-165A Task 26 — atama listesindeki kategori/ürün id'lerini İSİMLERE çözer (ham id
  // artık gösterilmez). Ürün formundaki AYNI seçici bağlamaları (`components/selector`).
  const categoryBinding = useCategorySelectorBinding(locale);
  const productBinding = useProductSelectorBinding(locale);

  const [chart, setChart] = useState<SizeChartContract | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Taslak editör alanları.
  const [name, setName] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState("");
  const [gender, setGender] = useState("");
  const [localeInput, setLocaleInput] = useState("");
  const [columns, setColumns] = useState<EditorColumn[]>([]);
  const [rows, setRows] = useState<EditorRow[]>([]);

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "publish" | "rollback" | "archive">(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const hydrate = useCallback((next: SizeChartContract) => {
    setChart(next);
    setName(next.name);
    setMeasurementUnit(next.measurementUnit ?? "");
    setGender(next.gender ?? "");
    setLocaleInput(next.locale ?? "");
    const cols = toEditorColumns(next.draftColumns);
    setColumns(cols);
    setRows(toEditorRows(next.draftRows, cols));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await storeApi.getSizeChart(chartId);
      hydrate(result.data);
    } catch (error) {
      setLoadError(messageForError(error, locale));
    } finally {
      setLoading(false);
    }
  }, [chartId, hydrate, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const systemLabel = useMemo(() => {
    if (!chart) return "";
    if (!isSizeSystemKey(chart.sizeSystemKey)) return chart.sizeSystemKey;
    const def = getSizeSystem(chart.sizeSystemKey);
    return locale === "tr" ? def.labelTr : def.labelEn;
  }, [chart, locale]);

  const isArchived = chart?.status === "ARCHIVED";
  const disabled = busy !== null || isArchived;

  // TODO-165A Task 26 — atama satırlarındaki kategori/ürün id'lerini toplu (batched) çözer;
  // sayfadan bağımsız (ADR-090 `useSelectedItems` — seçili kayıt her zaman görünür kalır).
  const assignedCategoryIds = useMemo(
    () => [...new Set((chart?.assignments ?? []).filter((a) => a.scope === "CATEGORY" && a.categoryId).map((a) => a.categoryId!))],
    [chart],
  );
  const assignedProductIds = useMemo(
    () => [...new Set((chart?.assignments ?? []).filter((a) => a.scope === "PRODUCT" && a.productId).map((a) => a.productId!))],
    [chart],
  );
  const resolvedCategories = useSelectedItems({ ids: assignedCategoryIds, source: categoryBinding.source });
  const resolvedProducts = useSelectedItems({ ids: assignedProductIds, source: productBinding.source });

  // ─── Kolon işlemleri ───
  const addColumn = () =>
    setColumns((prev) => [...prev, { cid: nextId("c"), key: "", label: "", unit: "" }]);
  const updateColumn = (cid: string, patch: Partial<Omit<EditorColumn, "cid">>) =>
    setColumns((prev) => prev.map((col) => (col.cid === cid ? { ...col, ...patch } : col)));
  const removeColumn = (cid: string) => {
    setColumns((prev) => prev.filter((col) => col.cid !== cid));
    setRows((prev) =>
      prev.map((row) => {
        const rest = { ...row.cells };
        delete rest[cid];
        return { ...row, cells: rest };
      }),
    );
  };

  // ─── Beden (satır) işlemleri ───
  const addRow = () => setRows((prev) => [...prev, { rid: nextId("r"), size: "", cells: {} }]);
  const updateRowSize = (rid: string, size: string) =>
    setRows((prev) => prev.map((row) => (row.rid === rid ? { ...row, size } : row)));
  const updateCell = (rid: string, cid: string, value: string) =>
    setRows((prev) =>
      prev.map((row) => (row.rid === rid ? { ...row, cells: { ...row.cells, [cid]: value } } : row)),
    );
  const removeRow = (rid: string) => setRows((prev) => prev.filter((row) => row.rid !== rid));

  // Beden sisteminin sıralı değerlerinden boş satırları doldurur (yalnız satır yoksa).
  const seedFromSystem = () => {
    if (!chart || !isSizeSystemKey(chart.sizeSystemKey)) return;
    const values = orderedValues(chart.sizeSystemKey);
    setRows(values.map((value) => ({ rid: nextId("r"), size: value.displayLabel, cells: {} })));
  };

  function buildUpdatePayload(): SizeChartUpdateRequest {
    const payloadColumns = columns.map((col) => ({
      key: col.key.trim(),
      label: col.label.trim(),
      ...(col.unit.trim().length > 0 ? { unit: col.unit.trim() } : {}),
    }));
    const payloadRows = rows.map((row) => {
      const cells: Record<string, string> = {};
      for (const col of columns) {
        const value = row.cells[col.cid];
        if (value !== undefined && String(value).length > 0) cells[col.key.trim()] = String(value);
      }
      return { size: row.size.trim(), cells };
    });
    return {
      name: name.trim(),
      measurementUnit: measurementUnit.length > 0 ? measurementUnit : undefined,
      gender: gender.trim().length > 0 ? gender.trim() : null,
      locale: localeInput.trim().length > 0 ? localeInput.trim() : null,
      columns: payloadColumns,
      rows: payloadRows,
    };
  }

  async function runAction(
    kind: "save" | "publish" | "rollback" | "archive",
    fn: () => Promise<{ data: SizeChartContract }>,
    successMsg: string,
  ) {
    setBusy(kind);
    setActionError(null);
    setNotice(null);
    try {
      const result = await fn();
      hydrate(result.data);
      setNotice(successMsg);
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusy(null);
    }
  }

  const onSave = () =>
    runAction("save", () => storeApi.updateSizeChart(chartId, buildUpdatePayload()), "Taslak kaydedildi.");
  const onPublish = () =>
    runAction("publish", () => storeApi.publishSizeChart(chartId), "Beden tablosu yayınlandı.");
  const onArchive = () =>
    runAction("archive", () => storeApi.archiveSizeChart(chartId), "Beden tablosu arşivlendi.");
  const onRollback = (revisionId: string) =>
    runAction("rollback", () => storeApi.rollbackSizeChart(chartId, revisionId), "Revizyona geri alındı.");

  return (
    <>
      <PageHeader
        eyebrow="Beden Tablosu"
        title={chart ? chart.name : "Beden Tablosu"}
        description={chart ? `${systemLabel}${chart.gender ? ` · ${chart.gender}` : ""}` : "Yükleniyor…"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/size-charts"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-white/[0.11] bg-white/[0.04] px-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/85"
            >
              ← Liste
            </Link>
            {chart ? (
              <>
                <Button variant="secondary" onClick={() => setAssignOpen(true)} disabled={busy !== null}>
                  Bağla
                </Button>
                {chart.publishedRevisionId ? (
                  <Button
                    variant="secondary"
                    onClick={() => onRollback(chart.publishedRevisionId!)}
                    disabled={disabled}
                  >
                    {busy === "rollback" ? "…" : "Geri Al"}
                  </Button>
                ) : null}
                {!isArchived ? (
                  <Button variant="secondary" onClick={onArchive} disabled={disabled}>
                    {busy === "archive" ? "…" : "Arşivle"}
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={onPublish} disabled={disabled}>
                  {busy === "publish" ? "…" : "Yayınla"}
                </Button>
                <Button onClick={onSave} disabled={disabled}>
                  {busy === "save" ? "Kaydediliyor…" : "Kaydet"}
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button type="button" className="text-emerald-300 underline" onClick={() => setNotice(null)}>
                Kapat
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-4">
          <Alert tone="error">{actionError}</Alert>
        </div>
      ) : null}

      {loading ? <SkeletonRows rows={6} /> : null}

      {loadError && !chart ? (
        <Alert
          tone="error"
          title="Tablo yüklenemedi"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Tekrar dene
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : null}

      {chart ? (
        <div className="space-y-4">
          {isArchived ? (
            <Alert tone="warning">Bu tablo arşivlenmiş; düzenleme kapalıdır.</Alert>
          ) : null}

          <SectionCard title="Genel" description="Tablo künyesi ve ölçü birimi.">
            <div className="mb-3 flex items-center gap-2">
              <Badge tone={STATUS_TONES[chart.status]}>{STATUS_LABELS[chart.status]}</Badge>
              <span className="text-xs text-white/35">{systemLabel}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="sc-name"
                label="Tablo Adı"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={disabled}
              />
              <Select
                id="sc-unit"
                label="Ölçü Birimi"
                value={measurementUnit}
                onChange={(event) => setMeasurementUnit(event.target.value)}
                disabled={disabled}
                options={[
                  { value: "", label: "Varsayılan" },
                  ...MEASUREMENT_UNITS.map((unit) => ({ value: unit, label: unit })),
                ]}
              />
              <Input
                id="sc-gender"
                label="Cinsiyet"
                placeholder="Kadın / Erkek / Unisex"
                value={gender}
                onChange={(event) => setGender(event.target.value)}
                disabled={disabled}
              />
              <Input
                id="sc-locale"
                label="Dil"
                placeholder="tr / en"
                value={localeInput}
                onChange={(event) => setLocaleInput(event.target.value)}
                disabled={disabled}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Kolonlar"
            description="Ölçü kolonları (ör. göğüs, bel, kalça). Anahtar benzersiz olmalı (a-z, 0-9, _ -)."
          >
            <div className="space-y-2">
              {columns.map((col) => (
                <div key={col.cid} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <Input
                    id={`col-key-${col.cid}`}
                    label="Anahtar"
                    placeholder="chest"
                    value={col.key}
                    onChange={(event) => updateColumn(col.cid, { key: event.target.value })}
                    disabled={disabled}
                  />
                  <Input
                    id={`col-label-${col.cid}`}
                    label="Etiket"
                    placeholder="Göğüs"
                    value={col.label}
                    onChange={(event) => updateColumn(col.cid, { label: event.target.value })}
                    disabled={disabled}
                  />
                  <Input
                    id={`col-unit-${col.cid}`}
                    label="Birim"
                    placeholder="cm"
                    value={col.unit}
                    onChange={(event) => updateColumn(col.cid, { unit: event.target.value })}
                    disabled={disabled}
                  />
                  <div className="flex items-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => removeColumn(col.cid)}
                      disabled={disabled}
                      aria-label="Kolonu kaldır"
                    >
                      Kaldır
                    </Button>
                  </div>
                </div>
              ))}
              {columns.length === 0 ? (
                <p className="text-sm text-white/35">Henüz kolon yok. Bir ölçü kolonu ekleyin.</p>
              ) : null}
              <Button variant="secondary" size="sm" onClick={addColumn} disabled={disabled}>
                + Kolon Ekle
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="Bedenler ve Ölçüler"
            description="Her beden bir satır; kolon değerleri hücrelere girilir."
          >
            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={addRow} disabled={disabled}>
                + Beden Ekle
              </Button>
              <Button variant="secondary" size="sm" onClick={seedFromSystem} disabled={disabled}>
                Sistemden Doldur
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-white/35">
                Henüz beden yok. "Sistemden Doldur" ile beden sisteminden başlatabilirsiniz.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                      <th className="px-2 py-2 font-medium">Beden</th>
                      {columns.map((col) => (
                        <th key={col.cid} className="px-2 py-2 font-medium">
                          {col.label || col.key || "—"}
                          {col.unit ? <span className="text-white/25"> ({col.unit})</span> : null}
                        </th>
                      ))}
                      <th className="px-2 py-2" aria-label="İşlem" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rid} className="border-b border-white/[0.06]">
                        <td className="px-2 py-1.5">
                          <input
                            aria-label="Beden"
                            className="w-24 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white/85"
                            value={row.size}
                            onChange={(event) => updateRowSize(row.rid, event.target.value)}
                            disabled={disabled}
                          />
                        </td>
                        {columns.map((col) => (
                          <td key={col.cid} className="px-2 py-1.5">
                            <input
                              aria-label={`${row.size || "beden"} ${col.label || col.key}`}
                              className="w-24 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white/85"
                              value={row.cells[col.cid] ?? ""}
                              onChange={(event) => updateCell(row.rid, col.cid, event.target.value)}
                              disabled={disabled}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => removeRow(row.rid)}
                            disabled={disabled}
                            aria-label="Bedeni kaldır"
                          >
                            Kaldır
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Yayınlı Revizyon"
            description="Vitrinde gösterilen yayınlı sürüm (Yayınla ile güncellenir)."
          >
            {chart.publishedRevision ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
                <Badge tone="success">Revizyon #{chart.publishedRevision.revision}</Badge>
                <span className="text-white/35">
                  {chart.publishedRevision.columns.length} kolon · {chart.publishedRevision.rows.length} beden
                </span>
              </div>
            ) : (
              <p className="text-sm text-white/35">Henüz yayınlanmış bir revizyon yok.</p>
            )}
          </SectionCard>

          <SectionCard title="Atamalar" description="Bu tablonun bağlı olduğu kapsamlar.">
            {chart.assignments.length === 0 ? (
              <p className="text-sm text-white/35">Henüz atama yok. "Bağla" ile mağaza, kategori veya ürüne bağlayın.</p>
            ) : (
              <ul className="space-y-2">
                {chart.assignments.map((assignment) => {
                  // TODO-165A Task 26 — ham id ARTIK HİÇBİR YERDE GÖSTERİLMEZ: STORE
                  // kapsamının kendisi bir kimliğe ihtiyaç duymaz; CATEGORY/PRODUCT
                  // çözülmüş İSİM ile gösterilir (çözülene kadar "Yükleniyor…", silinmişse
                  // "Kayıt bulunamadı").
                  let identityLabel: string | null = null;
                  if (assignment.scope === "CATEGORY" && assignment.categoryId) {
                    const resolved = resolvedCategories.byId.get(assignment.categoryId);
                    identityLabel = resolved
                      ? categoryBinding.presenter.primaryText(resolved)
                      : resolvedCategories.resolving
                        ? "Yükleniyor…"
                        : "Kayıt bulunamadı";
                  } else if (assignment.scope === "PRODUCT" && assignment.productId) {
                    const resolved = resolvedProducts.byId.get(assignment.productId);
                    identityLabel = resolved
                      ? productBinding.presenter.primaryText(resolved)
                      : resolvedProducts.resolving
                        ? "Yükleniyor…"
                        : "Kayıt bulunamadı";
                  }
                  return (
                    <li
                      key={assignment.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2"
                    >
                      <div className="text-sm text-white/70">
                        <Badge tone="info">{SCOPE_LABELS[assignment.scope]}</Badge>
                        {identityLabel ? (
                          <span className="ml-2 text-xs text-white/50">{identityLabel}</span>
                        ) : null}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() =>
                          void (async () => {
                            setActionError(null);
                            try {
                              const result = await storeApi.unassignSizeChart(chartId, assignment.id);
                              hydrate(result.data);
                              setNotice("Atama kaldırıldı.");
                            } catch (error) {
                              setActionError(messageForError(error, locale));
                            }
                          })()
                        }
                      >
                        Kaldır
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      ) : null}

      {assignOpen && chart ? (
        <AssignModal
          locale={locale}
          onClose={() => setAssignOpen(false)}
          onAssigned={(next) => {
            setAssignOpen(false);
            hydrate(next);
            setNotice("Atama eklendi.");
          }}
          onError={(msg) => setActionError(msg)}
          chartId={chartId}
        />
      ) : null}
    </>
  );
}

/**
 * TODO-165A Task 26 — raw Category/Product ID `<Input>`'ların yerini aranabilir
 * `EntitySelectorField` (tekli seçim; ADR-090) aldı. Kullanıcı HİÇBİR ZAMAN bir
 * kategori/ürün kimliği YAZMAZ: PRODUCT kapsamı → ürün seçici (başlık/SKU gösterir),
 * CATEGORY kapsamı → kategori seçici (ad/hiyerarşi yolu gösterir), STORE kapsamı → hiçbir
 * kimlik alanı YOK (zaten hedefsiz).
 */
function AssignModal({
  locale,
  chartId,
  onClose,
  onAssigned,
  onError,
}: {
  locale: ReturnType<typeof useLocale>;
  chartId: string;
  onClose: () => void;
  onAssigned: (chart: SizeChartContract) => void;
  onError: (message: string) => void;
}) {
  const categoryBinding = useCategorySelectorBinding(locale);
  const productBinding = useProductSelectorBinding(locale);

  const [scope, setScope] = useState<Scope>("STORE");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (scope === "CATEGORY" && !categoryId) {
      setError("Bir kategori seçin.");
      return;
    }
    if (scope === "PRODUCT" && !productId) {
      setError("Bir ürün seçin.");
      return;
    }
    const payload: SizeChartAssignRequest = {
      scope,
      categoryId: scope === "CATEGORY" ? categoryId : null,
      productId: scope === "PRODUCT" ? productId : null,
    };
    setSaving(true);
    try {
      const result = await storeApi.assignSizeChart(chartId, payload);
      onAssigned(result.data);
    } catch (caught) {
      const msg = messageForError(caught, locale);
      setError(msg);
      onError(msg);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Beden Tablosunu Bağla"
      description="Kapsam seçin: tüm mağaza, bir kategori veya tek ürün."
      closeLabel="İptal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            İptal
          </Button>
          <Button onClick={() => void onSubmit()} disabled={saving}>
            {saving ? "Bağlanıyor…" : "Bağla"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Select
          id="assign-scope"
          label="Kapsam"
          value={scope}
          onChange={(event) => {
            // Kapsam değişince önceki seçim ANLAMSIZLAŞIR (başka kapsamın hedefi) — sıfırlanır.
            setScope(event.target.value as Scope);
            setCategoryId(null);
            setProductId(null);
          }}
          disabled={saving}
          options={(Object.keys(SCOPE_LABELS) as Scope[]).map((value) => ({
            value,
            label: SCOPE_LABELS[value],
          }))}
        />
        {scope === "CATEGORY" ? (
          <EntitySelectorField
            label="Kategori"
            multiple={false}
            value={categoryId ? [categoryId] : []}
            onChange={(ids) => setCategoryId(ids[0] ?? null)}
            source={categoryBinding.source}
            presenter={categoryBinding.presenter}
            labels={categoryBinding.labels}
            toMessage={(cause) => messageForError(cause, locale)}
            modalTitle={categoryBinding.title}
            modalDescription={categoryBinding.description}
            disabled={saving}
          />
        ) : null}
        {scope === "PRODUCT" ? (
          <EntitySelectorField
            label="Ürün"
            multiple={false}
            value={productId ? [productId] : []}
            onChange={(ids) => setProductId(ids[0] ?? null)}
            source={productBinding.source}
            presenter={productBinding.presenter}
            labels={productBinding.labels}
            toMessage={(cause) => messageForError(cause, locale)}
            modalTitle={productBinding.title}
            modalDescription={productBinding.description}
            disabled={saving}
          />
        ) : null}
      </div>
    </Modal>
  );
}
