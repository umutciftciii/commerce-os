"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "../../../../components/ui";
import type {
  ShippingRatePlanResponse,
  ShippingRatePlanCreateRequest,
  ShippingRateRuleInput,
} from "@commerce-os/api-client";
import { ShippingIcon } from "../../../../components/icons";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatMinor, minorToInput, inputToMinor } from "../../../../lib/client/format";

type Locale = "tr" | "en";

const PROVIDERS = ["", "DHL_ECOMMERCE", "MOCK", "GELIVER"] as const;
const PRICING_MODES = ["FIXED", "FREE_THRESHOLD", "DESI_TABLE", "WEIGHT_TABLE", "DESI_AND_REGION_TABLE"] as const;
type PricingMode = (typeof PRICING_MODES)[number];

const PROVIDER_LABEL: Record<string, string> = {
  "": "—",
  DHL_ECOMMERCE: "DHL eCommerce",
  MOCK: "MOCK",
  GELIVER: "Geliver",
};

/** Tablo tabanlı modlar kural editörünü açar (desi/kg/şehir). */
const TABLE_MODES: PricingMode[] = ["DESI_TABLE", "WEIGHT_TABLE", "DESI_AND_REGION_TABLE"];

/**
 * F3C.2 — Kargo Tarifeleri. Kargo ücreti SAĞLAYICI quote'u DEĞİLDİR; mağaza kargo
 * tarifesine göre hesaplanır (ADR-036). DHL eCommerce operasyon entegrasyonu
 * aktiftir; ücret store tarifesinden belirlenir. İlk UI: sabit + ücretsiz eşik +
 * desi tablosu. Bölge tablosu modeli destekler (gelişmiş UI TODO-109).
 */
const L = {
  tr: {
    eyebrow: "Satış",
    title: "Kargo Tarifeleri",
    description:
      "Kargo ücreti mağaza kargo tarifesine göre hesaplanır. DHL eCommerce operasyon entegrasyonu aktiftir; kargo ücreti mağaza tarifesine göre belirlenir.",
    add: "Yeni tarife",
    empty: "Henüz kargo tarifesi yok",
    emptyDesc: "Checkout'ta kargo ücreti hesaplanabilmesi için en az bir aktif tarife ekleyin.",
    colName: "Tarife",
    colMode: "Hesaplama",
    colAmount: "Ücret",
    colStatus: "Durum",
    colRules: "Kural",
    edit: "Düzenle",
    setDefault: "Varsayılan yap",
    enable: "Etkinleştir",
    disable: "Pasifleştir",
    remove: "Sil",
    default: "Varsayılan",
    active: "Aktif",
    passive: "Pasif",
    free: "Ücretsiz kargo eşiği",
    formName: "Tarife adı",
    formProvider: "Sağlayıcı ilişkisi (opsiyonel)",
    formMode: "Hesaplama yöntemi",
    formCurrency: "Para birimi",
    formFixed: "Sabit ücret",
    formThreshold: "Ücretsiz kargo eşiği",
    formValidFrom: "Geçerlilik başlangıcı",
    formValidTo: "Geçerlilik bitişi",
    formDefault: "Varsayılan tarife yap",
    save: "Kaydet",
    cancel: "Vazgeç",
    rulesTitle: "Kurallar (desi/kg/bölge)",
    rulesHint: "min–max aralığına ve en spesifik şehir/ilçe eşleşmesine göre ücret seçilir.",
    addRule: "Kural ekle",
    ruleMinDesi: "Min desi",
    ruleMaxDesi: "Max desi",
    ruleMinKg: "Min kg",
    ruleMaxKg: "Max kg",
    ruleCity: "Şehir",
    ruleDistrict: "İlçe",
    ruleAmount: "Ücret",
    ruleDelete: "Sil",
    modeLabels: {
      FIXED: "Sabit ücret",
      FREE_THRESHOLD: "Ücretsiz kargo eşiği",
      DESI_TABLE: "Desi tablosu",
      WEIGHT_TABLE: "Kg tablosu",
      DESI_AND_REGION_TABLE: "Desi + bölge tablosu",
    } as Record<PricingMode, string>,
  },
  en: {
    eyebrow: "Sales",
    title: "Shipping Rates",
    description:
      "Shipping fee is calculated from the store shipping tariff. The DHL eCommerce operations integration is active; the shipping fee is determined by the store tariff.",
    add: "New rate",
    empty: "No shipping rates yet",
    emptyDesc: "Add at least one active rate so checkout can calculate the shipping fee.",
    colName: "Rate",
    colMode: "Pricing",
    colAmount: "Fee",
    colStatus: "Status",
    colRules: "Rules",
    edit: "Edit",
    setDefault: "Make default",
    enable: "Enable",
    disable: "Disable",
    remove: "Delete",
    default: "Default",
    active: "Active",
    passive: "Passive",
    free: "Free shipping threshold",
    formName: "Rate name",
    formProvider: "Provider association (optional)",
    formMode: "Pricing mode",
    formCurrency: "Currency",
    formFixed: "Fixed fee",
    formThreshold: "Free shipping threshold",
    formValidFrom: "Valid from",
    formValidTo: "Valid to",
    formDefault: "Make this the default rate",
    save: "Save",
    cancel: "Cancel",
    rulesTitle: "Rules (desi/kg/region)",
    rulesHint: "Fee is picked by min–max bracket and the most specific city/district match.",
    addRule: "Add rule",
    ruleMinDesi: "Min desi",
    ruleMaxDesi: "Max desi",
    ruleMinKg: "Min kg",
    ruleMaxKg: "Max kg",
    ruleCity: "City",
    ruleDistrict: "District",
    ruleAmount: "Fee",
    ruleDelete: "Delete",
    modeLabels: {
      FIXED: "Fixed fee",
      FREE_THRESHOLD: "Free shipping threshold",
      DESI_TABLE: "Desi table",
      WEIGHT_TABLE: "Weight table",
      DESI_AND_REGION_TABLE: "Desi + region table",
    } as Record<PricingMode, string>,
  },
} satisfies Record<Locale, unknown>;

interface PlanFormState {
  name: string;
  provider: string;
  pricingMode: PricingMode;
  currency: string;
  fixedAmount: string;
  threshold: string;
  validFrom: string;
  validTo: string;
  isDefault: boolean;
}

const emptyForm: PlanFormState = {
  name: "",
  provider: "",
  pricingMode: "FIXED",
  currency: "TRY",
  fixedAmount: "",
  threshold: "",
  validFrom: "",
  validTo: "",
  isDefault: false,
};

export default function ShippingRatesPage() {
  const locale = useLocale() as Locale;
  const t = L[locale];

  const [plans, setPlans] = useState<ShippingRatePlanResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShippingRatePlanResponse | null>(null);
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await storeApi.listShippingRatePlans();
      setPlans(result.data);
      setError(null);
    } catch (err) {
      setError(messageForError(err, locale));
      setPlans([]);
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (plan: ShippingRatePlanResponse) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      provider: plan.provider ?? "",
      pricingMode: plan.pricingMode,
      currency: plan.currency,
      fixedAmount: minorToInput(plan.fixedAmountMinor),
      threshold: minorToInput(plan.freeShippingThresholdMinor),
      validFrom: plan.validFrom ? plan.validFrom.slice(0, 10) : "",
      validTo: plan.validTo ? plan.validTo.slice(0, 10) : "",
      isDefault: plan.isDefault,
    });
    setModalOpen(true);
  };

  const buildPayload = (): ShippingRatePlanCreateRequest => ({
    name: form.name.trim(),
    provider: form.provider ? (form.provider as ShippingRatePlanCreateRequest["provider"]) : null,
    status: "ACTIVE",
    isDefault: form.isDefault,
    pricingMode: form.pricingMode,
    currency: form.currency.trim().toUpperCase(),
    fixedAmountMinor: inputToMinor(form.fixedAmount),
    freeShippingThresholdMinor: inputToMinor(form.threshold),
    validFrom: form.validFrom ? new Date(`${form.validFrom}T00:00:00.000Z`).toISOString() : null,
    validTo: form.validTo ? new Date(`${form.validTo}T23:59:59.000Z`).toISOString() : null,
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (editing) {
        await storeApi.updateShippingRatePlan(editing.id, payload);
      } else {
        await storeApi.createShippingRatePlan(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(messageForError(err, locale));
    } finally {
      setSaving(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(messageForError(err, locale));
    }
  };

  const columns = useMemo<DataTableColumn<ShippingRatePlanResponse>[]>(
    () => [
      {
        header: t.colName,
        cell: (plan) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-white/90">{plan.name}</span>
            {plan.isDefault ? <Badge tone="success">{t.default}</Badge> : null}
            {plan.provider ? <Badge tone="neutral">{PROVIDER_LABEL[plan.provider]}</Badge> : null}
          </div>
        ),
      },
      { header: t.colMode, cell: (plan) => t.modeLabels[plan.pricingMode] },
      {
        header: t.colAmount,
        cell: (plan) =>
          plan.fixedAmountMinor != null ? formatMinor(plan.fixedAmountMinor, plan.currency) : "—",
      },
      {
        header: t.colStatus,
        cell: (plan) => (
          <Badge tone={plan.status === "ACTIVE" ? "success" : "neutral"}>
            {plan.status === "ACTIVE" ? t.active : t.passive}
          </Badge>
        ),
      },
      { header: t.colRules, cell: (plan) => String(plan.ruleCount) },
      {
        header: "",
        cell: (plan) => (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => openEdit(plan)}>
              {t.edit}
            </Button>
            {!plan.isDefault && plan.status === "ACTIVE" ? (
              <Button size="sm" variant="ghost" onClick={() => void act(() => storeApi.setDefaultShippingRatePlan(plan.id))}>
                {t.setDefault}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void act(() =>
                  storeApi.updateShippingRatePlan(plan.id, {
                    status: plan.status === "ACTIVE" ? "PASSIVE" : "ACTIVE",
                  }),
                )
              }
            >
              {plan.status === "ACTIVE" ? t.disable : t.enable}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void act(() => storeApi.deleteShippingRatePlan(plan.id))}>
              {t.remove}
            </Button>
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button onClick={openCreate}>{t.add}</Button>}
      />

      {error ? <Alert tone="error" title={error} /> : null}

      {plans === null ? (
        <SkeletonRows rows={4} />
      ) : plans.length === 0 ? (
        <EmptyState icon={<ShippingIcon />} title={t.empty} description={t.emptyDesc} action={<Button onClick={openCreate}>{t.add}</Button>} />
      ) : (
        <DataTable columns={columns} rows={plans} rowKey={(plan) => plan.id} />
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t.edit : t.add}
        closeLabel={t.cancel}
      >
        <form onSubmit={submit} className="space-y-4">
          <Input
            label={t.formName}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Select
            label={t.formProvider}
            value={form.provider}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))}
          />
          <Select
            label={t.formMode}
            value={form.pricingMode}
            onChange={(e) => setForm((f) => ({ ...f, pricingMode: e.target.value as PricingMode }))}
            options={PRICING_MODES.map((m) => ({ value: m, label: t.modeLabels[m] }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t.formFixed}
              inputMode="decimal"
              value={form.fixedAmount}
              onChange={(e) => setForm((f) => ({ ...f, fixedAmount: e.target.value }))}
            />
            <Input
              label={t.formThreshold}
              inputMode="decimal"
              value={form.threshold}
              onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t.formValidFrom}
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
            />
            <Input
              label={t.formValidTo}
              type="date"
              value={form.validTo}
              onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
            />
            {t.formDefault}
          </label>

          {editing && TABLE_MODES.includes(form.pricingMode) ? (
            <RulesEditor plan={editing} locale={locale} onChanged={load} />
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const emptyRule = { minDesi: "", maxDesi: "", minWeightKg: "", maxWeightKg: "", cityCode: "", districtCode: "", amount: "" };

function RulesEditor({
  plan,
  locale,
  onChanged,
}: {
  plan: ShippingRatePlanResponse;
  locale: Locale;
  onChanged: () => Promise<void>;
}) {
  const t = L[locale];
  const [draft, setDraft] = useState(emptyRule);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addRule = async () => {
    setBusy(true);
    setErr(null);
    try {
      const input: ShippingRateRuleInput = {
        minDesi: draft.minDesi ? Number(draft.minDesi) : null,
        maxDesi: draft.maxDesi ? Number(draft.maxDesi) : null,
        minWeightKg: draft.minWeightKg ? Number(draft.minWeightKg) : null,
        maxWeightKg: draft.maxWeightKg ? Number(draft.maxWeightKg) : null,
        cityCode: draft.cityCode.trim() || null,
        districtCode: draft.districtCode.trim() || null,
        amountMinor: inputToMinor(draft.amount) ?? 0,
        sortOrder: 0,
      };
      await storeApi.addShippingRateRule(plan.id, input);
      setDraft(emptyRule);
      await onChanged();
    } catch (e) {
      setErr(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  };

  const removeRule = async (ruleId: string) => {
    setBusy(true);
    setErr(null);
    try {
      await storeApi.deleteShippingRateRule(plan.id, ruleId);
      await onChanged();
    } catch (e) {
      setErr(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 p-3">
      <p className="text-sm font-medium text-white/80">{t.rulesTitle}</p>
      <p className="mb-3 text-xs text-white/40">{t.rulesHint}</p>
      {err ? <Alert tone="error" title={err} className="mb-2" /> : null}
      <ul className="mb-3 space-y-1 text-xs text-white/70">
        {plan.rules.map((rule) => (
          <li key={rule.id} className="flex items-center justify-between gap-2">
            <span>
              {rule.minDesi ?? "–"}–{rule.maxDesi ?? "–"} desi
              {rule.cityCode ? ` · ${rule.cityCode}` : ""} · {formatMinor(rule.amountMinor, plan.currency)}
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeRule(rule.id)}>
              {t.ruleDelete}
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        <Input label={t.ruleMinDesi} inputMode="decimal" value={draft.minDesi} onChange={(e) => setDraft((d) => ({ ...d, minDesi: e.target.value }))} />
        <Input label={t.ruleMaxDesi} inputMode="decimal" value={draft.maxDesi} onChange={(e) => setDraft((d) => ({ ...d, maxDesi: e.target.value }))} />
        <Input label={t.ruleAmount} inputMode="decimal" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
        <Input label={t.ruleCity} value={draft.cityCode} onChange={(e) => setDraft((d) => ({ ...d, cityCode: e.target.value }))} />
        <Input label={t.ruleDistrict} value={draft.districtCode} onChange={(e) => setDraft((d) => ({ ...d, districtCode: e.target.value }))} />
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" disabled={busy} onClick={() => void addRule()}>
          {t.addRule}
        </Button>
      </div>
    </div>
  );
}
