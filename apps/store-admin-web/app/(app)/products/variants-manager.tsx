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
  Select,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "../../../components/ui";
import { format, formatDateTime, getDictionary } from "@commerce-os/i18n";
import { DEFAULT_VAT_RATE_BPS, VAT_RATE_BPS_PRESETS, splitGrossByVat, vatFromNet } from "@commerce-os/utils";
import type {
  Product,
  ProductPriceChange,
  ProductVariant,
  ProductVariantCreateRequest,
} from "@commerce-os/api-client";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatMinor, inputToMinor, minorToInput } from "../../../lib/client/format";

type VariantStatus = ProductVariant["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; variants: ProductVariant[] };
type View = { mode: "list" } | { mode: "create" } | { mode: "edit"; variant: ProductVariant };

const STATUS_TONES: Record<VariantStatus, "success" | "neutral" | "warning"> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  ARCHIVED: "warning",
};

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Bir ürünün varyantlarını listeleyen inline bölüm. Ürün detay sayfası (`/products/[id]`)
 * içinde yer alır; modal değildir. Varyant oluştur/düzenle ise kısa bir modal akışıdır
 * (kısa create/edit = modal kuralına uygun).
 */
export function VariantsSection({ product }: { product: Product }) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.variants;
  const c = dict.common;
  const statusLabels = t.statusLabels as Record<VariantStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [view, setView] = useState<View>({ mode: "list" });
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listVariants(product.id);
      setState({ status: "ready", variants: result.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [product.id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const variants = state.status === "ready" ? state.variants : [];

  const columns: DataTableColumn<ProductVariant>[] = [
    {
      header: t.table.sku,
      cell: (variant) => <span className="font-mono text-xs text-white/60">{variant.sku}</span>,
    },
    {
      header: t.table.title,
      cell: (variant) => <span className="font-medium text-white/90">{variant.title}</span>,
    },
    {
      header: t.table.price,
      align: "right",
      cell: (variant) => (
        <span className="text-white/70">{formatMinor(variant.priceMinor, variant.currency)}</span>
      ),
    },
    {
      header: t.table.compareAt,
      align: "right",
      cell: (variant) => (
        <span className="text-white/30">
          {variant.compareAtMinor === null
            ? "—"
            : formatMinor(variant.compareAtMinor, variant.currency)}
        </span>
      ),
    },
    {
      header: t.table.status,
      cell: (variant) => (
        <Badge tone={STATUS_TONES[variant.status]}>{statusLabels[variant.status]}</Badge>
      ),
    },
    {
      header: t.table.actions,
      align: "right",
      cell: (variant) => (
        <Button variant="secondary" size="sm" onClick={() => setView({ mode: "edit", variant })}>
          {t.editAction}
        </Button>
      ),
    },
  ];

  function onSaved(message: string) {
    setView({ mode: "list" });
    setNotice(message);
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setView({ mode: "create" })}>
          {t.addVariant}
        </Button>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {state.status === "loading" ? <SkeletonRows rows={3} /> : null}

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

      {state.status === "ready" && variants.length === 0 ? (
        <EmptyState
          tag={t.cardTitle}
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={
            <Button size="sm" onClick={() => setView({ mode: "create" })}>
              {t.emptyAction}
            </Button>
          }
        />
      ) : null}

      {state.status === "ready" && variants.length > 0 ? (
        <>
          <p className="text-xs text-white/45">
            {format(t.countLabel, { count: variants.length })}
          </p>
          <DataTable
            columns={columns}
            rows={variants}
            rowKey={(variant) => variant.id}
            caption={t.cardTitle}
          />
          <p className="text-xs text-white/30">{t.inventoryNote}</p>
        </>
      ) : null}

      {view.mode !== "list" ? (
        <VariantEditor
          product={product}
          editor={view}
          statusLabels={statusLabels}
          onBack={() => setView({ mode: "list" })}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}

function VariantEditor({
  product,
  editor,
  statusLabels,
  onBack,
  onSaved,
}: {
  product: Product;
  editor: { mode: "create" } | { mode: "edit"; variant: ProductVariant };
  statusLabels: Record<VariantStatus, string>;
  onBack: () => void;
  onSaved: (message: string) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.variants;
  const c = dict.common;
  const f = t.form;
  const isEdit = editor.mode === "edit";
  const variant = isEdit ? editor.variant : null;

  const [title, setTitle] = useState(variant?.title ?? "");
  const [sku, setSku] = useState(variant?.sku ?? "");
  // F4C (ADR-063) — Fiyat alanı artık KDV HARİÇ net fiyattır; KDV dahil satış
  // fiyatı (priceMinor) sunucuda hesaplanır. Eski kayıtta net snapshot yoksa
  // (savunmacı) brütten aynı formülle ayrıştırılır (görünen brüt korunur).
  const [price, setPrice] = useState(
    variant
      ? minorToInput(
          variant.netPriceMinor ??
            splitGrossByVat(variant.priceMinor, variant.vatRateBps ?? DEFAULT_VAT_RATE_BPS).netMinor,
        )
      : "",
  );
  const [vatRate, setVatRate] = useState<string>(
    String(variant?.vatRateBps ?? DEFAULT_VAT_RATE_BPS),
  );
  const [compareAt, setCompareAt] = useState(variant ? minorToInput(variant.compareAtMinor) : "");
  const [cost, setCost] = useState(variant ? minorToInput(variant.costMinor) : "");
  const [barcode, setBarcode] = useState(variant?.barcode ?? "");
  const [status, setStatus] = useState<VariantStatus>(variant?.status ?? "ACTIVE");
  // F3C.2 — Kargo ölçüleri (varyant override; boş ise ürün-seviyesi fallback).
  const [shippingWeightKg, setShippingWeightKg] = useState<string>(
    variant?.shippingWeightKg != null ? String(variant.shippingWeightKg) : "",
  );
  const [shippingDesi, setShippingDesi] = useState<string>(
    variant?.shippingDesi != null ? String(variant.shippingDesi) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const statusOptions = (Object.keys(statusLabels) as VariantStatus[]).map((value) => ({
    value,
    label: statusLabels[value],
  }));

  // F4C — Canlı KDV önizlemesi (yalnızca gösterim; kesin hesap SUNUCUDA aynı
  // paylaşılan formülle yapılır — istemci değerine güvenilmez).
  const netLive = inputToMinor(price);
  const vatRateLive = Number.parseInt(vatRate, 10);
  const vatPreview =
    netLive !== null && Number.isFinite(vatRateLive) ? vatFromNet(netLive, vatRateLive) : null;
  const grossLive = vatPreview?.grossMinor ?? null;
  // F4B — Canlı marj/markup + liste uyarısı (KDV dahil brüt satış üzerinden;
  // yalnızca gösterim; submit ayrıca doğrular).
  const costLive = cost.trim() === "" ? null : inputToMinor(cost);
  const compareAtLive = compareAt.trim() === "" ? null : inputToMinor(compareAt);
  const marginPct =
    grossLive !== null && grossLive > 0 && costLive !== null
      ? ((grossLive - costLive) / grossLive) * 100
      : null;
  const markupPct =
    grossLive !== null && costLive !== null && costLive > 0
      ? ((grossLive - costLive) / costLive) * 100
      : null;
  const showCompareAtWarning =
    grossLive !== null && compareAtLive !== null && compareAtLive < grossLive;
  const listCeilingLive = compareAtLive ?? grossLive;
  const costExceedsList =
    costLive !== null && listCeilingLive !== null && costLive > listCeilingLive;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (title.trim().length === 0) {
      setError(f.requiredTitle);
      return;
    }
    if (!isEdit && !SKU_PATTERN.test(sku.trim())) {
      setError(f.requiredSku);
      return;
    }

    // F4C — Girilen tutar KDV HARİÇ net fiyattır; brüt/KDV sunucuda hesaplanır.
    const netPriceMinor = inputToMinor(price);
    if (netPriceMinor === null) {
      setError(f.requiredPrice);
      return;
    }
    const vatRateBps = Number.parseInt(vatRate, 10);

    let compareAtMinor: number | null = null;
    if (compareAt.trim() !== "") {
      const parsed = inputToMinor(compareAt);
      if (parsed === null) {
        setError(f.requiredPrice);
        return;
      }
      compareAtMinor = parsed;
    }
    // F4B — Satış > liste ARTIK hata değil (yalnızca vitrinde rozet türemez); uyarı JSX'te.

    // F4B — Maliyet: opsiyonel; girildiğinde liste tavanını (liste yoksa satış) geçemez.
    let costMinor: number | null = null;
    if (cost.trim() !== "") {
      const parsed = inputToMinor(cost);
      if (parsed === null) {
        setError(f.requiredPrice);
        return;
      }
      costMinor = parsed;
    }
    // Liste tavanı önizlemesi: KDV dahil brüt (sunucu aynı kuralı kesinler).
    const grossPreview = vatFromNet(netPriceMinor, vatRateBps).grossMinor;
    const listCeiling = compareAtMinor ?? grossPreview;
    if (costMinor !== null && costMinor > listCeiling) {
      setError(f.costTooHigh);
      return;
    }

    // Kargo ölçüleri: boş = null; doluysa > 0 olmalı.
    const parseDim = (raw: string): number | null | "ERR" => {
      const value = raw.trim();
      if (value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : "ERR";
    };
    const weightValue = parseDim(shippingWeightKg);
    const desiValue = parseDim(shippingDesi);
    if (weightValue === "ERR" || desiValue === "ERR") {
      setError(f.shippingPositiveError);
      return;
    }

    setSaving(true);
    try {
      if (isEdit && variant) {
        // F4C — Net + oran gönderilir; KDV tutarı/brüt SUNUCUDA hesaplanır.
        await storeApi.updateVariant(product.id, variant.id, {
          title: title.trim(),
          netPriceMinor,
          vatRateBps,
          compareAtMinor,
          costMinor,
          barcode: barcode.trim() === "" ? null : barcode.trim(),
          status,
          shippingWeightKg: weightValue,
          shippingDesi: desiValue,
        });
        onSaved(t.updatedToast);
      } else {
        const payload: ProductVariantCreateRequest = {
          title: title.trim(),
          sku: sku.trim(),
          netPriceMinor,
          vatRateBps,
          currency: "TRY",
          status,
        };
        if (compareAtMinor !== null) payload.compareAtMinor = compareAtMinor;
        if (costMinor !== null) payload.costMinor = costMinor;
        if (barcode.trim() !== "") payload.barcode = barcode.trim();
        if (weightValue !== null) payload.shippingWeightKg = weightValue;
        if (desiValue !== null) payload.shippingDesi = desiValue;
        await storeApi.createVariant(product.id, payload);
        onSaved(t.createdToast);
      }
    } catch (caught) {
      setError(messageForError(caught, locale));
    } finally {
      // F4C bugfix — başarı/hata her iki yolda da loading kapanır (stuck CTA yok).
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onBack}
      title={isEdit ? f.editTitle : f.createTitle}
      description={isEdit ? f.editSubtitle : f.createSubtitle}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onBack} disabled={saving}>
            {c.actions.cancel}
          </Button>
          <Button type="submit" form="variant-form" disabled={saving}>
            {saving ? c.states.saving : isEdit ? f.submitEdit : f.submitCreate}
          </Button>
        </>
      }
    >
      <form id="variant-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input
          id="variant-title"
          label={f.titleLabel}
          placeholder={f.titlePlaceholder}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={saving}
          required
        />
        <div>
          <Input
            id="variant-sku"
            label={f.skuLabel}
            placeholder={f.skuPlaceholder}
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            disabled={saving || isEdit}
            required={!isEdit}
          />
          {isEdit ? <p className="mt-1.5 text-xs text-white/30">{f.skuLockedHint}</p> : null}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input
              id="variant-price"
              inputMode="decimal"
              label={f.priceLabel}
              placeholder={f.pricePlaceholder}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              disabled={saving}
              required
            />
            <p className="mt-1.5 text-xs text-white/30">{f.priceHint}</p>
          </div>
          <Select
            id="variant-vat-rate"
            label={f.vatRateLabel}
            value={vatRate}
            onChange={(event) => setVatRate(event.target.value)}
            disabled={saving}
            options={VAT_RATE_BPS_PRESETS.map((bps) => ({
              value: String(bps),
              label:
                bps === 0
                  ? f.vatRateOption0
                  : bps === 100
                    ? f.vatRateOption1
                    : bps === 1000
                      ? f.vatRateOption10
                      : f.vatRateOption20,
            }))}
          />
        </div>
        {/* F4C — Salt-okunur KDV tutarı + KDV dahil fiyat önizlemesi. Kesin hesap
            sunucudadır; bu blok yalnızca aynı formülle canlı önizlemedir. */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-white/40">{f.vatAmountLabel}</span>
            <span className="text-sm font-medium text-white/80" data-testid="variant-vat-amount">
              {vatPreview ? formatMinor(vatPreview.vatMinor, variant?.currency ?? "TRY") : "—"}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-white/40">{f.vatGrossLabel}</span>
            <span className="text-sm font-semibold text-white/90" data-testid="variant-vat-gross">
              {vatPreview ? formatMinor(vatPreview.grossMinor, variant?.currency ?? "TRY") : "—"}
            </span>
          </div>
          <p className="mt-2 text-xs text-white/30">{f.vatPreviewHint}</p>
        </div>
        <div>
          <Input
            id="variant-compare"
            inputMode="decimal"
            label={f.compareAtLabel}
            placeholder={f.compareAtPlaceholder}
            value={compareAt}
            onChange={(event) => setCompareAt(event.target.value)}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-white/30">{f.compareAtHint}</p>
        </div>
        {showCompareAtWarning ? (
          <Alert tone="warning">{f.compareAtBelowWarning}</Alert>
        ) : null}
        {/* F4B — Maliyet + hesaplı marj/markup göstergesi. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input
              id="variant-cost"
              inputMode="decimal"
              label={f.costLabel}
              placeholder={f.costPlaceholder}
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              disabled={saving}
            />
            <p className="mt-1.5 text-xs text-white/30">{f.costHint}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-white/40">{f.marginLabel}</span>
              <span className="text-sm font-medium text-white/80">
                {marginPct !== null ? `%${marginPct.toFixed(1)}` : "—"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-white/40">{f.markupLabel}</span>
              <span className="text-sm font-medium text-white/80">
                {markupPct !== null ? `%${markupPct.toFixed(1)}` : "—"}
              </span>
            </div>
            {costLive === null ? (
              <p className="mt-2 text-xs text-white/30">{f.marginNoCost}</p>
            ) : costExceedsList ? (
              <p className="mt-2 text-xs text-rose-300/80">{f.costTooHigh}</p>
            ) : grossLive === null ? (
              <p className="mt-2 text-xs text-white/30">{f.marginNoPrice}</p>
            ) : null}
          </div>
        </div>
        {isEdit && variant ? (
          <PriceHistory product={product} variant={variant} labels={f} locale={locale} />
        ) : null}
        {/* TODO-152A — "Kritik stok eşiği" kaldırıldı: stok eşiği artık Inventory Engine'de tek
            authority olan InventoryBalance.reorderPoint'tir (Product Detail > Stok sekmesi + global
            izleme merkezi). Barkod tek başına kalır. */}
        <Input
          id="variant-barcode"
          label={f.barcodeLabel}
          placeholder={f.barcodePlaceholder}
          value={barcode}
          onChange={(event) => setBarcode(event.target.value)}
          disabled={saving}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="variant-shipping-weight"
            type="number"
            min={0}
            step="0.001"
            label={f.shippingWeightLabel}
            value={shippingWeightKg}
            onChange={(event) => setShippingWeightKg(event.target.value)}
            disabled={saving}
          />
          <Input
            id="variant-shipping-desi"
            type="number"
            min={0}
            step="0.01"
            label={f.shippingDesiLabel}
            value={shippingDesi}
            onChange={(event) => setShippingDesi(event.target.value)}
            disabled={saving}
          />
        </div>
        <p className="text-xs text-white/30">{f.shippingDesiHint}</p>
        <Select
          id="variant-status"
          label={f.statusLabel}
          options={statusOptions}
          value={status}
          onChange={(event) => setStatus(event.target.value as VariantStatus)}
          disabled={saving}
        />
      </form>
    </Modal>
  );
}

type VariantFormLabels = ReturnType<typeof getDictionary>["storeAdmin"]["variants"]["form"];
type AdminLocale = ReturnType<typeof useLocale>;

// F4B — Varyant fiyat/liste/maliyet değişikliği geçmişi (talep üzerine yüklenir).
function PriceHistory({
  product,
  variant,
  labels,
  locale,
}: {
  product: Product;
  variant: ProductVariant;
  labels: VariantFormLabels;
  locale: AdminLocale;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; changes: ProductPriceChange[] }
  >({ status: "idle" });

  const sourceLabel = (source: ProductPriceChange["source"]) =>
    source === "IMPORT"
      ? labels.historySourceImport
      : source === "API"
        ? labels.historySourceApi
        : labels.historySourceAdminEdit;

  const money = (minor: number | null) => (minor === null ? "—" : formatMinor(minor, variant.currency));

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (state.status === "ready") return;
    setState({ status: "loading" });
    try {
      const res = await storeApi.listPriceChanges(product.id, variant.id);
      setState({ status: "ready", changes: res.data });
    } catch {
      setState({ status: "error" });
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-white/60 transition hover:text-white/80"
      >
        <span>{labels.historyOpen}</span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="border-t border-white/10 px-3 py-2">
          {state.status === "loading" || state.status === "idle" ? (
            <p className="text-xs text-white/30">…</p>
          ) : state.status === "error" ? (
            <Alert tone="error">{labels.historyLoadError}</Alert>
          ) : state.changes.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead className="text-white/40">
                <tr>
                  <th className="py-1 pr-2 font-normal">{labels.historyColDate}</th>
                  <th className="py-1 pr-2 font-normal">{labels.historyColPrice}</th>
                  <th className="py-1 pr-2 font-normal">{labels.historyColCompareAt}</th>
                  <th className="py-1 pr-2 font-normal">{labels.historyColCost}</th>
                  <th className="py-1 font-normal">{labels.historyColSource}</th>
                </tr>
              </thead>
              <tbody className="text-white/70">
                {state.changes.map((change) => (
                  <tr key={change.id} className="border-t border-white/5">
                    <td className="whitespace-nowrap py-1 pr-2">
                      {formatDateTime(change.createdAt, locale)}
                    </td>
                    <td className="whitespace-nowrap py-1 pr-2">{money(change.newPriceMinor)}</td>
                    <td className="whitespace-nowrap py-1 pr-2">{money(change.newCompareAtMinor)}</td>
                    <td className="whitespace-nowrap py-1 pr-2">{money(change.newCostMinor)}</td>
                    <td className="whitespace-nowrap py-1">{sourceLabel(change.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-white/30">{labels.historyEmpty}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
