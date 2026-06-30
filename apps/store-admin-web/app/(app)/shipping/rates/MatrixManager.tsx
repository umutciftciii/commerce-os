"use client";

/**
 * F3C.4 — Tarife matrisi girişi (DHL desi × Tarife I/II/III, Aras desi/kg × zone).
 *
 * UI hedefi: teknik DB editörü gibi DEĞİL, fiyat listesi yönetimi gibi hissettirmeli.
 * Backend AUTHORITATIVE: bu ekran yalnız grid/CSV gönderir; hesap/upsert backend'de.
 * Yalnız upsert — matris kapsamı dışındaki özel/gelişmiş kurallar korunur (ADR-044).
 */
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Input,
  SectionCard,
  Select,
  Textarea,
} from "../../../../components/ui";
import type {
  ShippingMatrixApplyRequest,
  ShippingMatrixPreviewResponse,
  ShippingRatePlanResponse,
  ShippingRateTierInput,
} from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { inputToMinor, minorToInput } from "../../../../lib/client/format";

type Locale = "tr" | "en";
type Mode = "SEGMENT" | "ZONE";
type Axis = "DESI" | "WEIGHT";
type Overflow = "FIXED" | "PER_ADDITIONAL";

interface RowState {
  uid: string;
  min: string;
  max: string; // boş => "ve üzeri" (overflow satırı)
  overflow: Overflow;
  cells: Record<string, string>;
  base: Record<string, string>;
}

/** DHL fiyat listesi desi aralıkları (son satır 30+ = ve üzeri). */
const DHL_DESI_ROWS: Array<[string, string]> = [
  ["0", "0"],
  ["1", "2"],
  ["3", "5"],
  ["6", "10"],
  ["11", "15"],
  ["16", "20"],
  ["21", "25"],
  ["26", "30"],
  ["30", ""],
];

/** Tier yoksa DHL şablonunun oluşturacağı segmentler (aylık gönderi hacmi). */
const DHL_TIERS: ShippingRateTierInput[] = [
  { name: "Tarife I", monthlyShipmentMin: 0, monthlyShipmentMax: 149, sortOrder: 0 },
  { name: "Tarife II", monthlyShipmentMin: 150, monthlyShipmentMax: 599, sortOrder: 1 },
  { name: "Tarife III", monthlyShipmentMin: 600, monthlyShipmentMax: null, sortOrder: 2 },
];

const T = {
  tr: {
    title: "Matris ile fiyat gir",
    subtitle: "Kargo fiyat listesini satır satır değil, ızgara olarak girin. Backend kuralları sizin için oluşturur.",
    modeSegment: "Segment (desi × tarife)",
    modeZone: "Bölge (desi × zone)",
    axis: "Eksen",
    axisDesi: "Desi",
    axisWeight: "Kg",
    dhlTemplate: "DHL şablonu oluştur",
    csvToggle: "CSV yapıştır",
    addRow: "Satır ekle",
    emptyHint: "Boş hücre kural oluşturmaz",
    desi: "Desi",
    weight: "Kg",
    min: "Min",
    max: "Max",
    over: "ve üzeri",
    overflowFixed: "Sabit toplam ücret",
    overflowPerAdd: "Eşik üstü birim ücret",
    overflowHint:
      "30+ satırı sağlayıcıya göre değişebilir. Varsayılan olarak eşik üstü birim ücret kabul edilir; gerekirse sabit toplam ücret seçin.",
    base: "Taban",
    preview: "Önizle",
    apply: "Uygula ve kaydet",
    create: "Oluşturulacak",
    update: "Güncellenecek",
    unchanged: "Değişmeyecek",
    emptyCells: "Boş hücre",
    removeRow: "Satırı sil",
    needTiers: "Önce segment ekleyin veya DHL şablonu oluşturun.",
    needZones: "Önce Gelişmiş sekmesinden bölge ekleyin.",
    csvTitle: "CSV / Excel yapıştır",
    csvHint:
      "Başlık satırı: desi_min, desi_max ve kolon adları (tarife adı / bölge kodu). Ayraç ; veya TAB ise TR virgüllü fiyat (116,99) güvenle kullanılır.",
    csvPlaceholder: "desi_min;desi_max;Tarife I;Tarife II;Tarife III\n0;0;116,99;95,99;93,99\n1;2;140,99;124,99;110,99",
    csvPreview: "CSV önizle",
    csvApply: "CSV uygula",
    appliedMsg: (c: number, u: number) => `${c} kural oluşturuldu, ${u} güncellendi.`,
    invalidMsg: "Matriste hata var; düzeltip tekrar deneyin.",
    rowCount: (n: number) => `${n} satır okundu`,
  },
  en: {
    title: "Enter prices as a matrix",
    subtitle: "Enter the shipping price list as a grid, not row by row. The backend builds the rules for you.",
    modeSegment: "Segment (desi × tier)",
    modeZone: "Zone (desi × zone)",
    axis: "Axis",
    axisDesi: "Desi",
    axisWeight: "Kg",
    dhlTemplate: "Create DHL template",
    csvToggle: "Paste CSV",
    addRow: "Add row",
    emptyHint: "An empty cell creates no rule",
    desi: "Desi",
    weight: "Kg",
    min: "Min",
    max: "Max",
    over: "and above",
    overflowFixed: "Fixed total",
    overflowPerAdd: "Per additional unit",
    overflowHint:
      "The 30+ row depends on the provider. It defaults to a per-additional unit charge; switch to a fixed total if needed.",
    base: "Base",
    preview: "Preview",
    apply: "Apply and save",
    create: "To create",
    update: "To update",
    unchanged: "Unchanged",
    emptyCells: "Empty",
    removeRow: "Remove row",
    needTiers: "Add a tier first, or create the DHL template.",
    needZones: "Add a zone first from the Advanced tab.",
    csvTitle: "Paste CSV / Excel",
    csvHint:
      "Header row: desi_min, desi_max and column names (tier name / zone code). With ; or TAB as the delimiter, TR comma decimals (116,99) are safe.",
    csvPlaceholder: "desi_min;desi_max;Tarife I;Tarife II;Tarife III\n0;0;116,99;95,99;93,99\n1;2;140,99;124,99;110,99",
    csvPreview: "Preview CSV",
    csvApply: "Apply CSV",
    appliedMsg: (c: number, u: number) => `${c} rules created, ${u} updated.`,
    invalidMsg: "The matrix has errors; fix them and try again.",
    rowCount: (n: number) => `${n} rows parsed`,
  },
} satisfies Record<Locale, unknown>;

/** i18n TR/EN parity testi için dışa açılır (anahtar eşitliği doğrulanır). */
export const MATRIX_COPY = T;

let uidCounter = 0;
const nextUid = () => `r${(uidCounter += 1)}`;

function toNumOrNull(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Mevcut matris-kapsamlı kuralları ızgaraya dönüştürür (fiyat listesini gösterir). */
function deriveRows(plan: ShippingRatePlanResponse, mode: Mode, axis: Axis, columnIds: string[]): RowState[] {
  const scoped = plan.rules.filter((r) => {
    if (r.cityCode !== null || r.districtCode !== null || r.regionCode !== null) return false;
    return mode === "SEGMENT" ? r.zoneId === null && r.tierId !== null : r.tierId === null && r.zoneId !== null;
  });
  const minOf = (r: (typeof scoped)[number]) => (axis === "DESI" ? r.minDesi : r.minWeightKg);
  const maxOf = (r: (typeof scoped)[number]) => (axis === "DESI" ? r.maxDesi : r.maxWeightKg);
  const key = (r: (typeof scoped)[number]) => `${minOf(r) ?? ""}|${maxOf(r) ?? ""}`;

  const brackets = new Map<string, { min: number | null; max: number | null }>();
  for (const r of scoped) brackets.set(key(r), { min: minOf(r), max: maxOf(r) });
  const ordered = [...brackets.values()].sort((a, b) => (a.min ?? 0) - (b.min ?? 0));

  return ordered.map((bracket) => {
    const cells: Record<string, string> = {};
    const base: Record<string, string> = {};
    let overflow: Overflow = "PER_ADDITIONAL";
    for (const colId of columnIds) {
      const rule = scoped.find(
        (r) => (mode === "SEGMENT" ? r.tierId : r.zoneId) === colId && minOf(r) === bracket.min && maxOf(r) === bracket.max,
      );
      if (!rule) continue;
      if (rule.chargeType === "PER_ADDITIONAL_KG_OR_DESI") {
        cells[colId] = minorToInput(rule.unitAmountMinor);
        base[colId] = minorToInput(rule.baseAmountMinor);
        overflow = "PER_ADDITIONAL";
      } else {
        cells[colId] = minorToInput(rule.amountMinor);
        if (bracket.max === null) overflow = "FIXED";
      }
    }
    return {
      uid: nextUid(),
      min: bracket.min === null ? "" : String(bracket.min),
      max: bracket.max === null ? "" : String(bracket.max),
      overflow,
      cells,
      base,
    };
  });
}

function emptyRow(): RowState {
  return { uid: nextUid(), min: "", max: "", overflow: "PER_ADDITIONAL", cells: {}, base: {} };
}

export function MatrixManager({
  locale,
  plan,
  onChanged,
}: {
  locale: Locale;
  plan: ShippingRatePlanResponse;
  onChanged: () => Promise<void>;
}) {
  const t = T[locale];
  const [mode, setMode] = useState<Mode>("SEGMENT");
  const [axis, setAxis] = useState<Axis>("DESI");
  const [rows, setRows] = useState<RowState[]>([]);
  const [seededKey, setSeededKey] = useState<string>("");
  // Şablon (DHL) tier oluşturduğunda plan reload olur; bu reload "kurallardan türet"i
  // tetikler. pendingTemplate seti varsa türetme yerine şablon satırları kullanılır
  // (aksi halde yeni tier'lerle boş tek satıra düşerdi).
  const pendingTemplate = useRef<RowState[] | null>(null);
  const [preview, setPreview] = useState<ShippingMatrixPreviewResponse | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const columns = useMemo(
    () => (mode === "SEGMENT" ? plan.tiers.map((x) => ({ id: x.id, label: x.name })) : plan.zones.map((x) => ({ id: x.id, label: x.code }))),
    [mode, plan.tiers, plan.zones],
  );
  const columnIds = columns.map((c) => c.id);

  // Mod/eksen/plan değişince mevcut kurallardan ızgarayı yeniden türet.
  const derivedKey = `${mode}:${axis}:${plan.updatedAt}:${columnIds.join(",")}`;
  if (derivedKey !== seededKey) {
    if (pendingTemplate.current) {
      // Şablon satırlarını kullan (tier yeni oluşturuldu; kural henüz yok).
      setRows(pendingTemplate.current);
      pendingTemplate.current = null;
    } else {
      const derived = deriveRows(plan, mode, axis, columnIds);
      setRows(derived.length > 0 ? derived : [emptyRow()]);
    }
    setSeededKey(derivedKey);
    setPreview(null);
  }

  const diffByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const cell of preview?.cells ?? []) map.set(`${cell.rowIndex}:${cell.columnId}`, cell.action);
    return map;
  }, [preview]);

  const buildRequest = (): ShippingMatrixApplyRequest => ({
    mode,
    axis,
    columns: columnIds,
    rows: rows.map((row) => {
      const over = row.max.trim().length === 0;
      return {
        min: toNumOrNull(row.min),
        max: over ? null : toNumOrNull(row.max),
        overflowBehavior: row.overflow,
        cells: columnIds.map((colId) => ({
          columnId: colId,
          amountMinor: inputToMinor(row.cells[colId] ?? ""),
          baseAmountMinor: over && row.overflow === "PER_ADDITIONAL" ? inputToMinor(row.base[colId] ?? "") : undefined,
        })),
      };
    }),
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await fn();
    } catch (e) {
      setErr(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  };

  const doPreview = () =>
    run(async () => {
      setPreview(await storeApi.previewShippingMatrix(plan.id, buildRequest()));
    });

  const doApply = () =>
    run(async () => {
      const res = await storeApi.applyShippingMatrix(plan.id, buildRequest());
      setOk(t.appliedMsg(res.summary.create, res.summary.update));
      setPreview(null);
      setSeededKey(""); // plan reload sonrası ızgarayı yeniden türet
      await onChanged();
    });

  const doTemplate = () =>
    run(async () => {
      const templateRows = DHL_DESI_ROWS.map(([min, max]) => ({ ...emptyRow(), min, max }));
      // Segment modunda tier yoksa DHL segmentlerini oluştur. onChanged() plan'ı reload
      // edip "kurallardan türet"i tetikleyeceğinden şablon satırlarını pendingTemplate'e
      // koyarız; türetme yerine bunlar kullanılır (aksi halde boş tek satıra düşerdi).
      if (mode === "SEGMENT" && plan.tiers.length === 0) {
        for (const tier of DHL_TIERS) await storeApi.addShippingRateTier(plan.id, tier);
        pendingTemplate.current = templateRows;
        await onChanged();
      } else {
        // Tier zaten var: doğrudan set (derivedKey değişmez, türetme ezmez).
        setRows(templateRows);
      }
    });

  const doCsvPreview = () =>
    run(async () => {
      const res = await storeApi.previewShippingImport(plan.id, { mode, axis, csv });
      setPreview({ valid: res.valid, summary: res.summary, cells: res.cells, errors: res.errors });
    });

  const doCsvApply = () =>
    run(async () => {
      const res = await storeApi.applyShippingImport(plan.id, { mode, axis, csv });
      setOk(t.appliedMsg(res.summary.create, res.summary.update));
      setCsv("");
      setCsvOpen(false);
      setPreview(null);
      setSeededKey("");
      await onChanged();
    });

  const setCell = (uid: string, colId: string, value: string) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, cells: { ...r.cells, [colId]: value } } : r)));
  const setBase = (uid: string, colId: string, value: string) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, base: { ...r.base, [colId]: value } } : r)));
  const setRowField = (uid: string, patch: Partial<RowState>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const cellTone = (rowIndex: number, colId: string): string => {
    const action = diffByKey.get(`${rowIndex}:${colId}`);
    if (action === "CREATE") return "border-emerald-400/30 bg-emerald-400/[0.08]";
    if (action === "UPDATE") return "border-indigo-400/30 bg-indigo-400/[0.08]";
    return "border-white/[0.08] bg-white/[0.02]";
  };

  const noColumns = columns.length === 0;

  return (
    <SectionCard
      title={t.title}
      description={t.subtitle}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={t.axis}
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            options={[
              { value: "SEGMENT", label: t.modeSegment },
              { value: "ZONE", label: t.modeZone },
            ]}
          />
          <Select
            aria-label={t.axis}
            value={axis}
            onChange={(e) => setAxis(e.target.value as Axis)}
            options={[
              { value: "DESI", label: t.axisDesi },
              { value: "WEIGHT", label: t.axisWeight },
            ]}
          />
        </div>
      }
    >
      {err ? <Alert tone="error" title={err} className="mb-3" /> : null}
      {ok ? <Alert tone="success" title={ok} className="mb-3" /> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {mode === "SEGMENT" ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void doTemplate()}>
            {t.dhlTemplate}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setCsvOpen((v) => !v)}>
          {t.csvToggle}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy || noColumns} onClick={() => setRows((rs) => [...rs, emptyRow()])}>
          {t.addRow}
        </Button>
        <span className="ml-auto text-xs text-white/40">{t.emptyHint}</span>
      </div>

      {noColumns ? (
        <Alert tone="info" title={mode === "SEGMENT" ? t.needTiers : t.needZones} className="mb-3" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-white/[0.03] text-left text-white/55">
                <th className="px-3 py-2 font-medium">{axis === "DESI" ? t.desi : t.weight}</th>
                {columns.map((c) => (
                  <th key={c.id} className="px-3 py-2 text-right font-medium">{c.label}</th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                return (
                  <tr key={row.uid} className="border-t border-white/[0.06]">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          aria-label={t.min}
                          inputMode="decimal"
                          value={row.min}
                          onChange={(e) => setRowField(row.uid, { min: e.target.value })}
                          className="h-8 w-14 rounded-md border border-white/[0.1] bg-white/[0.03] px-2 text-right text-white/80"
                        />
                        <span className="text-white/30">–</span>
                        <input
                          aria-label={t.max}
                          inputMode="decimal"
                          placeholder={t.over}
                          value={row.max}
                          onChange={(e) => setRowField(row.uid, { max: e.target.value })}
                          className="h-8 w-16 rounded-md border border-white/[0.1] bg-white/[0.03] px-2 text-right text-white/80 placeholder:text-[10px] placeholder:text-white/25"
                        />
                      </div>
                    </td>
                    {columns.map((c) => (
                      <td key={c.id} className="px-2 py-1.5">
                        <input
                          aria-label={`${c.label} ${row.min}`}
                          inputMode="decimal"
                          placeholder="—"
                          value={row.cells[c.id] ?? ""}
                          onChange={(e) => setCell(row.uid, c.id, e.target.value)}
                          className={`h-8 w-full rounded-md border px-2 text-right text-white/85 ${cellTone(rowIndex, c.id)}`}
                        />
                      </td>
                    ))}
                    <td className="px-1 text-center">
                      <button
                        aria-label={t.removeRow}
                        onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.uid !== row.uid) : rs))}
                        className="text-white/30 hover:text-red-400/80"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 30+ / "ve üzeri" satırı için davranış seçimi (overflow satırı varsa). */}
      {rows.some((r) => r.max.trim().length === 0) && !noColumns ? (
        <OverflowControls
          locale={locale}
          rows={rows}
          columns={columns}
          onOverflow={(uid, overflow) => setRowField(uid, { overflow })}
          onBase={setBase}
        />
      ) : null}

      {preview ? <MatrixSummary locale={locale} preview={preview} /> : null}

      {csvOpen ? (
        <div className="mt-4 space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <p className="text-sm font-medium text-white/80">{t.csvTitle}</p>
          <p className="text-xs text-white/45">{t.csvHint}</p>
          <Textarea
            rows={6}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={t.csvPlaceholder}
            className="font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" disabled={busy || csv.trim().length === 0} onClick={() => void doCsvPreview()}>
              {t.csvPreview}
            </Button>
            <Button size="sm" disabled={busy || csv.trim().length === 0} onClick={() => void doCsvApply()}>
              {t.csvApply}
            </Button>
          </div>
        </div>
      ) : null}

      {!noColumns ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void doPreview()}>
            {t.preview}
          </Button>
          <Button disabled={busy} onClick={() => void doApply()}>
            {t.apply}
          </Button>
        </div>
      ) : null}
    </SectionCard>
  );
}

/** 30+ satırı davranış seçimi + (eşik üstü birim modunda) taban ücret girişi. */
function OverflowControls({
  locale,
  rows,
  columns,
  onOverflow,
  onBase,
}: {
  locale: Locale;
  rows: RowState[];
  columns: Array<{ id: string; label: string }>;
  onOverflow: (uid: string, overflow: Overflow) => void;
  onBase: (uid: string, colId: string, value: string) => void;
}) {
  const t = T[locale];
  const overRows = rows.filter((r) => r.max.trim().length === 0);
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3">
      <p className="text-xs text-amber-200/80">{t.overflowHint}</p>
      {overRows.map((row) => (
        <div key={row.uid} className="space-y-2">
          <div className="flex items-center gap-3">
            <Badge tone="warning">{row.min || "30"}+ {t.over}</Badge>
            <Select
              aria-label={t.base}
              value={row.overflow}
              onChange={(e) => onOverflow(row.uid, e.target.value as Overflow)}
              options={[
                { value: "PER_ADDITIONAL", label: t.overflowPerAdd },
                { value: "FIXED", label: t.overflowFixed },
              ]}
            />
          </div>
          {row.overflow === "PER_ADDITIONAL" ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {columns.map((c) => (
                <Input
                  key={c.id}
                  label={`${t.base} · ${c.label}`}
                  inputMode="decimal"
                  value={row.base[c.id] ?? ""}
                  onChange={(e) => onBase(row.uid, c.id, e.target.value)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Değişiklik özeti (oluştur/güncelle/değişmeyen/boş) + hata listesi. */
function MatrixSummary({ locale, preview }: { locale: Locale; preview: ShippingMatrixPreviewResponse }) {
  const t = T[locale];
  const cards: Array<[string, number, string]> = [
    [t.create, preview.summary.create, "text-emerald-300"],
    [t.update, preview.summary.update, "text-indigo-300"],
    [t.unchanged, preview.summary.unchanged, "text-white/70"],
    [t.emptyCells, preview.summary.empty, "text-white/40"],
  ];
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {cards.map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
            <div className="text-xs text-white/45">{label}</div>
            <div className={`text-xl font-semibold ${tone}`}>{value}</div>
          </div>
        ))}
      </div>
      {preview.errors.length > 0 ? (
        // Alert children'i <p> içine sarar; <ul> orada geçersiz olur. Hata listesini
        // kendi kapsayıcısında render ederiz (Alert error tonuyla aynı görünüm).
        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-300">
          <p className="font-semibold">{t.invalidMsg}</p>
          <ul className="mt-1 list-disc pl-4 text-xs">
            {preview.errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
