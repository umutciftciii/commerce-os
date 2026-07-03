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
  ShippingWebhookInfoResponse,
  ShippingWebhookEvent,
} from "@commerce-os/api-client";
import { ShippingIcon } from "../../../../components/icons";
import { ProviderLogo } from "../../../../components/provider-logo";
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
  | "PLUS_COMMAND"
  | "STANDARD_COMMAND"
  | "STANDARD_QUERY"
  | "BARCODE_COMMAND"
  | "CBS_INFO"
  | "BULK_QUERY"
  | "FINANCE_QUERY";

const DHL_REQUIRED: DhlCredType[] = ["IDENTITY", "STANDARD_COMMAND", "STANDARD_QUERY", "BARCODE_COMMAND"];
// Plus Command opsiyoneldir: paketleme öncesi createRecipient (varış şube tespiti) için.
const DHL_OPTIONAL: DhlCredType[] = ["PLUS_COMMAND", "CBS_INFO", "BULK_QUERY", "FINANCE_QUERY"];

/**
 * F3C.1 (Faz B) — Kargo Sağlayıcıları yönetim sayfası. Secret alanlar gateway
 * tarafında maskeli döner; bu sayfa secret'ı asla düz görmez. "Boş bırakılırsa
 * korunur" semantiği: secret input'u boşsa istek gövdesine eklenmez. Sağlayıcı
 * operasyonu (gönderi/barkod/etiket) güvenlik kilidiyle kapalıdır (net uyarı gösterilir).
 */
const L = {
  tr: {
    eyebrow: "Satış",
    title: "Kargo Sağlayıcıları",
    description:
      "Mağaza bazlı kargo sağlayıcı yapılandırmaları. Bu faz admin kontrollü operasyon altyapısıdır; checkout'ta otomatik kargo ve sağlayıcı gönderi/barkod oluşturma güvenlik kilidiyle kapalıdır. MOCK sağlayıcı test akışını çalıştırır.",
    add: "Yeni sağlayıcı",
    empty: "Henüz kargo sağlayıcı yok",
    emptyDesc: "Test akışını denemek için bir MOCK (TEST) sağlayıcı ekleyin ya da Geliver / DHL eCommerce yapılandırın.",
    colName: "Sağlayıcı",
    colStatus: "Durum",
    colMode: "Mod",
    colCreds: "Kimlik bilgileri",
    colGuards: "İşlem izinleri",
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
    fLogoUrl: "Logo URL (opsiyonel, public)",
    fLogoAlt: "Logo alt metni (opsiyonel)",
    logoPreview: "Önizleme",
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
    allowRecipientCreate: "Alıcı (Plus Command) oluşturmaya izin ver",
    allowOrderCreate: "Gönderi kaydı oluşturmaya izin ver",
    allowBarcodeCreate: "Barkod/etiket oluşturmaya izin ver",
    allowLabelPurchase: "Etiket satın almaya izin ver",
    guardWarn:
      "Bu izinler açık olsa bile, sağlayıcı işlemi yalnızca sunucu güvenlik kilidi (sandbox HTTP) + istek onayı birlikte sağlanınca çalışır. Bu kilit canlı/test ayrımından bağımsızdır; aksi halde 409 ile reddedilir.",
    liveOffNote: "Gönderi/barkod oluşturma izni kapalı.",
    labelOffNote: "Etiket satın alma izni kapalı.",
    saved: "Kimlik bilgileri kaydedildi.",
    cleared: "Kimlik bilgisi temizlendi.",
    configSaved: "Kaydedildi.",
    statusChanged: "Durum güncellendi.",
    testOk: "Bağlantı testi başarılı",
    testFail: "Bağlantı testi başarısız",
    testHttpDisabled: "Kimlik bilgileri kayıtlı; gerçek API çağrısı yapılmadı.",
    dhlRequiredHeading: "Zorunlu kimlik bilgileri",
    dhlOptionalHeading: "Opsiyonel kimlik bilgileri",
    dhlInfo: [
      "API Zone (Client ID/Secret): https://apizone.mngkargo.com.tr/tr/",
      "Sandbox portal (test uygulama/API ürünleri): https://sandbox.mngkargo.com.tr/",
      "Online Şube (Müşteri No/Şifre): https://onlinesube.dhlecommerce.com.tr/Misafir/YeniUyelik",
      "Test API base URL: https://testapi.mngkargo.com.tr",
      "Kayıtlı callback URL: https://api.cmddigital.com/integrations/mng/oauth/callback",
      "Plus Command / createRecipient: paketleme öncesi varış şube tespiti (önerilir).",
      "Standard Command / createOrder: sipariş aktarımı. Barcode Command / createbarcode: ZPL/takip/barkod.",
      "createRecipient/createOrder/createbarcode/cancelshipment güvenlik kilidiyle varsayılan KAPALIDIR.",
      "Her mağaza kendi DHL kimlik bilgilerini girmelidir.",
    ].join("\n"),
    colConn: "Son gerçek API testi",
    connOK: "Doğrulandı",
    connFailed: "Başarısız",
    connHttpDisabled: "Test edilmedi (HTTP kapalı)",
    connUntested: "Henüz test edilmedi",
    connSkipped: "Atlandı",
    credConfigured: "Tam",
    credIncomplete: "Eksik",
    credMissing: "Yok",
    // TODO-128 — Webhook yönetim/gözlem.
    webhook: "Webhook",
    webhookTitle: "Webhook Yönetimi",
    webhookUrl: "Webhook URL",
    webhookCopyUrl: "URL'yi Kopyala",
    webhookCopied: "Panoya kopyalandı.",
    webhookConfigured: "Yapılandırılmış",
    webhookNotConfigured: "Yapılandırılmamış",
    webhookNoBaseUrl: "Public base URL ayarlanmadığı için webhook URL oluşturulamıyor.",
    webhookNotRotatedYet: "Webhook secret'ı henüz oluşturulmadı. URL ve secret üretmek için “Secret'ı Yenile”yi kullanın.",
    webhookRotate: "Secret'ı Yenile",
    webhookRotateConfirm: "Mevcut webhook secret ve token anında geçersiz olacak; sağlayıcı panelindeki eski değerler çalışmayı durdurur. Devam edilsin mi?",
    webhookNewSecret: "Yeni Secret",
    webhookSecretOnce: "Bu secret yalnızca bir kez gösterilir. Kaydetmeden kapatırsanız tekrar görüntülenemez.",
    webhookCopySecret: "Secret'ı Kopyala",
    webhookSetupHint: "Bu URL ve secret'ı sağlayıcının webhook/callback ayarına girin. Sağlayıcı her isteği secret ile HMAC-SHA256 imzalar; imzasız/yanlış istekler reddedilir.",
    webhookEvents: "Son Webhook Olayları",
    webhookNoEvents: "Henüz webhook olayı yok.",
    webhookColReceived: "Alındı",
    webhookColProvider: "Sağlayıcı",
    webhookColEvent: "Olay",
    webhookColOutcome: "Sonuç",
    webhookColShipment: "Gönderi",
    webhookOutcomeAccepted: "Başarılı",
    webhookOutcomeIgnoredUnknown: "Eşleşmeyen gönderi",
    webhookOutcomeIgnoredUnsupported: "Desteklenmeyen",
    succeeded: "Başarılı",
    failed: "Başarısız",
  },
  en: {
    eyebrow: "Sales",
    title: "Shipping Providers",
    description:
      "Store-scoped shipping provider configurations. This phase is an admin-controlled operations layer; automatic shipping at checkout and provider order/label creation are closed by a security lock. The MOCK provider runs the test flow.",
    add: "New provider",
    empty: "No shipping providers yet",
    emptyDesc: "Add a MOCK (TEST) provider to try the flow, or configure Geliver / DHL eCommerce.",
    colName: "Provider",
    colStatus: "Status",
    colMode: "Mode",
    colCreds: "Credentials",
    colGuards: "Ops permissions",
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
    fLogoUrl: "Logo URL (optional, public)",
    fLogoAlt: "Logo alt text (optional)",
    logoPreview: "Preview",
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
    allowRecipientCreate: "Allow recipient (Plus Command) creation",
    allowOrderCreate: "Allow shipment record creation",
    allowBarcodeCreate: "Allow label/barcode creation",
    allowLabelPurchase: "Allow label purchase",
    guardWarn:
      "Even with these enabled, a provider operation runs only when the server security lock (sandbox HTTP) + request confirmation are both provided. This lock is independent of the live/test distinction; otherwise rejected with 409.",
    liveOffNote: "Shipment/barcode creation permission is disabled.",
    labelOffNote: "Label purchase permission is disabled.",
    saved: "Credentials saved.",
    cleared: "Credential cleared.",
    configSaved: "Saved.",
    statusChanged: "Status updated.",
    testOk: "Connection test succeeded",
    testFail: "Connection test failed",
    testHttpDisabled: "Credentials are stored; no real API call was made.",
    dhlRequiredHeading: "Required credentials",
    dhlOptionalHeading: "Optional credentials",
    dhlInfo: [
      "API Zone (Client ID/Secret): https://apizone.mngkargo.com.tr/tr/",
      "Sandbox portal (test apps/API products): https://sandbox.mngkargo.com.tr/",
      "Online branch (Customer No/Password): https://onlinesube.dhlecommerce.com.tr/Misafir/YeniUyelik",
      "Test API base URL: https://testapi.mngkargo.com.tr",
      "Registered callback URL: https://api.cmddigital.com/integrations/mng/oauth/callback",
      "Plus Command / createRecipient: destination-branch detection before packaging (recommended).",
      "Standard Command / createOrder: order transfer. Barcode Command / createbarcode: ZPL/tracking/barcode.",
      "createRecipient/createOrder/createbarcode/cancelshipment are disabled by default by a security lock.",
      "Each store must enter its own DHL credentials.",
    ].join("\n"),
    colConn: "Last real API test",
    connOK: "Verified",
    connFailed: "Failed",
    connHttpDisabled: "Not tested (HTTP off)",
    connUntested: "Not tested yet",
    connSkipped: "Skipped",
    credConfigured: "Complete",
    credIncomplete: "Incomplete",
    credMissing: "Missing",
    // TODO-128 — Webhook management/observability.
    webhook: "Webhook",
    webhookTitle: "Webhook Management",
    webhookUrl: "Webhook URL",
    webhookCopyUrl: "Copy URL",
    webhookCopied: "Copied to clipboard.",
    webhookConfigured: "Configured",
    webhookNotConfigured: "Not configured",
    webhookNoBaseUrl: "Webhook URL cannot be generated because public base URL is not configured.",
    webhookNotRotatedYet: "No webhook secret yet. Use “Rotate Secret” to generate the URL and secret.",
    webhookRotate: "Rotate Secret",
    webhookRotateConfirm: "The current webhook secret and token will be invalidated immediately; old values in the provider panel will stop working. Continue?",
    webhookNewSecret: "New Secret",
    webhookSecretOnce: "This secret is shown only once. If you close without saving it, it cannot be viewed again.",
    webhookCopySecret: "Copy Secret",
    webhookSetupHint: "Enter this URL and secret into the provider's webhook/callback settings. The provider signs each request with the secret via HMAC-SHA256; unsigned/invalid requests are rejected.",
    webhookEvents: "Recent Webhook Events",
    webhookNoEvents: "No webhook events yet.",
    webhookColReceived: "Received",
    webhookColProvider: "Provider",
    webhookColEvent: "Event",
    webhookColOutcome: "Outcome",
    webhookColShipment: "Shipment",
    webhookOutcomeAccepted: "Succeeded",
    webhookOutcomeIgnoredUnknown: "Unmatched shipment",
    webhookOutcomeIgnoredUnsupported: "Unsupported",
    succeeded: "Succeeded",
    failed: "Failed",
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
  // F3C.5 (TODO-121) — public provider logo (secret değil).
  logoUrl: string;
}

interface EditForm {
  id: string;
  displayName: string;
  mode: (typeof MODES)[number];
  status: "ENABLED" | "DISABLED";
  logoUrl: string;
  logoAlt: string;
  allowRecipientCreate: boolean;
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
  const [createForm, setCreateForm] = useState<CreateForm>({ provider: "MOCK", displayName: "", mode: "TEST", logoUrl: "" });
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [credConfig, setCredConfig] = useState<ShippingProviderConfigResponse | null>(null);
  const [credInputs, setCredInputs] = useState<Record<string, CredInput>>({});

  // TODO-128 — Webhook modalı: seçili config + yüklenen bilgi + yalnız bir kez gösterilen secret.
  const [webhookConfig, setWebhookConfig] = useState<ShippingProviderConfigResponse | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<ShippingWebhookInfoResponse | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  // Rotate sonrası dönen düz secret. Modal kapanınca/başka config açılınca DERHAL temizlenir;
  // asla log/analytics/URL'ye girmez, sayfa yenilenince kaybolur (persistli değildir).
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

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
    setCreateForm({ provider: "MOCK", displayName: "", mode: "TEST", logoUrl: "" });
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
        logoUrl: createForm.logoUrl.trim() || undefined,
        allowRecipientCreate: false,
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
      logoUrl: config.logoUrl ?? "",
      logoAlt: config.logoAlt ?? "",
      allowRecipientCreate: config.allowRecipientCreate,
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
        // "" => logo temizle; URL => değiştir (gateway "" semantiğini uygular).
        logoUrl: editForm.logoUrl.trim(),
        logoAlt: editForm.logoAlt.trim(),
        allowRecipientCreate: editForm.allowRecipientCreate,
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

  // TODO-128 — Webhook modalını açar ve bilgi/olayları yükler. Açılışta önceki secret temizlenir.
  const openWebhook = async (config: ShippingProviderConfigResponse) => {
    setWebhookConfig(config);
    setWebhookInfo(null);
    setRevealedSecret(null);
    setActionError(null);
    setWebhookLoading(true);
    try {
      setWebhookInfo(await storeApi.getShippingWebhookInfo(config.id));
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setWebhookLoading(false);
    }
  };

  const closeWebhook = () => {
    setWebhookConfig(null);
    setWebhookInfo(null);
    // Secret'ı bellekte gereğinden uzun tutma: modal kapanınca derhal düşür.
    setRevealedSecret(null);
  };

  const rotateWebhook = async () => {
    if (!webhookConfig) return;
    if (typeof window !== "undefined" && !window.confirm(t.webhookRotateConfirm)) return;
    setRotating(true);
    setActionError(null);
    try {
      const result = await storeApi.rotateShippingWebhook(webhookConfig.id);
      setRevealedSecret(result.webhookSecret);
      // URL/durum tazelensin (yeni token → yeni URL); secret listede DÖNMEZ.
      setWebhookInfo(await storeApi.getShippingWebhookInfo(webhookConfig.id));
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setRotating(false);
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(t.webhookCopied);
    } catch {
      setActionError(messageForError(new Error("CLIPBOARD"), locale));
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
          <div className="flex items-center gap-2.5">
            <ProviderLogo logoUrl={row.logoUrl} displayName={row.displayName} logoAlt={row.logoAlt} size={26} />
            <div className="flex flex-col">
              <span className="font-semibold text-white/85">{row.displayName}</span>
              <span className="text-[11px] text-white/35">{PROVIDER_LABEL[row.provider]}</span>
            </div>
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
            {row.allowRecipientCreate || row.allowOrderCreate || row.allowBarcodeCreate || row.allowLabelPurchase ? (
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
            <Button size="sm" variant="ghost" onClick={() => void openWebhook(row)} disabled={busyId === row.id}>
              {t.webhook}
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
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label={t.fLogoUrl}
                value={createForm.logoUrl}
                onChange={(e) => setCreateForm({ ...createForm, logoUrl: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <ProviderLogo
              logoUrl={createForm.logoUrl.trim() || null}
              displayName={createForm.displayName || PROVIDER_LABEL[createForm.provider]}
              size={36}
            />
          </div>
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
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-3">
                <Input
                  label={t.fLogoUrl}
                  value={editForm.logoUrl}
                  onChange={(e) => setEditForm({ ...editForm, logoUrl: e.target.value })}
                  placeholder="https://…"
                />
                <Input
                  label={t.fLogoAlt}
                  value={editForm.logoAlt}
                  onChange={(e) => setEditForm({ ...editForm, logoAlt: e.target.value })}
                />
              </div>
              <ProviderLogo
                logoUrl={editForm.logoUrl.trim() || null}
                displayName={editForm.displayName}
                logoAlt={editForm.logoAlt.trim() || null}
                size={40}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label={t.fMode} value={editForm.mode} onChange={(e) => setEditForm({ ...editForm, mode: e.target.value as EditForm["mode"] })} options={MODES.map((m) => ({ value: m, label: m }))} />
              <Select label={t.fStatus} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as EditForm["status"] })} options={[{ value: "DISABLED", label: t.disabled }, { value: "ENABLED", label: t.enabled }]} />
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[12px] text-white/75">
                  <input type="checkbox" checked={editForm.allowRecipientCreate} onChange={(e) => setEditForm({ ...editForm, allowRecipientCreate: e.target.checked })} />
                  {t.allowRecipientCreate}
                </label>
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
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-white/55">
                  <ul className="list-disc space-y-1 pl-4">
                    {t.dhlInfo.split("\n").map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
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

      {/* Webhook modal (TODO-128): URL + copy, rotate secret (once), recent events */}
      <Modal
        open={webhookConfig !== null}
        onClose={closeWebhook}
        title={`${t.webhookTitle} — ${webhookConfig ? webhookConfig.displayName : ""}`}
        closeLabel={t.close}
        className="max-w-2xl"
        footer={<Button variant="secondary" onClick={closeWebhook}>{t.close}</Button>}
      >
        {webhookConfig ? (
          <div className="space-y-4">
            {actionError ? <Alert tone="error">{actionError}</Alert> : null}

            {webhookLoading ? (
              <SkeletonRows rows={2} />
            ) : webhookInfo ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge tone={webhookInfo.webhookConfigured ? "success" : "neutral"} dot>
                    {webhookInfo.webhookConfigured ? t.webhookConfigured : t.webhookNotConfigured}
                  </Badge>
                </div>

                {/* Webhook URL / uyarı */}
                {webhookInfo.webhookUrl ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{t.webhookUrl}</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-white/70">
                        {webhookInfo.webhookUrl}
                      </code>
                      <Button size="sm" variant="secondary" onClick={() => void copyToClipboard(webhookInfo.webhookUrl as string)}>
                        {t.webhookCopyUrl}
                      </Button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-white/45">{t.webhookSetupHint}</p>
                  </div>
                ) : !webhookInfo.webhookBaseUrlConfigured ? (
                  <Alert tone="warning">{t.webhookNoBaseUrl}</Alert>
                ) : (
                  <Alert tone="info">{t.webhookNotRotatedYet}</Alert>
                )}

                {/* Rotate + yalnızca bir kez gösterilen yeni secret */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-white/80">{t.webhookRotate}</span>
                    <Button size="sm" variant="danger" onClick={() => void rotateWebhook()} disabled={rotating}>
                      {t.webhookRotate}
                    </Button>
                  </div>
                  {revealedSecret ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{t.webhookNewSecret}</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px] text-emerald-200/90">
                          {revealedSecret}
                        </code>
                        <Button size="sm" variant="secondary" onClick={() => void copyToClipboard(revealedSecret)}>
                          {t.webhookCopySecret}
                        </Button>
                      </div>
                      <p className="text-[11px] font-semibold text-amber-200/80">{t.webhookSecretOnce}</p>
                    </div>
                  ) : null}
                </div>

                {/* Son webhook olayları */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{t.webhookEvents}</p>
                  {webhookInfo.events.length === 0 ? (
                    <p className="text-[12px] text-white/40">{t.webhookNoEvents}</p>
                  ) : (
                    <DataTable
                      columns={webhookEventColumns(t)}
                      rows={webhookInfo.events}
                      rowKey={(row) => row.id}
                    />
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/** TODO-128 — inbox outcome → lokalize + tonlu badge etiketi (yalnız güvenli alanlar). */
function webhookOutcomeBadge(outcome: ShippingWebhookEvent["outcome"], t: (typeof L)["tr"]) {
  switch (outcome) {
    case "ACCEPTED":
      return { tone: "success" as const, label: t.webhookOutcomeAccepted };
    case "IGNORED_UNKNOWN_SHIPMENT":
      return { tone: "warning" as const, label: t.webhookOutcomeIgnoredUnknown };
    case "IGNORED_UNSUPPORTED":
      return { tone: "neutral" as const, label: t.webhookOutcomeIgnoredUnsupported };
  }
}

/** Son webhook olayları tablosu kolonları — KESIN güvenli alan allowlist'i. */
function webhookEventColumns(t: (typeof L)["tr"]): DataTableColumn<ShippingWebhookEvent>[] {
  return [
    { header: t.webhookColReceived, cell: (row) => <span className="text-[11px] text-white/60">{formatDate(row.receivedAt)}</span> },
    { header: t.webhookColProvider, cell: (row) => <span className="text-[11px] text-white/60">{row.provider}</span> },
    {
      header: t.webhookColEvent,
      cell: (row) => (
        <span className="font-mono text-[10px] text-white/40" title={row.eventKey}>
          {row.eventKey.length > 22 ? `${row.eventKey.slice(0, 22)}…` : row.eventKey}
          {row.statusText ? <span className="ml-1 font-sans text-white/55">· {row.statusText}</span> : null}
        </span>
      ),
    },
    {
      header: t.webhookColOutcome,
      cell: (row) => {
        const b = webhookOutcomeBadge(row.outcome, t);
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
    {
      header: t.webhookColShipment,
      cell: (row) => <span className="text-[11px] text-white/45">{row.shipmentId ?? t.none}</span>,
    },
  ];
}

function dhlHeading(type: DhlCredType): string {
  switch (type) {
    case "IDENTITY":
      return "Identity";
    case "PLUS_COMMAND":
      return "Plus Command (createRecipient)";
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
