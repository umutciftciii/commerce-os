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
  ShippingProviderConfigResponse,
  ShippingProviderConfigCreateRequest,
  ShippingCredentialUpsertRequest,
} from "@commerce-os/api-client";
import { ShippingIcon } from "../../../../components/icons";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate } from "../../../../lib/client/format";

type Locale = "tr" | "en";

const PROVIDERS = ["MOCK", "GELIVER", "DHL_ECOMMERCE"] as const;
const MODES = ["TEST", "LIVE"] as const;

/** Provider'a göre kullanıcıya gösterilecek ad ("DHL eCommerce"; MNG yazılmaz). */
const PROVIDER_LABEL: Record<(typeof PROVIDERS)[number], string> = {
  MOCK: "MOCK",
  GELIVER: "Geliver",
  DHL_ECOMMERCE: "DHL eCommerce",
};

type DhlCredType =
  | "IDENTITY"
  | "STANDARD_COMMAND"
  | "STANDARD_QUERY"
  | "BARCODE_COMMAND"
  | "CBS_INFO"
  | "BULK_QUERY"
  | "FINANCE_QUERY";

const DHL_REQUIRED: DhlCredType[] = ["IDENTITY", "STANDARD_COMMAND", "STANDARD_QUERY", "BARCODE_COMMAND"];
const DHL_OPTIONAL: DhlCredType[] = ["CBS_INFO", "BULK_QUERY", "FINANCE_QUERY"];

/**
 * F3C.1 (Faz B) — Kargo Sağlayıcıları yönetim sayfası. Secret alanlar gateway
 * tarafında maskeli döner; bu sayfa secret'ı asla düz görmez. "Boş bırakılırsa
 * korunur" semantiği: secret input'u boşsa istek gövdesine eklenmez. Canlı
 * gönderi/barkod/etiket oluşturma bu fazda kapalıdır (net uyarı gösterilir).
 */
const L = {
  tr: {
    eyebrow: "Satış",
    title: "Kargo Sağlayıcıları",
    description:
      "Mağaza bazlı kargo sağlayıcı yapılandırmaları. Bu faz admin kontrollü operasyon altyapısıdır; checkout'ta otomatik kargo ve canlı gönderi/barkod oluşturma kapalıdır. MOCK sağlayıcı test akışını çalıştırır.",
    add: "Yeni sağlayıcı",
    empty: "Henüz kargo sağlayıcı yok",
    emptyDesc: "Test akışını denemek için bir MOCK (TEST) sağlayıcı ekleyin ya da Geliver / DHL eCommerce yapılandırın.",
    colName: "Sağlayıcı",
    colStatus: "Durum",
    colMode: "Mod",
    colCreds: "Kimlik bilgileri",
    colGuards: "Canlı işlem",
    colTest: "Son test",
    colActions: "İşlemler",
    enabled: "Aktif",
    disabled: "Pasif",
    enable: "Aktifleştir",
    disable: "Pasifleştir",
    credentials: "Kimlik bilgileri",
    test: "Bağlantıyı test et",
    edit: "Düzenle",
    save: "Kaydet",
    clear: "Temizle",
    cancel: "Vazgeç",
    close: "Kapat",
    createTitle: "Yeni kargo sağlayıcı",
    editTitle: "Sağlayıcıyı düzenle",
    credTitle: "Kimlik bilgileri",
    fDisplayName: "Görünen ad",
    fProvider: "Sağlayıcı",
    fMode: "Mod",
    fStatus: "Durum",
    configured: "tanımlı",
    notConfigured: "eksik",
    none: "—",
    required: "Zorunlu",
    optional: "Opsiyonel",
    secretKeepHint: "Boş bırakılırsa mevcut değer korunur. Kaydedilen secret değerleri tekrar düz gösterilmez.",
    fKey: "X-IBM Client Id",
    fSecret: "X-IBM Client Secret",
    fGeliverKey: "Geliver API Anahtarı",
    fCustomerNumber: "DHL Müşteri Numarası",
    fCustomerPassword: "DHL Müşteri Şifresi",
    fIdentityType: "identityType (varsayılan 1)",
    mockNote: "MOCK sağlayıcı kimlik bilgisi gerektirmez; test akışı için hazırdır.",
    allowOrderCreate: "Canlı sipariş oluşturmaya izin ver",
    allowBarcodeCreate: "Canlı barkod oluşturmaya izin ver",
    allowLabelPurchase: "Etiket satın almaya izin ver",
    guardWarn:
      "Bu izinler açık olsa bile, canlı işlem yalnızca sunucu ortam bayrağı + istek onayı birlikte sağlanınca çalışır. Aksi halde 409 ile reddedilir.",
    liveOffNote: "Canlı gönderi/barkod oluşturma kapalı.",
    labelOffNote: "Canlı etiket satın alma kapalı.",
    saved: "Kimlik bilgileri kaydedildi.",
    cleared: "Kimlik bilgisi temizlendi.",
    configSaved: "Kaydedildi.",
    statusChanged: "Durum güncellendi.",
    testOk: "Bağlantı testi başarılı",
    testFail: "Bağlantı testi başarısız",
    testHttpDisabled: "Kimlik bilgileri kayıtlı; gerçek API çağrısı yapılmadı.",
    dhlRequiredHeading: "Zorunlu kimlik bilgileri",
    dhlOptionalHeading: "Opsiyonel kimlik bilgileri",
    colConn: "Son gerçek API testi",
    connOK: "Doğrulandı",
    connFailed: "Başarısız",
    connHttpDisabled: "Test edilmedi (HTTP kapalı)",
    connUntested: "Henüz test edilmedi",
    connSkipped: "Atlandı",
    credConfigured: "Tam",
    credIncomplete: "Eksik",
    credMissing: "Yok",
  },
  en: {
    eyebrow: "Sales",
    title: "Shipping Providers",
    description:
      "Store-scoped shipping provider configurations. This phase is an admin-controlled operations layer; automatic shipping at checkout and live order/label creation are disabled. The MOCK provider runs the test flow.",
    add: "New provider",
    empty: "No shipping providers yet",
    emptyDesc: "Add a MOCK (TEST) provider to try the flow, or configure Geliver / DHL eCommerce.",
    colName: "Provider",
    colStatus: "Status",
    colMode: "Mode",
    colCreds: "Credentials",
    colGuards: "Live ops",
    colTest: "Last test",
    colActions: "Actions",
    enabled: "Enabled",
    disabled: "Disabled",
    enable: "Enable",
    disable: "Disable",
    credentials: "Credentials",
    test: "Test connection",
    edit: "Edit",
    save: "Save",
    clear: "Clear",
    cancel: "Cancel",
    close: "Close",
    createTitle: "New shipping provider",
    editTitle: "Edit provider",
    credTitle: "Credentials",
    fDisplayName: "Display name",
    fProvider: "Provider",
    fMode: "Mode",
    fStatus: "Status",
    configured: "set",
    notConfigured: "missing",
    none: "—",
    required: "Required",
    optional: "Optional",
    secretKeepHint: "Leave blank to keep the current value. Saved secrets are never shown in plaintext again.",
    fKey: "X-IBM Client Id",
    fSecret: "X-IBM Client Secret",
    fGeliverKey: "Geliver API Key",
    fCustomerNumber: "DHL Customer Number",
    fCustomerPassword: "DHL Customer Password",
    fIdentityType: "identityType (default 1)",
    mockNote: "The MOCK provider requires no credentials; it is ready for the test flow.",
    allowOrderCreate: "Allow live order creation",
    allowBarcodeCreate: "Allow live barcode creation",
    allowLabelPurchase: "Allow label purchase",
    guardWarn:
      "Even with these enabled, live operations run only when the server environment flag + request confirmation are both provided. Otherwise rejected with 409.",
    liveOffNote: "Live order/barcode creation is disabled.",
    labelOffNote: "Live label purchase is disabled.",
    saved: "Credentials saved.",
    cleared: "Credential cleared.",
    configSaved: "Saved.",
    statusChanged: "Status updated.",
    testOk: "Connection test succeeded",
    testFail: "Connection test failed",
    testHttpDisabled: "Credentials are stored; no real API call was made.",
    dhlRequiredHeading: "Required credentials",
    dhlOptionalHeading: "Optional credentials",
    colConn: "Last real API test",
    connOK: "Verified",
    connFailed: "Failed",
    connHttpDisabled: "Not tested (HTTP off)",
    connUntested: "Not tested yet",
    connSkipped: "Skipped",
    credConfigured: "Complete",
    credIncomplete: "Incomplete",
    credMissing: "Missing",
  },
} satisfies Record<Locale, Record<string, string>>;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; configs: ShippingProviderConfigResponse[] };

interface CreateForm {
  provider: (typeof PROVIDERS)[number];
  displayName: string;
  mode: (typeof MODES)[number];
}

interface EditForm {
  id: string;
  displayName: string;
  mode: (typeof MODES)[number];
  status: "ENABLED" | "DISABLED";
  allowOrderCreate: boolean;
  allowBarcodeCreate: boolean;
  allowLabelPurchase: boolean;
}

/** Tek bir credential tipi için input alanları (boş = koru). */
interface CredInput {
  key: string;
  secret: string;
  customerNumber: string;
  customerPassword: string;
  identityType: string;
}

function emptyCred(): CredInput {
  return { key: "", secret: "", customerNumber: "", customerPassword: "", identityType: "1" };
}

export default function ShippingProvidersPage() {
  const locale = (useLocale() as Locale) ?? "tr";
  const t = L[locale] ?? L.tr;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ provider: "MOCK", displayName: "", mode: "TEST" });
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [credConfig, setCredConfig] = useState<ShippingProviderConfigResponse | null>(null);
  const [credInputs, setCredInputs] = useState<Record<string, CredInput>>({});

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listShippingProviders();
      setState({ status: "ready", configs: result.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setCreateForm({ provider: "MOCK", displayName: "", mode: "TEST" });
    setActionError(null);
    setCreateOpen(true);
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setActionError(null);
    if (!createForm.displayName.trim()) {
      setActionError(messageForError(new Error("VALIDATION"), locale));
      return;
    }
    setSaving(true);
    try {
      const payload: ShippingProviderConfigCreateRequest = {
        provider: createForm.provider,
        displayName: createForm.displayName.trim(),
        mode: createForm.mode,
        status: "DISABLED",
        allowOrderCreate: false,
        allowBarcodeCreate: false,
        allowLabelPurchase: false,
      };
      await storeApi.createShippingProvider(payload);
      setCreateOpen(false);
      setNotice(t.configSaved);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (config: ShippingProviderConfigResponse) => {
    setEditForm({
      id: config.id,
      displayName: config.displayName,
      mode: config.mode,
      status: config.status,
      allowOrderCreate: config.allowOrderCreate,
      allowBarcodeCreate: config.allowBarcodeCreate,
      allowLabelPurchase: config.allowLabelPurchase,
    });
    setActionError(null);
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editForm) return;
    setActionError(null);
    setSaving(true);
    try {
      await storeApi.updateShippingProvider(editForm.id, {
        displayName: editForm.displayName.trim(),
        mode: editForm.mode,
        status: editForm.status,
        allowOrderCreate: editForm.allowOrderCreate,
        allowBarcodeCreate: editForm.allowBarcodeCreate,
        allowLabelPurchase: editForm.allowLabelPurchase,
      });
      setEditForm(null);
      setNotice(t.configSaved);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setSaving(false);
    }
  };

  const openCredentials = (config: ShippingProviderConfigResponse) => {
    setCredConfig(config);
    setCredInputs({});
    setActionError(null);
  };

  const credInputFor = (type: string): CredInput => credInputs[type] ?? emptyCred();
  const setCredInputFor = (type: string, patch: Partial<CredInput>) =>
    setCredInputs((prev) => ({ ...prev, [type]: { ...credInputFor(type), ...patch } }));

  const saveCredential = async (type: string, withCustomer: boolean, isGeliver: boolean) => {
    if (!credConfig) return;
    setBusyId(`${credConfig.id}:${type}`);
    setActionError(null);
    const input = credInputFor(type);
    const payload: ShippingCredentialUpsertRequest = { type: type as ShippingCredentialUpsertRequest["type"] };
    if (input.key.trim()) payload.key = input.key.trim();
    if (!isGeliver && input.secret.trim()) payload.secret = input.secret.trim();
    if (withCustomer) {
      if (input.customerNumber.trim()) payload.customerNumber = input.customerNumber.trim();
      if (input.customerPassword.trim()) payload.customerPassword = input.customerPassword.trim();
      const it = Number(input.identityType);
      if (Number.isFinite(it) && it > 0) payload.identityType = it;
    }
    try {
      const updated = await storeApi.upsertShippingCredential(credConfig.id, payload);
      setCredConfig(updated);
      setCredInputs((prev) => ({ ...prev, [type]: emptyCred() }));
      setNotice(t.saved);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusyId(null);
    }
  };

  const clearCredential = async (type: string) => {
    if (!credConfig) return;
    setBusyId(`${credConfig.id}:${type}`);
    setActionError(null);
    try {
      const updated = await storeApi.deleteShippingCredential(credConfig.id, type);
      setCredConfig(updated);
      setNotice(t.cleared);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (config: ShippingProviderConfigResponse) => {
    setBusyId(config.id);
    setActionError(null);
    try {
      await storeApi.updateShippingProvider(config.id, {
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

  const testConnection = async (config: ShippingProviderConfigResponse) => {
    setBusyId(config.id);
    setActionError(null);
    try {
      const result = await storeApi.testShippingProvider(config.id);
      // OK yalniz gercek HTTP basariliysa. HTTP_DISABLED => "gercek cagri yapilmadi".
      const headline =
        result.status === "OK"
          ? t.testOk
          : result.status === "HTTP_DISABLED"
            ? t.testHttpDisabled
            : t.testFail;
      setNotice(`${headline}: ${result.message}`);
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusyId(null);
    }
  };

  const credentialSummary = (config: ShippingProviderConfigResponse): string => {
    if (config.provider === "MOCK") return t.none;
    const setCount = config.credentials.filter((c) => c.configured).length;
    return `${setCount}`;
  };

  const columns: DataTableColumn<ShippingProviderConfigResponse>[] = useMemo(
    () => [
      {
        header: t.colName,
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-white/85">{row.displayName}</span>
            <span className="text-[11px] text-white/35">{PROVIDER_LABEL[row.provider]}</span>
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
      { header: t.colMode, cell: (row) => <Badge tone={row.mode === "LIVE" ? "warning" : "info"}>{row.mode}</Badge> },
      {
        header: t.colCreds,
        cell: (row) => {
          if (row.provider === "MOCK") return <span className="text-[11px] text-white/40">{t.none}</span>;
          const cs = row.credentialStatus ?? "MISSING";
          const tone = cs === "CONFIGURED" ? "success" : cs === "INCOMPLETE" ? "warning" : "neutral";
          const label = cs === "CONFIGURED" ? t.credConfigured : cs === "INCOMPLETE" ? t.credIncomplete : t.credMissing;
          return (
            <div className="flex items-center gap-1.5">
              <Badge tone={tone}>{label}</Badge>
              <span className="text-[10px] text-white/30">{credentialSummary(row)}</span>
            </div>
          );
        },
      },
      {
        header: t.colGuards,
        cell: (row) => (
          <span className="text-[11px] text-white/40">
            {row.allowOrderCreate || row.allowBarcodeCreate || row.allowLabelPurchase ? (
              <Badge tone="warning">on</Badge>
            ) : (
              <Badge tone="neutral">off</Badge>
            )}
          </span>
        ),
      },
      {
        header: t.colConn,
        cell: (row) => {
          const conn = row.connectionStatus ?? "UNTESTED";
          const tone = conn === "OK" ? "success" : conn === "FAILED" ? "danger" : "neutral";
          const label =
            conn === "OK"
              ? t.connOK
              : conn === "FAILED"
                ? t.connFailed
                : conn === "HTTP_DISABLED"
                  ? t.connHttpDisabled
                  : conn === "SKIPPED"
                    ? t.connSkipped
                    : t.connUntested;
          return (
            <div className="flex flex-col gap-0.5">
              <Badge tone={tone}>{label}</Badge>
              {conn === "HTTP_DISABLED" ? (
                <span className="text-[10px] text-white/30">{t.testHttpDisabled}</span>
              ) : null}
              {row.lastProviderTestAt ? (
                <span className="text-[10px] text-white/30">
                  {formatDate(row.lastProviderTestAt)}
                  {row.lastProviderTestType ? ` · ${row.lastProviderTestType}` : ""}
                  {typeof row.lastProviderHttpStatus === "number" ? ` · HTTP ${row.lastProviderHttpStatus}` : ""}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        header: t.colActions,
        align: "right",
        cell: (row) => (
          <div className="flex items-center justify-end gap-1.5">
            {row.provider !== "MOCK" ? (
              <Button size="sm" variant="ghost" onClick={() => openCredentials(row)} disabled={busyId === row.id}>
                {t.credentials}
              </Button>
            ) : null}
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
      {actionError ? <Alert tone="error" className="mb-4">{actionError}</Alert> : null}

      {state.status === "loading" ? (
        <SkeletonRows rows={3} />
      ) : state.status === "error" ? (
        <Alert tone="error">{state.message}</Alert>
      ) : state.configs.length === 0 ? (
        <EmptyState icon={<ShippingIcon />} title={t.empty} description={t.emptyDesc} action={<Button onClick={openCreate}>{t.add}</Button>} />
      ) : (
        <DataTable columns={columns} rows={state.configs} rowKey={(row) => row.id} />
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t.createTitle}
        closeLabel={t.close}
        className="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>{t.cancel}</Button>
            <Button type="submit" form="shipping-create-form" disabled={saving}>{t.save}</Button>
          </>
        }
      >
        <form id="shipping-create-form" onSubmit={submitCreate} className="space-y-4">
          {actionError ? <Alert tone="error">{actionError}</Alert> : null}
          <Select
            label={t.fProvider}
            value={createForm.provider}
            onChange={(e) => setCreateForm({ ...createForm, provider: e.target.value as CreateForm["provider"] })}
            options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))}
          />
          <Input label={t.fDisplayName} value={createForm.displayName} onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })} required />
          <Select
            label={t.fMode}
            value={createForm.mode}
            onChange={(e) => setCreateForm({ ...createForm, mode: e.target.value as CreateForm["mode"] })}
            options={MODES.map((m) => ({ value: m, label: m }))}
          />
          {createForm.provider === "MOCK" ? <Alert tone="info">{t.mockNote}</Alert> : null}
        </form>
      </Modal>

      {/* Edit modal (status/mode/allow*) */}
      <Modal
        open={editForm !== null}
        onClose={() => setEditForm(null)}
        title={t.editTitle}
        closeLabel={t.close}
        className="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditForm(null)} disabled={saving}>{t.cancel}</Button>
            <Button type="submit" form="shipping-edit-form" disabled={saving}>{t.save}</Button>
          </>
        }
      >
        {editForm ? (
          <form id="shipping-edit-form" onSubmit={submitEdit} className="space-y-4">
            {actionError ? <Alert tone="error">{actionError}</Alert> : null}
            <Input label={t.fDisplayName} value={editForm.displayName} onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })} required />
            <div className="grid grid-cols-2 gap-3">
              <Select label={t.fMode} value={editForm.mode} onChange={(e) => setEditForm({ ...editForm, mode: e.target.value as EditForm["mode"] })} options={MODES.map((m) => ({ value: m, label: m }))} />
              <Select label={t.fStatus} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as EditForm["status"] })} options={[{ value: "DISABLED", label: t.disabled }, { value: "ENABLED", label: t.enabled }]} />
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[12px] text-white/75">
                  <input type="checkbox" checked={editForm.allowOrderCreate} onChange={(e) => setEditForm({ ...editForm, allowOrderCreate: e.target.checked })} />
                  {t.allowOrderCreate}
                </label>
                <label className="flex items-center gap-2 text-[12px] text-white/75">
                  <input type="checkbox" checked={editForm.allowBarcodeCreate} onChange={(e) => setEditForm({ ...editForm, allowBarcodeCreate: e.target.checked })} />
                  {t.allowBarcodeCreate}
                </label>
                <label className="flex items-center gap-2 text-[12px] text-white/75">
                  <input type="checkbox" checked={editForm.allowLabelPurchase} onChange={(e) => setEditForm({ ...editForm, allowLabelPurchase: e.target.checked })} />
                  {t.allowLabelPurchase}
                </label>
              </div>
              <p className="mt-2 text-[11px] text-amber-200/70">{t.guardWarn}</p>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Credentials modal */}
      <Modal
        open={credConfig !== null}
        onClose={() => setCredConfig(null)}
        title={`${t.credTitle} — ${credConfig ? PROVIDER_LABEL[credConfig.provider] : ""}`}
        closeLabel={t.close}
        className="max-w-2xl"
        footer={<Button variant="secondary" onClick={() => setCredConfig(null)}>{t.close}</Button>}
      >
        {credConfig ? (
          <div className="space-y-4">
            {actionError ? <Alert tone="error">{actionError}</Alert> : null}
            <p className="text-[11px] text-white/40">{t.secretKeepHint}</p>

            {credConfig.provider === "GELIVER" ? (
              <>
                <Alert tone="info">{t.labelOffNote}</Alert>
                <CredentialSection
                  type="DEFAULT"
                  heading="Geliver"
                  badge={t.required}
                  config={credConfig}
                  t={t}
                  input={credInputFor("DEFAULT")}
                  busy={busyId === `${credConfig.id}:DEFAULT`}
                  isGeliver
                  withCustomer={false}
                  onChange={(patch) => setCredInputFor("DEFAULT", patch)}
                  onSave={() => saveCredential("DEFAULT", false, true)}
                  onClear={() => clearCredential("DEFAULT")}
                />
              </>
            ) : (
              <>
                <Alert tone="info">{t.liveOffNote}</Alert>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{t.dhlRequiredHeading}</p>
                {DHL_REQUIRED.map((type) => (
                  <CredentialSection
                    key={type}
                    type={type}
                    heading={dhlHeading(type)}
                    badge={t.required}
                    config={credConfig}
                    t={t}
                    input={credInputFor(type)}
                    busy={busyId === `${credConfig.id}:${type}`}
                    isGeliver={false}
                    withCustomer={type === "IDENTITY"}
                    onChange={(patch) => setCredInputFor(type, patch)}
                    onSave={() => saveCredential(type, type === "IDENTITY", false)}
                    onClear={() => clearCredential(type)}
                  />
                ))}
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{t.dhlOptionalHeading}</p>
                {DHL_OPTIONAL.map((type) => (
                  <CredentialSection
                    key={type}
                    type={type}
                    heading={dhlHeading(type)}
                    badge={t.optional}
                    config={credConfig}
                    t={t}
                    input={credInputFor(type)}
                    busy={busyId === `${credConfig.id}:${type}`}
                    isGeliver={false}
                    withCustomer={false}
                    onChange={(patch) => setCredInputFor(type, patch)}
                    onSave={() => saveCredential(type, false, false)}
                    onClear={() => clearCredential(type)}
                  />
                ))}
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function dhlHeading(type: DhlCredType): string {
  switch (type) {
    case "IDENTITY":
      return "Identity";
    case "STANDARD_COMMAND":
      return "Standard Command";
    case "STANDARD_QUERY":
      return "Standard Query";
    case "BARCODE_COMMAND":
      return "Barcode Command";
    case "CBS_INFO":
      return "CBS Info";
    case "BULK_QUERY":
      return "Bulk Query";
    case "FINANCE_QUERY":
      return "Finance Query";
  }
}

interface CredentialSectionProps {
  type: string;
  heading: string;
  badge: string;
  config: ShippingProviderConfigResponse;
  t: (typeof L)["tr"];
  input: CredInput;
  busy: boolean;
  isGeliver: boolean;
  withCustomer: boolean;
  onChange: (patch: Partial<CredInput>) => void;
  onSave: () => void;
  onClear: () => void;
}

/** Tek credential tipi bölümü: configured durumu + maskedKey + inputlar + save/clear. */
function CredentialSection(props: CredentialSectionProps) {
  const { type, heading, badge, config, t, input, busy, isGeliver, withCustomer, onChange, onSave, onClear } = props;
  const existing = config.credentials.find((c) => c.type === type);
  const configured = existing?.configured ?? false;
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-white/80">{heading}</span>
          <Badge tone="neutral">{badge}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={configured ? "success" : "neutral"} dot>
            {configured ? t.configured : t.notConfigured}
          </Badge>
          {existing?.maskedKey ? <span className="font-mono text-[11px] text-white/40">{existing.maskedKey}</span> : null}
        </div>
      </div>
      <div className="space-y-2.5">
        <Input
          label={isGeliver ? t.fGeliverKey : t.fKey}
          type="password"
          autoComplete="off"
          value={input.key}
          onChange={(e) => onChange({ key: e.target.value })}
        />
        {!isGeliver ? (
          <Input label={t.fSecret} type="password" autoComplete="off" value={input.secret} onChange={(e) => onChange({ secret: e.target.value })} />
        ) : null}
        {withCustomer ? (
          <>
            <Input label={t.fCustomerNumber} type="password" autoComplete="off" value={input.customerNumber} onChange={(e) => onChange({ customerNumber: e.target.value })} />
            <Input label={t.fCustomerPassword} type="password" autoComplete="off" value={input.customerPassword} onChange={(e) => onChange({ customerPassword: e.target.value })} />
            <Input label={t.fIdentityType} type="number" value={input.identityType} onChange={(e) => onChange({ identityType: e.target.value })} />
          </>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {configured ? (
          <Button size="sm" variant="danger" onClick={onClear} disabled={busy}>{t.clear}</Button>
        ) : null}
        <Button size="sm" onClick={onSave} disabled={busy}>{t.save}</Button>
      </div>
    </div>
  );
}
