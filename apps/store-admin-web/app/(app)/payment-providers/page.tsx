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
} from "../../../components/ui";
import type {
  PaymentProviderConfig,
  PaymentProviderConfigCreateRequest,
  PaymentProviderConfigUpdateRequest,
} from "@commerce-os/api-client";
import { PaymentIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../lib/client/format";

type Locale = "tr" | "en";

const PROVIDERS = ["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"] as const;
const MODES = ["TEST", "LIVE"] as const;
const METHODS = ["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY", "PAYMENT_LINK"] as const;
const THREE_DS = ["DISABLED", "OPTIONAL", "REQUIRED"] as const;

/**
 * F3B.2 — Ödeme Sağlayıcıları yönetim sayfası. Secret alanlar gateway tarafında
 * maskeli döner; bu sayfa secret'ı asla düz görmez. "Boş bırakılırsa korunur"
 * semantiği: secret input'u boşsa güncelleme isteğine eklenmez.
 *
 * i18n paketi nav/error dışındaki sayfa metinlerini taşımadığından (paylaşılan
 * paket; minimal tutuyoruz) sayfa içi metinler locale-farkındalıklı yerel L
 * sözlüğüyle verilir — store-nav'daki GROUP_LABELS deseniyle uyumlu.
 */
const L = {
  tr: {
    eyebrow: "Satış",
    title: "Ödeme Sağlayıcıları",
    description:
      "Sağlayıcı yapılandırmalarını yönetin. Bu faz canlı ödeme almaz; gerçek sağlayıcı sözleşmesi sonrası canlı adaptör bağlanabilecek operasyon altyapısıdır. MOCK sağlayıcı test ödeme akışını çalıştırır.",
    add: "Yeni sağlayıcı",
    empty: "Henüz ödeme sağlayıcı yok",
    emptyDesc: "Test ödeme akışını denemek için bir MOCK (TEST) sağlayıcı ekleyin.",
    colName: "Sağlayıcı",
    colStatus: "Durum",
    colMode: "Mod",
    colPriority: "Öncelik",
    colMethods: "Metotlar",
    colCurrencies: "Para birimi",
    colAmount: "Min/Maks",
    col3ds: "3D Secure",
    colInstallment: "Taksit",
    colTest: "Son test",
    colActions: "İşlemler",
    enabled: "Aktif",
    disabled: "Pasif",
    enable: "Aktifleştir",
    disable: "Pasifleştir",
    edit: "Düzenle",
    test: "Bağlantıyı test et",
    save: "Kaydet",
    cancel: "Vazgeç",
    close: "Kapat",
    createTitle: "Yeni ödeme sağlayıcı",
    editTitle: "Sağlayıcıyı düzenle",
    fDisplayName: "Görünen ad",
    fProvider: "Sağlayıcı",
    fMode: "Mod",
    fStatus: "Durum",
    fPriority: "Öncelik (küçük = önce)",
    fMethods: "Desteklenen ödeme metotları",
    fCurrencies: "Para birimleri (virgülle, örn. TRY,USD)",
    fMinAmount: "Min tutar (minor, örn. 10000 = 100,00)",
    fMaxAmount: "Maks tutar (minor)",
    f3ds: "3D Secure",
    fInstallment: "Taksit etkin",
    fFallback: "Fallback etkin (başarısızsa sıradaki denenir)",
    fMerchantId: "Merchant ID",
    fCallbackUrl: "Callback URL",
    fApiKey: "API Key",
    fSecretKey: "Secret Key",
    fWebhookSecret: "Webhook Secret",
    secretKeepHint: "Boş bırakılırsa mevcut değer korunur.",
    secretSet: "tanımlı",
    secretUnset: "yok",
    yes: "Evet",
    no: "Hayır",
    none: "—",
    testOk: "Test başarılı",
    testFail: "Test başarısız",
    saved: "Kaydedildi.",
    statusChanged: "Durum güncellendi.",
    liveSecurityNote:
      "Canlı (LIVE) modda gerçek sağlayıcılar bu fazda işlem yapmaz; eksik credential ile ödeme başlatılmaz.",
  },
  en: {
    eyebrow: "Sales",
    title: "Payment Providers",
    description:
      "Manage provider configurations. This phase does not take live payments; it is the operations layer that a live adapter can plug into after a real provider contract. The MOCK provider runs the test payment flow.",
    add: "New provider",
    empty: "No payment providers yet",
    emptyDesc: "Add a MOCK (TEST) provider to try the test payment flow.",
    colName: "Provider",
    colStatus: "Status",
    colMode: "Mode",
    colPriority: "Priority",
    colMethods: "Methods",
    colCurrencies: "Currencies",
    colAmount: "Min/Max",
    col3ds: "3D Secure",
    colInstallment: "Installments",
    colTest: "Last test",
    colActions: "Actions",
    enabled: "Enabled",
    disabled: "Disabled",
    enable: "Enable",
    disable: "Disable",
    edit: "Edit",
    test: "Test connection",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    createTitle: "New payment provider",
    editTitle: "Edit provider",
    fDisplayName: "Display name",
    fProvider: "Provider",
    fMode: "Mode",
    fStatus: "Status",
    fPriority: "Priority (lower = first)",
    fMethods: "Supported payment methods",
    fCurrencies: "Currencies (comma-separated, e.g. TRY,USD)",
    fMinAmount: "Min amount (minor, e.g. 10000 = 100.00)",
    fMaxAmount: "Max amount (minor)",
    f3ds: "3D Secure",
    fInstallment: "Installments enabled",
    fFallback: "Fallback enabled (try next on failure)",
    fMerchantId: "Merchant ID",
    fCallbackUrl: "Callback URL",
    fApiKey: "API Key",
    fSecretKey: "Secret Key",
    fWebhookSecret: "Webhook Secret",
    secretKeepHint: "Leave blank to keep the current value.",
    secretSet: "set",
    secretUnset: "none",
    yes: "Yes",
    no: "No",
    none: "—",
    testOk: "Test succeeded",
    testFail: "Test failed",
    saved: "Saved.",
    statusChanged: "Status updated.",
    liveSecurityNote:
      "In LIVE mode, real providers do not process in this phase; payment will not start with missing credentials.",
  },
} satisfies Record<Locale, Record<string, string>>;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; configs: PaymentProviderConfig[] };

interface FormState {
  id: string | null;
  displayName: string;
  provider: (typeof PROVIDERS)[number];
  mode: (typeof MODES)[number];
  status: "ENABLED" | "DISABLED";
  priority: string;
  methods: string[];
  currencies: string;
  minAmount: string;
  maxAmount: string;
  threeDsMode: (typeof THREE_DS)[number];
  installmentEnabled: boolean;
  fallbackEnabled: boolean;
  merchantId: string;
  callbackUrl: string;
  apiKey: string;
  secretKey: string;
  webhookSecret: string;
}

function emptyForm(): FormState {
  return {
    id: null,
    displayName: "",
    provider: "MOCK",
    mode: "TEST",
    status: "DISABLED",
    priority: "100",
    methods: ["CARD"],
    currencies: "TRY",
    minAmount: "",
    maxAmount: "",
    threeDsMode: "DISABLED",
    installmentEnabled: false,
    fallbackEnabled: false,
    merchantId: "",
    callbackUrl: "",
    apiKey: "",
    secretKey: "",
    webhookSecret: "",
  };
}

function formFromConfig(config: PaymentProviderConfig): FormState {
  return {
    id: config.id,
    displayName: config.displayName,
    provider: config.provider,
    mode: config.mode,
    status: config.status,
    priority: String(config.priority),
    methods: config.supportedMethods,
    currencies: config.supportedCurrencies.join(","),
    minAmount: config.minAmount == null ? "" : String(config.minAmount),
    maxAmount: config.maxAmount == null ? "" : String(config.maxAmount),
    threeDsMode: config.threeDsMode,
    installmentEnabled: config.installmentEnabled,
    fallbackEnabled: config.fallbackEnabled,
    merchantId: config.merchantId ?? "",
    callbackUrl: config.callbackUrl ?? "",
    apiKey: "",
    secretKey: "",
    webhookSecret: "",
  };
}

export default function PaymentProvidersPage() {
  const locale = (useLocale() as Locale) ?? "tr";
  const t = L[locale] ?? L.tr;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listPaymentProviders();
      setState({ status: "ready", configs: result.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm());
    setActionError(null);
    setModalOpen(true);
  };

  const openEdit = (config: PaymentProviderConfig) => {
    setForm(formFromConfig(config));
    setActionError(null);
    setModalOpen(true);
  };

  const toggleMethod = (method: string) => {
    setForm((prev) => ({
      ...prev,
      methods: prev.methods.includes(method)
        ? prev.methods.filter((m) => m !== method)
        : [...prev.methods, method],
    }));
  };

  const parseAmount = (value: string): number | null | undefined => {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setActionError(null);
    const currencies = form.currencies
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (form.methods.length === 0 || currencies.length === 0 || !form.displayName.trim()) {
      setActionError(messageForError(new Error("VALIDATION"), locale));
      return;
    }
    const minAmount = parseAmount(form.minAmount);
    const maxAmount = parseAmount(form.maxAmount);

    setSaving(true);
    try {
      if (form.id) {
        const payload: PaymentProviderConfigUpdateRequest = {
          displayName: form.displayName.trim(),
          status: form.status,
          mode: form.mode,
          priority: Number(form.priority) || 0,
          supportedMethods: form.methods as PaymentProviderConfigUpdateRequest["supportedMethods"],
          supportedCurrencies: currencies,
          minAmount: minAmount ?? null,
          maxAmount: maxAmount ?? null,
          threeDsMode: form.threeDsMode,
          installmentEnabled: form.installmentEnabled,
          fallbackEnabled: form.fallbackEnabled,
          merchantId: form.merchantId.trim() || null,
          callbackUrl: form.callbackUrl.trim() || null,
        };
        // Secret semantiği: yalnızca kullanıcı yeni değer girdiyse gönder (boş = koru).
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
        if (form.secretKey.trim()) payload.secretKey = form.secretKey.trim();
        if (form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
        await storeApi.updatePaymentProvider(form.id, payload);
      } else {
        const payload: PaymentProviderConfigCreateRequest = {
          provider: form.provider,
          displayName: form.displayName.trim(),
          status: form.status,
          mode: form.mode,
          priority: Number(form.priority) || 100,
          supportedMethods: form.methods as PaymentProviderConfigCreateRequest["supportedMethods"],
          supportedCurrencies: currencies,
          minAmount: minAmount ?? null,
          maxAmount: maxAmount ?? null,
          threeDsMode: form.threeDsMode,
          installmentEnabled: form.installmentEnabled,
          fallbackEnabled: form.fallbackEnabled,
          merchantId: form.merchantId.trim() || null,
          callbackUrl: form.callbackUrl.trim() || null,
        };
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
        if (form.secretKey.trim()) payload.secretKey = form.secretKey.trim();
        if (form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
        await storeApi.createPaymentProvider(payload);
      }
      setModalOpen(false);
      setNotice(t.saved);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (config: PaymentProviderConfig) => {
    setBusyId(config.id);
    setActionError(null);
    try {
      await storeApi.setPaymentProviderStatus(config.id, {
        status: config.status === "ENABLED" ? "DISABLED" : "ENABLED",
      });
      setNotice(t.statusChanged);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusyId(null);
    }
  };

  const testConnection = async (config: PaymentProviderConfig) => {
    setBusyId(config.id);
    setActionError(null);
    try {
      const result = await storeApi.testPaymentProviderConnection(config.id);
      setNotice(`${result.ok ? t.testOk : t.testFail}: ${result.message}`);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusyId(null);
    }
  };

  const columns: DataTableColumn<PaymentProviderConfig>[] = useMemo(
    () => [
      {
        header: t.colName,
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-white/85">{row.displayName}</span>
            <span className="text-[11px] text-white/35">{row.provider}</span>
          </div>
        ),
      },
      {
        header: t.colStatus,
        cell: (row) => (
          <Badge tone={row.status === "ENABLED" ? "success" : "neutral"} dot>
            {row.status === "ENABLED" ? t.enabled : t.disabled}
          </Badge>
        ),
      },
      {
        header: t.colMode,
        cell: (row) => (
          <Badge tone={row.mode === "LIVE" ? "warning" : "info"}>{row.mode}</Badge>
        ),
      },
      { header: t.colPriority, cell: (row) => <span className="tabular-nums">{row.priority}</span> },
      {
        header: t.colMethods,
        cell: (row) => <span className="text-[11px] text-white/50">{row.supportedMethods.join(", ")}</span>,
      },
      {
        header: t.colCurrencies,
        cell: (row) => <span className="text-[11px] text-white/50">{row.supportedCurrencies.join(", ")}</span>,
      },
      {
        header: t.colAmount,
        cell: (row) => {
          const cur = row.supportedCurrencies[0] ?? "TRY";
          const min = row.minAmount == null ? t.none : formatMinor(row.minAmount, cur);
          const max = row.maxAmount == null ? t.none : formatMinor(row.maxAmount, cur);
          return <span className="text-[11px] text-white/50">{`${min} / ${max}`}</span>;
        },
      },
      { header: t.col3ds, cell: (row) => <span className="text-[11px] text-white/50">{row.threeDsMode}</span> },
      {
        header: t.colInstallment,
        cell: (row) => <span className="text-[11px] text-white/50">{row.installmentEnabled ? t.yes : t.no}</span>,
      },
      {
        header: t.colTest,
        cell: (row) =>
          row.lastTestAt ? (
            <div className="flex flex-col">
              <Badge tone={row.lastTestStatus === "OK" ? "success" : "danger"}>
                {row.lastTestStatus ?? t.none}
              </Badge>
              <span className="mt-0.5 text-[10px] text-white/30">{formatDate(row.lastTestAt)}</span>
            </div>
          ) : (
            <span className="text-[11px] text-white/30">{t.none}</span>
          ),
      },
      {
        header: t.colActions,
        align: "right",
        cell: (row) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => openEdit(row)} disabled={busyId === row.id}>
              {t.edit}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => testConnection(row)} disabled={busyId === row.id}>
              {t.test}
            </Button>
            <Button
              size="sm"
              variant={row.status === "ENABLED" ? "danger" : "primary"}
              onClick={() => toggleStatus(row)}
              disabled={busyId === row.id}
            >
              {row.status === "ENABLED" ? t.disable : t.enable}
            </Button>
          </div>
        ),
      },
    ],
    [t, busyId],
  );

  return (
    <div>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <Button onClick={openCreate} disabled={state.status === "loading"}>
            {t.add}
          </Button>
        }
      />

      {notice ? (
        <Alert tone="success" className="mb-4" action={<Button size="sm" variant="ghost" onClick={() => setNotice(null)}>{t.close}</Button>}>
          {notice}
        </Alert>
      ) : null}
      {actionError ? (
        <Alert tone="error" className="mb-4">
          {actionError}
        </Alert>
      ) : null}

      {state.status === "loading" ? (
        <SkeletonRows rows={4} />
      ) : state.status === "error" ? (
        <Alert tone="error">{state.message}</Alert>
      ) : state.configs.length === 0 ? (
        <EmptyState
          icon={<PaymentIcon />}
          title={t.empty}
          description={t.emptyDesc}
          action={<Button onClick={openCreate}>{t.add}</Button>}
        />
      ) : (
        <DataTable columns={columns} rows={state.configs} rowKey={(row) => row.id} />
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? t.editTitle : t.createTitle}
        closeLabel={t.close}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              {t.cancel}
            </Button>
            <Button type="submit" form="payment-provider-form" disabled={saving}>
              {t.save}
            </Button>
          </>
        }
      >
        <form id="payment-provider-form" onSubmit={submit} className="space-y-4">
          {actionError ? <Alert tone="error">{actionError}</Alert> : null}
          <Input
            label={t.fDisplayName}
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t.fProvider}
              value={form.provider}
              disabled={Boolean(form.id)}
              onChange={(e) => setForm({ ...form, provider: e.target.value as FormState["provider"] })}
              options={PROVIDERS.map((p) => ({ value: p, label: p }))}
            />
            <Select
              label={t.fMode}
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as FormState["mode"] })}
              options={MODES.map((m) => ({ value: m, label: m }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t.fStatus}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as FormState["status"] })}
              options={[
                { value: "DISABLED", label: t.disabled },
                { value: "ENABLED", label: t.enabled },
              ]}
            />
            <Input
              label={t.fPriority}
              type="number"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-white/35">
              {t.fMethods}
            </span>
            <div className="flex flex-wrap gap-3">
              {METHODS.map((method) => (
                <label key={method} className="flex items-center gap-2 text-[12px] text-white/70">
                  <input
                    type="checkbox"
                    checked={form.methods.includes(method)}
                    onChange={() => toggleMethod(method)}
                  />
                  {method}
                </label>
              ))}
            </div>
          </div>

          <Input
            label={t.fCurrencies}
            value={form.currencies}
            onChange={(e) => setForm({ ...form, currencies: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t.fMinAmount}
              type="number"
              value={form.minAmount}
              onChange={(e) => setForm({ ...form, minAmount: e.target.value })}
            />
            <Input
              label={t.fMaxAmount}
              type="number"
              value={form.maxAmount}
              onChange={(e) => setForm({ ...form, maxAmount: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t.f3ds}
              value={form.threeDsMode}
              onChange={(e) => setForm({ ...form, threeDsMode: e.target.value as FormState["threeDsMode"] })}
              options={THREE_DS.map((m) => ({ value: m, label: m }))}
            />
            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-[12px] text-white/70">
                <input
                  type="checkbox"
                  checked={form.installmentEnabled}
                  onChange={(e) => setForm({ ...form, installmentEnabled: e.target.checked })}
                />
                {t.fInstallment}
              </label>
              <label className="flex items-center gap-2 text-[12px] text-white/70">
                <input
                  type="checkbox"
                  checked={form.fallbackEnabled}
                  onChange={(e) => setForm({ ...form, fallbackEnabled: e.target.checked })}
                />
                {t.fFallback}
              </label>
            </div>
          </div>

          <Input
            label={t.fMerchantId}
            value={form.merchantId}
            onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
          />
          <Input
            label={t.fCallbackUrl}
            value={form.callbackUrl}
            onChange={(e) => setForm({ ...form, callbackUrl: e.target.value })}
          />

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] text-white/40">{t.secretKeepHint}</p>
            <div className="space-y-3">
              <Input
                label={t.fApiKey}
                type="password"
                autoComplete="off"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
              <Input
                label={t.fSecretKey}
                type="password"
                autoComplete="off"
                value={form.secretKey}
                onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
              />
              <Input
                label={t.fWebhookSecret}
                type="password"
                autoComplete="off"
                value={form.webhookSecret}
                onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
              />
            </div>
          </div>

          {form.mode === "LIVE" ? <Alert tone="warning">{t.liveSecurityNote}</Alert> : null}
        </form>
      </Modal>
    </div>
  );
}
