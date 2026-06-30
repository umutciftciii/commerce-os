"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SectionCard,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "../../../../components/ui";
import type {
  ShippingRatePlanResponse,
  ShippingRatePlanCreateRequest,
  ShippingRateRuleInput,
  ShippingRateTierInput,
  ShippingRateZoneInput,
  ShippingSurchargeInput,
  ShippingChargeType,
} from "@commerce-os/api-client";
import { ShippingIcon } from "../../../../components/icons";
import { MatrixManager } from "./MatrixManager";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatMinor, minorToInput, inputToMinor } from "../../../../lib/client/format";

type Locale = "tr" | "en";

const PROVIDERS = ["", "DHL_ECOMMERCE", "MOCK", "GELIVER"] as const;
const PRICING_MODES = ["FIXED", "FREE_THRESHOLD", "DESI_TABLE", "WEIGHT_TABLE", "DESI_AND_REGION_TABLE"] as const;
type PricingMode = (typeof PRICING_MODES)[number];
const CHARGE_TYPES: ShippingChargeType[] = ["FLAT", "PER_KG", "PER_DESI", "PER_KG_OR_DESI", "PER_ADDITIONAL_KG_OR_DESI"];

const PROVIDER_LABEL: Record<string, string> = {
  "": "—",
  DHL_ECOMMERCE: "DHL eCommerce",
  MOCK: "MOCK",
  GELIVER: "Geliver",
};

/** Gelişmiş tarife motoru tablo modları (tier/zone/rule/surcharge editörü açılır). */
const TABLE_MODES: PricingMode[] = ["DESI_TABLE", "WEIGHT_TABLE", "DESI_AND_REGION_TABLE"];

/**
 * F3C.2 revizyon — Kargo Tarifeleri (Generic Tariff Engine, ADR-044). Kargo ücreti
 * SAĞLAYICI quote'u DEĞİLDİR; mağaza tarifesinden hesaplanır. AUTHORITATIVE hesap
 * backend'tedir; bu ekran yalnız tarife verisini girer. Provider fiyat listeleri
 * (DHL Tarife I/II/III, Aras zone/31+, Yurtiçi desi) bu generic modele maplenir.
 * Veri giriş ekranları modal DEĞİL; geniş tam-genişlik panellerdir.
 */
const L = {
  tr: {
    eyebrow: "Satış",
    title: "Kargo Tarifeleri",
    description:
      "Kargo ücreti mağaza tarifesine göre hesaplanır (sağlayıcı quote değil). Basit: sabit/eşik/desi. Gelişmiş: segment (DHL Tarife I/II/III), bölge (Aras zone), kg/desi kuralı, ek hizmet.",
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
    basics: "Tarife bilgileri",
    formName: "Tarife adı",
    formProvider: "Sağlayıcı ilişkisi (opsiyonel, fiyat etkisi yok)",
    formMode: "Hesaplama yöntemi",
    formCurrency: "Para birimi",
    formFixed: "Sabit ücret",
    formThreshold: "Ücretsiz kargo eşiği",
    formValidFrom: "Geçerlilik başlangıcı",
    formValidTo: "Geçerlilik bitişi",
    formDefault: "Varsayılan tarife yap",
    create: "Tarife oluştur",
    saveBasics: "Bilgileri kaydet",
    close: "Kapat",
    simpleVsAdvanced: "Görünüm",
    simple: "Basit",
    advanced: "Gelişmiş",
    matrix: "Matris",
    tiers: "Segmentler (aylık gönderi hacmi · DHL Tarife I/II/III)",
    tiersHint: "Aylık gönderi adedine göre tarife seçilir. Min/Max boş = açık uç. Çakışan aralıklar reddedilir.",
    zones: "Bölgeler (mesafe zonu · Aras şehir-içi/yakın/kısa/orta/uzak/KKTC)",
    zonesHint: "Kod plan içinde benzersiz olmalı. Kural bir bölgeye bağlanabilir.",
    surcharges: "Ek hizmet bedelleri (SMS, güvence, hamaliye, ağır gönderi...)",
    surchargesHint: "Zorunlular her quote'a eklenir; opsiyoneller müşteri seçince. Koşul: minBillable vb.",
    rules: "Kurallar (kg/desi · charge tipi)",
    rulesHint: "billableWeight = max(kg, desi). En spesifik kural seçilir: ilçe > şehir > bölge > region > generic; eşitlikte sortOrder.",
    name: "Ad",
    code: "Kod",
    monthlyMin: "Aylık min",
    monthlyMax: "Aylık max",
    sortOrder: "Sıra",
    minKm: "Min km",
    maxKm: "Max km",
    addTier: "Segment ekle",
    addZone: "Bölge ekle",
    addSurcharge: "Ek hizmet ekle",
    addRule: "Kural ekle",
    chargeType: "Ücret tipi",
    amount: "Tutar",
    unitAmount: "Birim ücret",
    baseAmount: "Taban ücret",
    baseThreshold: "Taban eşik (kg/desi)",
    minDesi: "Min desi",
    maxDesi: "Max desi",
    minKg: "Min kg",
    maxKg: "Max kg",
    tier: "Segment",
    zone: "Bölge",
    city: "Şehir",
    district: "İlçe",
    optional: "Opsiyonel (müşteri seçer)",
    none: "—",
    delete: "Sil",
    over: "ve üzeri",
    chargeLabels: {
      FLAT: "Sabit (FLAT)",
      PER_KG: "Kg başına",
      PER_DESI: "Desi başına",
      PER_KG_OR_DESI: "Kg/desi başına (max)",
      PER_ADDITIONAL_KG_OR_DESI: "Eşik üstü birim (30+/31+)",
    } as Record<ShippingChargeType, string>,
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
      "Shipping fee is calculated from the store tariff (not a provider quote). Simple: fixed/threshold/desi. Advanced: tier (DHL), zone (Aras), kg/desi rule, surcharges.",
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
    basics: "Rate details",
    formName: "Rate name",
    formProvider: "Provider association (optional, no price effect)",
    formMode: "Pricing mode",
    formCurrency: "Currency",
    formFixed: "Fixed fee",
    formThreshold: "Free shipping threshold",
    formValidFrom: "Valid from",
    formValidTo: "Valid to",
    formDefault: "Make this the default rate",
    create: "Create rate",
    saveBasics: "Save details",
    close: "Close",
    simpleVsAdvanced: "View",
    simple: "Simple",
    advanced: "Advanced",
    matrix: "Matrix",
    tiers: "Tiers (monthly volume · DHL Tarife I/II/III)",
    tiersHint: "Tier is picked by monthly shipment count. Empty min/max = open end. Overlaps rejected.",
    zones: "Zones (distance zone · Aras city/near/short/medium/far/KKTC)",
    zonesHint: "Code must be unique within the plan. A rule can bind to a zone.",
    surcharges: "Surcharges (SMS, insurance, handling, heavy...)",
    surchargesHint: "Mandatory always added; optional when customer selects. Condition: minBillable etc.",
    rules: "Rules (kg/desi · charge type)",
    rulesHint: "billableWeight = max(kg, desi). Most specific rule wins: district > city > zone > region > generic; tie-break sortOrder.",
    name: "Name",
    code: "Code",
    monthlyMin: "Monthly min",
    monthlyMax: "Monthly max",
    sortOrder: "Order",
    minKm: "Min km",
    maxKm: "Max km",
    addTier: "Add tier",
    addZone: "Add zone",
    addSurcharge: "Add surcharge",
    addRule: "Add rule",
    chargeType: "Charge type",
    amount: "Amount",
    unitAmount: "Unit amount",
    baseAmount: "Base amount",
    baseThreshold: "Base threshold (kg/desi)",
    minDesi: "Min desi",
    maxDesi: "Max desi",
    minKg: "Min kg",
    maxKg: "Max kg",
    tier: "Tier",
    zone: "Zone",
    city: "City",
    district: "District",
    optional: "Optional (customer selects)",
    none: "—",
    delete: "Delete",
    over: "and above",
    chargeLabels: {
      FLAT: "Flat (FLAT)",
      PER_KG: "Per kg",
      PER_DESI: "Per desi",
      PER_KG_OR_DESI: "Per kg/desi (max)",
      PER_ADDITIONAL_KG_OR_DESI: "Per additional (30+/31+)",
    } as Record<ShippingChargeType, string>,
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  const editingPlan = useMemo(
    () => plans?.find((p) => p.id === editingId) ?? null,
    [plans, editingId],
  );

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
      { header: t.colMode, cell: (plan) => t.modeLabels[plan.pricingMode as PricingMode] },
      {
        header: t.colAmount,
        cell: (plan) => (plan.fixedAmountMinor != null ? formatMinor(plan.fixedAmountMinor, plan.currency) : "—"),
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
            <Button size="sm" variant="secondary" onClick={() => { setCreating(false); setEditingId(plan.id); }}>
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
                  storeApi.updateShippingRatePlan(plan.id, { status: plan.status === "ACTIVE" ? "PASSIVE" : "ACTIVE" }),
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
        actions={<Button onClick={() => { setEditingId(null); setCreating(true); }}>{t.add}</Button>}
      />

      {error ? <Alert tone="error" title={error} /> : null}

      {plans === null ? (
        <SkeletonRows rows={4} />
      ) : plans.length === 0 && !creating ? (
        <EmptyState
          icon={<ShippingIcon />}
          title={t.empty}
          description={t.emptyDesc}
          action={<Button onClick={() => setCreating(true)}>{t.add}</Button>}
        />
      ) : (
        <DataTable columns={columns} rows={plans} rowKey={(plan) => plan.id} />
      )}

      {creating ? (
        <PlanBasicsEditor
          locale={locale}
          plan={null}
          onClose={() => setCreating(false)}
          onSaved={async (created) => {
            setCreating(false);
            await load();
            if (created) setEditingId(created.id);
          }}
        />
      ) : null}

      {editingPlan ? (
        <PlanEditor
          key={editingPlan.id}
          locale={locale}
          plan={editingPlan}
          onClose={() => setEditingId(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}

/** Plan oluşturma/temel bilgi düzenleme — tam genişlik panel (modal değil). */
function PlanBasicsEditor({
  locale,
  plan,
  onClose,
  onSaved,
}: {
  locale: Locale;
  plan: ShippingRatePlanResponse | null;
  onClose: () => void;
  onSaved: (created: ShippingRatePlanResponse | null) => Promise<void> | void;
}) {
  const t = L[locale];
  const [form, setForm] = useState<PlanFormState>(
    plan
      ? {
          name: plan.name,
          provider: plan.provider ?? "",
          pricingMode: plan.pricingMode as PricingMode,
          currency: plan.currency,
          fixedAmount: minorToInput(plan.fixedAmountMinor),
          threshold: minorToInput(plan.freeShippingThresholdMinor),
          validFrom: plan.validFrom ? plan.validFrom.slice(0, 10) : "",
          validTo: plan.validTo ? plan.validTo.slice(0, 10) : "",
          isDefault: plan.isDefault,
        }
      : emptyForm,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload: ShippingRatePlanCreateRequest = {
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
      };
      if (plan) {
        await storeApi.updateShippingRatePlan(plan.id, payload);
        await onSaved(null);
      } else {
        const created = await storeApi.createShippingRatePlan(payload);
        await onSaved(created);
      }
    } catch (e) {
      setErr(messageForError(e, locale));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title={t.basics} description={plan ? plan.name : undefined}>
      {err ? <Alert tone="error" title={err} className="mb-3" /> : null}
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label={t.formName} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
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
          <Input label={t.formCurrency} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
          <Input label={t.formFixed} inputMode="decimal" value={form.fixedAmount} onChange={(e) => setForm((f) => ({ ...f, fixedAmount: e.target.value }))} />
          <Input label={t.formThreshold} inputMode="decimal" value={form.threshold} onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))} />
          <Input label={t.formValidFrom} type="date" value={form.validFrom} onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))} />
          <Input label={t.formValidTo} type="date" value={form.validTo} onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))} />
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />
          {t.formDefault}
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.close}
          </Button>
          <Button type="submit" disabled={saving || !form.name.trim()}>
            {plan ? t.saveBasics : t.create}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/** Mevcut planın tam editörü: bilgiler + Basit/Gelişmiş sekmeler. */
function PlanEditor({
  locale,
  plan,
  onClose,
  onChanged,
}: {
  locale: Locale;
  plan: ShippingRatePlanResponse;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const t = L[locale];
  // Tablo modunda ana akış MATRİS (fiyat listesi yönetimi); Basit ve Gelişmiş korunur.
  const [view, setView] = useState<"matrix" | "simple" | "advanced">("matrix");
  const isTableMode = TABLE_MODES.includes(plan.pricingMode as PricingMode);
  const tabs: Array<["matrix" | "simple" | "advanced", string]> = [
    ["matrix", t.matrix],
    ["simple", t.simple],
    ["advanced", t.advanced],
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white/90">{plan.name}</h2>
        <div className="flex items-center gap-2">
          {isTableMode ? (
            <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  className={`rounded-md px-3 py-1 ${view === key ? "bg-white/10 text-white" : "text-white/50"}`}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t.close}
          </Button>
        </div>
      </div>

      <PlanBasicsEditor locale={locale} plan={plan} onClose={onClose} onSaved={() => onChanged()} />

      {isTableMode && view === "matrix" ? (
        <MatrixManager locale={locale} plan={plan} onChanged={onChanged} />
      ) : null}

      {isTableMode && view === "advanced" ? (
        <>
          <TierManager locale={locale} plan={plan} onChanged={onChanged} />
          <ZoneManager locale={locale} plan={plan} onChanged={onChanged} />
          <RuleManager locale={locale} plan={plan} onChanged={onChanged} advanced />
          <SurchargeManager locale={locale} plan={plan} onChanged={onChanged} />
        </>
      ) : null}

      {isTableMode && view === "simple" ? (
        <RuleManager locale={locale} plan={plan} onChanged={onChanged} advanced={false} />
      ) : null}
    </div>
  );
}

function useManager(locale: Locale, onChanged: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (e) {
      setErr(messageForError(e, locale));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, run, setErr };
}

function TierManager({ locale, plan, onChanged }: { locale: Locale; plan: ShippingRatePlanResponse; onChanged: () => Promise<void> }) {
  const t = L[locale];
  const { busy, err, run } = useManager(locale, onChanged);
  const [draft, setDraft] = useState({ name: "", min: "", max: "", sortOrder: "" });

  const add = async () => {
    const input: ShippingRateTierInput = {
      name: draft.name.trim(),
      monthlyShipmentMin: draft.min ? Number(draft.min) : null,
      monthlyShipmentMax: draft.max ? Number(draft.max) : null,
      sortOrder: draft.sortOrder ? Number(draft.sortOrder) : 0,
    };
    if (await run(() => storeApi.addShippingRateTier(plan.id, input))) setDraft({ name: "", min: "", max: "", sortOrder: "" });
  };

  return (
    <SectionCard title={t.tiers} description={t.tiersHint}>
      {err ? <Alert tone="error" title={err} className="mb-2" /> : null}
      <ul className="mb-3 space-y-1 text-sm text-white/70">
        {plan.tiers.map((tier) => (
          <li key={tier.id} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-3 py-1.5">
            <span>
              <span className="font-medium text-white/85">{tier.name}</span> · {tier.monthlyShipmentMin ?? 0}–{tier.monthlyShipmentMax ?? t.over}
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => storeApi.deleteShippingRateTier(plan.id, tier.id))}>
              {t.delete}
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 md:grid-cols-4">
        <Input label={t.name} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <Input label={t.monthlyMin} inputMode="numeric" value={draft.min} onChange={(e) => setDraft((d) => ({ ...d, min: e.target.value }))} />
        <Input label={t.monthlyMax} inputMode="numeric" value={draft.max} onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value }))} />
        <Input label={t.sortOrder} inputMode="numeric" value={draft.sortOrder} onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))} />
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={busy || !draft.name.trim()} onClick={() => void add()}>
          {t.addTier}
        </Button>
      </div>
    </SectionCard>
  );
}

function ZoneManager({ locale, plan, onChanged }: { locale: Locale; plan: ShippingRatePlanResponse; onChanged: () => Promise<void> }) {
  const t = L[locale];
  const { busy, err, run } = useManager(locale, onChanged);
  const [draft, setDraft] = useState({ code: "", name: "", minKm: "", maxKm: "", sortOrder: "" });

  const add = async () => {
    const input: ShippingRateZoneInput = {
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      minDistanceKm: draft.minKm ? Number(draft.minKm) : null,
      maxDistanceKm: draft.maxKm ? Number(draft.maxKm) : null,
      sortOrder: draft.sortOrder ? Number(draft.sortOrder) : 0,
    };
    if (await run(() => storeApi.addShippingRateZone(plan.id, input))) setDraft({ code: "", name: "", minKm: "", maxKm: "", sortOrder: "" });
  };

  return (
    <SectionCard title={t.zones} description={t.zonesHint}>
      {err ? <Alert tone="error" title={err} className="mb-2" /> : null}
      <ul className="mb-3 space-y-1 text-sm text-white/70">
        {plan.zones.map((zone) => (
          <li key={zone.id} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-3 py-1.5">
            <span>
              <Badge tone="neutral">{zone.code}</Badge> <span className="font-medium text-white/85">{zone.name}</span>
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => storeApi.deleteShippingRateZone(plan.id, zone.id))}>
              {t.delete}
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 md:grid-cols-5">
        <Input label={t.code} value={draft.code} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} />
        <Input label={t.name} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <Input label={t.minKm} inputMode="decimal" value={draft.minKm} onChange={(e) => setDraft((d) => ({ ...d, minKm: e.target.value }))} />
        <Input label={t.maxKm} inputMode="decimal" value={draft.maxKm} onChange={(e) => setDraft((d) => ({ ...d, maxKm: e.target.value }))} />
        <Input label={t.sortOrder} inputMode="numeric" value={draft.sortOrder} onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))} />
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={busy || !draft.code.trim() || !draft.name.trim()} onClick={() => void add()}>
          {t.addZone}
        </Button>
      </div>
    </SectionCard>
  );
}

const emptyRuleDraft = {
  chargeType: "FLAT" as ShippingChargeType,
  tierId: "",
  zoneId: "",
  minDesi: "",
  maxDesi: "",
  minKg: "",
  maxKg: "",
  city: "",
  district: "",
  amount: "",
  unitAmount: "",
  baseAmount: "",
  baseThreshold: "",
  sortOrder: "",
};

function RuleManager({
  locale,
  plan,
  onChanged,
  advanced,
}: {
  locale: Locale;
  plan: ShippingRatePlanResponse;
  onChanged: () => Promise<void>;
  advanced: boolean;
}) {
  const t = L[locale];
  const { busy, err, run } = useManager(locale, onChanged);
  const [draft, setDraft] = useState({ ...emptyRuleDraft });
  const ct = draft.chargeType;

  const tierName = (id: string | null) => plan.tiers.find((x) => x.id === id)?.name ?? null;
  const zoneCode = (id: string | null) => plan.zones.find((x) => x.id === id)?.code ?? null;

  const add = async () => {
    const input: ShippingRateRuleInput = {
      chargeType: ct,
      tierId: advanced && draft.tierId ? draft.tierId : null,
      zoneId: advanced && draft.zoneId ? draft.zoneId : null,
      minDesi: draft.minDesi ? Number(draft.minDesi) : null,
      maxDesi: draft.maxDesi ? Number(draft.maxDesi) : null,
      minWeightKg: draft.minKg ? Number(draft.minKg) : null,
      maxWeightKg: draft.maxKg ? Number(draft.maxKg) : null,
      cityCode: advanced && draft.city.trim() ? draft.city.trim() : null,
      districtCode: advanced && draft.district.trim() ? draft.district.trim() : null,
      amountMinor: ct === "FLAT" ? inputToMinor(draft.amount) : null,
      unitAmountMinor: ct !== "FLAT" ? inputToMinor(draft.unitAmount) : null,
      baseAmountMinor: ct === "PER_ADDITIONAL_KG_OR_DESI" ? inputToMinor(draft.baseAmount) : null,
      baseThreshold: ct === "PER_ADDITIONAL_KG_OR_DESI" && draft.baseThreshold ? Number(draft.baseThreshold) : null,
      sortOrder: draft.sortOrder ? Number(draft.sortOrder) : 0,
    };
    if (await run(() => storeApi.addShippingRateRule(plan.id, input))) setDraft({ ...emptyRuleDraft });
  };

  const ruleSummary = (r: ShippingRatePlanResponse["rules"][number]) => {
    const range = `${r.minDesi ?? r.minWeightKg ?? 0}–${r.maxDesi ?? r.maxWeightKg ?? t.over}`;
    const price =
      r.chargeType === "FLAT"
        ? formatMinor(r.amountMinor ?? 0, plan.currency)
        : r.chargeType === "PER_ADDITIONAL_KG_OR_DESI"
          ? `${formatMinor(r.baseAmountMinor ?? 0, plan.currency)} + ${formatMinor(r.unitAmountMinor ?? 0, plan.currency)}×(${t.over})`
          : `${formatMinor(r.unitAmountMinor ?? 0, plan.currency)} / birim`;
    const tags = [tierName(r.tierId), zoneCode(r.zoneId), r.cityCode, r.districtCode].filter(Boolean).join(" · ");
    return `${range} · ${t.chargeLabels[r.chargeType]} · ${price}${tags ? ` · ${tags}` : ""}`;
  };

  return (
    <SectionCard title={t.rules} description={t.rulesHint}>
      {err ? <Alert tone="error" title={err} className="mb-2" /> : null}
      <ul className="mb-3 space-y-1 text-sm text-white/70">
        {plan.rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-3 py-1.5">
            <span className="truncate">{ruleSummary(r)}</span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => storeApi.deleteShippingRateRule(plan.id, r.id))}>
              {t.delete}
            </Button>
          </li>
        ))}
      </ul>

      <div className="grid gap-2 md:grid-cols-4">
        {advanced ? (
          <Select
            label={t.chargeType}
            value={draft.chargeType}
            onChange={(e) => setDraft((d) => ({ ...d, chargeType: e.target.value as ShippingChargeType }))}
            options={CHARGE_TYPES.map((c) => ({ value: c, label: t.chargeLabels[c] }))}
          />
        ) : null}
        <Input label={t.minDesi} inputMode="decimal" value={draft.minDesi} onChange={(e) => setDraft((d) => ({ ...d, minDesi: e.target.value }))} />
        <Input label={t.maxDesi} inputMode="decimal" value={draft.maxDesi} onChange={(e) => setDraft((d) => ({ ...d, maxDesi: e.target.value }))} />
        {advanced ? (
          <>
            <Input label={t.minKg} inputMode="decimal" value={draft.minKg} onChange={(e) => setDraft((d) => ({ ...d, minKg: e.target.value }))} />
            <Input label={t.maxKg} inputMode="decimal" value={draft.maxKg} onChange={(e) => setDraft((d) => ({ ...d, maxKg: e.target.value }))} />
            <Select
              label={t.tier}
              value={draft.tierId}
              onChange={(e) => setDraft((d) => ({ ...d, tierId: e.target.value }))}
              options={[{ value: "", label: t.none }, ...plan.tiers.map((x) => ({ value: x.id, label: x.name }))]}
            />
            <Select
              label={t.zone}
              value={draft.zoneId}
              onChange={(e) => setDraft((d) => ({ ...d, zoneId: e.target.value }))}
              options={[{ value: "", label: t.none }, ...plan.zones.map((x) => ({ value: x.id, label: x.code }))]}
            />
            <Input label={t.city} value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
            <Input label={t.district} value={draft.district} onChange={(e) => setDraft((d) => ({ ...d, district: e.target.value }))} />
          </>
        ) : null}

        {ct === "FLAT" ? (
          <Input label={t.amount} inputMode="decimal" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
        ) : (
          <Input label={t.unitAmount} inputMode="decimal" value={draft.unitAmount} onChange={(e) => setDraft((d) => ({ ...d, unitAmount: e.target.value }))} />
        )}
        {ct === "PER_ADDITIONAL_KG_OR_DESI" ? (
          <>
            <Input label={t.baseAmount} inputMode="decimal" value={draft.baseAmount} onChange={(e) => setDraft((d) => ({ ...d, baseAmount: e.target.value }))} />
            <Input label={t.baseThreshold} inputMode="decimal" value={draft.baseThreshold} onChange={(e) => setDraft((d) => ({ ...d, baseThreshold: e.target.value }))} />
          </>
        ) : null}
        <Input label={t.sortOrder} inputMode="numeric" value={draft.sortOrder} onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))} />
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={busy} onClick={() => void add()}>
          {t.addRule}
        </Button>
      </div>
    </SectionCard>
  );
}

function SurchargeManager({ locale, plan, onChanged }: { locale: Locale; plan: ShippingRatePlanResponse; onChanged: () => Promise<void> }) {
  const t = L[locale];
  const { busy, err, run } = useManager(locale, onChanged);
  const [draft, setDraft] = useState({ code: "", name: "", chargeType: "FLAT" as ShippingChargeType, amount: "", unitAmount: "", isOptional: false, sortOrder: "" });
  const ct = draft.chargeType;

  const add = async () => {
    const input: ShippingSurchargeInput = {
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      chargeType: ct,
      amountMinor: ct === "FLAT" ? inputToMinor(draft.amount) : null,
      unitAmountMinor: ct !== "FLAT" ? inputToMinor(draft.unitAmount) : null,
      isOptional: draft.isOptional,
      sortOrder: draft.sortOrder ? Number(draft.sortOrder) : 0,
    };
    if (await run(() => storeApi.addShippingSurcharge(plan.id, input)))
      setDraft({ code: "", name: "", chargeType: "FLAT", amount: "", unitAmount: "", isOptional: false, sortOrder: "" });
  };

  return (
    <SectionCard title={t.surcharges} description={t.surchargesHint}>
      {err ? <Alert tone="error" title={err} className="mb-2" /> : null}
      <ul className="mb-3 space-y-1 text-sm text-white/70">
        {plan.surcharges.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-3 py-1.5">
            <span>
              <Badge tone="neutral">{s.code}</Badge> <span className="font-medium text-white/85">{s.name}</span> · {t.chargeLabels[s.chargeType]} ·{" "}
              {s.chargeType === "FLAT" ? formatMinor(s.amountMinor ?? 0, plan.currency) : `${formatMinor(s.unitAmountMinor ?? 0, plan.currency)} / birim`}
              {s.isOptional ? ` · ${t.optional}` : ""}
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => storeApi.deleteShippingSurcharge(plan.id, s.id))}>
              {t.delete}
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 md:grid-cols-4">
        <Input label={t.code} value={draft.code} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} />
        <Input label={t.name} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <Select
          label={t.chargeType}
          value={draft.chargeType}
          onChange={(e) => setDraft((d) => ({ ...d, chargeType: e.target.value as ShippingChargeType }))}
          options={CHARGE_TYPES.map((c) => ({ value: c, label: t.chargeLabels[c] }))}
        />
        {ct === "FLAT" ? (
          <Input label={t.amount} inputMode="decimal" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
        ) : (
          <Input label={t.unitAmount} inputMode="decimal" value={draft.unitAmount} onChange={(e) => setDraft((d) => ({ ...d, unitAmount: e.target.value }))} />
        )}
        <Input label={t.sortOrder} inputMode="numeric" value={draft.sortOrder} onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))} />
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm text-white/70">
        <input type="checkbox" checked={draft.isOptional} onChange={(e) => setDraft((d) => ({ ...d, isOptional: e.target.checked }))} />
        {t.optional}
      </label>
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={busy || !draft.code.trim() || !draft.name.trim()} onClick={() => void add()}>
          {t.addSurcharge}
        </Button>
      </div>
    </SectionCard>
  );
}
