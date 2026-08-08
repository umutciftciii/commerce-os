"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Modal, SkeletonRows, Textarea } from "../../../../../components/ui";
import { SurfaceCard, Timeline, TimelineItem } from "../../../../components/premium";
import {
  storeApi,
  UiError,
  type RefundContext,
  type OrderRefund,
  type OrderRefundEvent,
} from "../../../../../lib/client/api";
import { messageForError } from "../../../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../../../lib/client/format";
import type { Locale } from "@commerce-os/i18n";
// TODO-175 (ADR-285) — refund hedefi (müşteri tercihi) etiket/tonları (ham enum gösterilmez).
import { refundDestinationLabel, REFUND_DESTINATION_TONES } from "../../order-shared";

/**
 * TODO-170 (ADR-270) — İade Defteri & Ödeme Ters Çevirme paneli.
 *
 * İade talebi `REFUND_TO_ORIGINAL_PAYMENT` çözümündeyse iade detayına gömülür. İade
 * defteri bağlamını (yakalanan/iade edilebilir + capability + refund satırları) çeker,
 * para iadesi başlatma/yenileme/tekrar deneme/manuel tamamlama/iptal aksiyonlarını sunar.
 *
 * Erişilebilirlik: durum YALNIZ renkle değil metin etiketi + glif ile iletilir; yıkıcı
 * aksiyonlar erişilebilir onay modalinden geçer; manuel referans/not alanları etiketlidir.
 * Güvenlik: ham sağlayıcı hata kodu/mesajı yalnız admin'e ve KONTROLLÜ (aç/kapa) gösterilir.
 */

type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; context: RefundContext };

type Dialog =
  | { kind: "initiate" }
  | { kind: "retry"; refund: OrderRefund }
  | { kind: "cancel"; refund: OrderRefund }
  | { kind: "manual"; refund: OrderRefund }
  | null;

type Tone = "neutral" | "success" | "warning" | "info" | "danger" | "brand";
// premium Timeline/TimelineItem "info" desteklemez (yalnız MetricTone). Olay tonları bu alt küme.
type TimelineTone = "neutral" | "success" | "warning" | "danger" | "brand";

// Durum sinyali: renk TEK BAŞINA taşımaz — her durum bir metin etiketi + glif ile gelir.
const REFUND_STATUS_META: Record<
  OrderRefund["status"],
  { tone: Tone; glyph: string; tr: string; en: string }
> = {
  PENDING: { tone: "warning", glyph: "○", tr: "Beklemede", en: "Pending" },
  PROCESSING: { tone: "info", glyph: "◐", tr: "İşleniyor", en: "Processing" },
  SUCCEEDED: { tone: "success", glyph: "✓", tr: "Tamamlandı", en: "Succeeded" },
  FAILED: { tone: "danger", glyph: "✕", tr: "Başarısız", en: "Failed" },
  CANCELLED: { tone: "neutral", glyph: "⊘", tr: "İptal edildi", en: "Cancelled" },
};

const EVENT_LABELS: Record<OrderRefundEvent["type"], { tr: string; en: string }> = {
  REQUESTED: { tr: "Talep edildi", en: "Requested" },
  PROVIDER_SUBMITTED: { tr: "Sağlayıcıya iletildi", en: "Submitted to provider" },
  PROCESSING: { tr: "İşleniyor", en: "Processing" },
  SUCCEEDED: { tr: "Tamamlandı", en: "Succeeded" },
  FAILED: { tr: "Başarısız", en: "Failed" },
  CANCELLED: { tr: "İptal edildi", en: "Cancelled" },
  RETRY: { tr: "Yeniden denendi", en: "Retried" },
  MANUAL_COMPLETED: { tr: "Manuel tamamlandı", en: "Manually completed" },
  RECONCILED: { tr: "Mutabakat yapıldı", en: "Reconciled" },
  STATUS_QUERIED: { tr: "Durum sorgulandı", en: "Status queried" },
  DUPLICATE_CALLBACK: { tr: "Yinelenen bildirim", en: "Duplicate callback" },
};

const EVENT_TONES: Record<OrderRefundEvent["type"], TimelineTone> = {
  REQUESTED: "brand",
  PROVIDER_SUBMITTED: "brand",
  PROCESSING: "brand",
  SUCCEEDED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  RETRY: "warning",
  MANUAL_COMPLETED: "success",
  RECONCILED: "brand",
  STATUS_QUERIED: "neutral",
  DUPLICATE_CALLBACK: "neutral",
};

function manualMethodLabel(method: OrderRefund["manualMethod"], isTr: boolean): string {
  switch (method) {
    case "BANK_TRANSFER":
      return isTr ? "Banka/EFT" : "Bank transfer";
    case "CASH":
      return isTr ? "Nakit" : "Cash";
    case "POS":
      return "POS";
    case "OTHER":
      return isTr ? "Diğer" : "Other";
    default:
      return "—";
  }
}

function providerLabel(provider: OrderRefund["provider"]): string {
  return provider ?? "—";
}

function methodLabel(method: OrderRefund["method"], isTr: boolean): string {
  switch (method) {
    case "CARD":
      return isTr ? "Kart" : "Card";
    case "BANK_TRANSFER":
      return isTr ? "Banka/EFT" : "Bank transfer";
    case "CASH_ON_DELIVERY":
      return isTr ? "Kapıda ödeme" : "Cash on delivery";
    case "PAYMENT_LINK":
      return isTr ? "Ödeme bağlantısı" : "Payment link";
    default:
      return "—";
  }
}

// TODO-175 (ADR-285) — yürütme modu etiketi. INTERNAL_CREDIT = alışveriş bakiyesi legi (dış PSP YOK).
function executionModeLabel(mode: OrderRefund["executionMode"], isTr: boolean): string {
  switch (mode) {
    case "PROVIDER_AUTOMATIC":
      return isTr ? "Otomatik (sağlayıcı)" : "Automatic (provider)";
    case "MANUAL_OFFLINE":
      return isTr ? "Manuel (banka/EFT)" : "Manual (offline)";
    case "INTERNAL_CREDIT":
      return isTr ? "Alışveriş bakiyesi (dahili)" : "Shopping balance (internal)";
    default:
      return "—";
  }
}

function actorLabel(actor: OrderRefundEvent["actorType"], isTr: boolean): string {
  if (actor === "ADMIN") return isTr ? "Yönetici" : "Admin";
  if (actor === "PROVIDER") return isTr ? "Sağlayıcı" : "Provider";
  return isTr ? "Sistem" : "System";
}

export function RefundPanel({
  returnId,
  returnVersion,
  locale,
  onChanged,
  refreshKey,
}: {
  returnId: string;
  /** Güncel iade (return) sürümü — "Para iadesini başlat" optimistic kilidinde kullanılır. */
  returnVersion: number;
  locale: Locale;
  /** Aksiyon sonrası üst iade detayını (ret.version/durum) tazelemek için ebeveyn reload'u. */
  onChanged: () => void | Promise<void>;
  /**
   * TD-FR-7 ship-polish #1 — üst sayfadaki inspect-decision/reject mutasyonu (bu panelin
   * KENDİ initiate/retry/cancel/manual aksiyonlarından BAĞIMSIZ) sonuçlandığında ebeveyn bu
   * sayacı bir artırır. Panel kendi getRefundContext state'ini yalnız returnId/locale
   * değiştiğinde DEĞİL, bu sayaç değiştiğinde de yeniden çeker — aksi halde inspect-decision
   * sonrası panel elle sayfa yenilenene kadar eski context'i gösterirdi.
   */
  refreshKey?: number;
}) {
  const isTr = locale === "tr";
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [techOpen, setTechOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await storeApi.getRefundContext(returnId);
      setState({ status: "ready", context: res.context });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [returnId, locale]);

  // TD-FR-7 ship-polish #1 — `refreshKey` deps'e eklenir: ebeveyn bunu bir artırdığında
  // (inspect-decision/reject sonrası) tek seferlik yeniden fetch tetiklenir. `load` zaten
  // yalnız returnId/locale değişince yeniden oluşturulan bir referans olduğundan ve
  // `refreshKey` yalnız DIŞARIDAN (ebeveyn mutation sonucu) değiştiğinden — bu effect
  // kendi içinde refreshKey'i asla set ETMEZ — sonsuz döngü OLUŞMAZ.
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Aksiyon sonucu güncel context döner → doğrudan yansıt; ayrıca üst iade detayını tazele.
  // 409 VERSION_CONFLICT / STALE_INTENT: kayıt değişti → dostça mesaj + iki tarafı yeniden yükle.
  const runAction = useCallback(
    async (fn: () => Promise<{ context: RefundContext }>) => {
      setActionError(null);
      setBusy(true);
      try {
        const result = await fn();
        setState({ status: "ready", context: result.context });
        setDialog(null);
        await onChanged();
      } catch (error) {
        if (
          error instanceof UiError &&
          (error.code === "VERSION_CONFLICT" || error.code === "STALE_INTENT")
        ) {
          await load();
          await onChanged();
          setDialog(null);
        }
        setActionError(messageForError(error, locale));
      } finally {
        setBusy(false);
      }
    },
    [locale, load, onChanged],
  );

  if (state.status === "loading") {
    return (
      <SurfaceCard title={isTr ? "İade Defteri" : "Refund ledger"}>
        <SkeletonRows rows={4} />
      </SurfaceCard>
    );
  }
  if (state.status === "error") {
    return (
      <SurfaceCard title={isTr ? "İade Defteri" : "Refund ledger"}>
        <Alert
          tone="error"
          action={
            <Button size="sm" onClick={() => void load()}>
              {isTr ? "Yeniden dene" : "Retry"}
            </Button>
          }
        >
          {state.message}
        </Alert>
      </SurfaceCard>
    );
  }

  const ctx = state.context;
  const cap = ctx.capability;
  const manualUnsupported = cap?.reason === "PROVIDER_AUTOMATIC_UNSUPPORTED";
  // TODO-175 (ADR-285) — müşterinin refund hedefi tercihi (iki-defter ayrımı). Detay bunu
  // yalnız refund satırlarında taşır (legacy null olabilir); ilk taşıyan satırdan türetilir.
  const customerDestination = ctx.refunds.find((r) => r.refundDestination)?.refundDestination ?? null;

  return (
    <SurfaceCard
      title={isTr ? "İade Defteri" : "Refund ledger"}
      description={
        isTr
          ? "Müşterinin seçtiği hedefe para iadesi. Tutarlar sipariş anlık görüntüsünden gelir."
          : "Refund to the destination chosen by the customer. Amounts come from the order snapshot."
      }
      actions={
        ctx.canInitiate ? (
          <Button size="sm" disabled={busy} onClick={() => setDialog({ kind: "initiate" })}>
            {isTr ? "Para iadesini başlat" : "Start refund"}
          </Button>
        ) : null
      }
    >
      {actionError ? (
        <div className="mb-4">
          <Alert
            tone="error"
            action={
              <Button variant="ghost" size="sm" onClick={() => setActionError(null)}>
                {isTr ? "Kapat" : "Dismiss"}
              </Button>
            }
          >
            {actionError}
          </Alert>
        </div>
      ) : null}

      {/* TODO-175 (ADR-285) — müşterinin seçtiği iade hedefi (iki-defter ayrımı). Ham enum değil,
          insani etiket + gösterge tonu. SHOPPING_BALANCE = dahili kredi (dış PSP legi yok). */}
      {customerDestination ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-white/45">
          <span>{isTr ? "İade yöntemi (müşteri tercihi)" : "Refund method (customer choice)"}:</span>
          <Badge tone={REFUND_DESTINATION_TONES[customerDestination]}>
            {refundDestinationLabel(customerDestination, locale)}
          </Badge>
        </div>
      ) : null}

      {/* Para özeti — yakalanan / önceden iade / iade edilebilir kalan. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Money label={isTr ? "Yakalanan" : "Captured"} value={formatMinor(ctx.capturedMinor, ctx.currency)} />
        <Money
          label={isTr ? "Önceden iade" : "Previously refunded"}
          value={formatMinor(ctx.succeededRefundMinor, ctx.currency)}
        />
        <Money
          label={isTr ? "İade edilebilir kalan" : "Refundable remaining"}
          value={formatMinor(ctx.refundableRemainingMinor, ctx.currency)}
          strong
        />
      </dl>

      {/* Sağlayıcı & yöntem + capability modu. */}
      {cap ? (
        <div className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/45">
            <span>
              {isTr ? "Sağlayıcı" : "Provider"}:{" "}
              <span className="text-white/70">{providerLabel(cap.provider)}</span>
            </span>
            <span>
              {isTr ? "Yöntem" : "Method"}:{" "}
              <span className="text-white/70">{methodLabel(cap.method, isTr)}</span>
            </span>
            <span>
              {isTr ? "Mod" : "Mode"}:{" "}
              <Badge tone={cap.mode === "PROVIDER_AUTOMATIC" ? "info" : "neutral"}>
                {cap.mode === "PROVIDER_AUTOMATIC"
                  ? isTr
                    ? "Otomatik (sağlayıcı)"
                    : "Automatic (provider)"
                  : isTr
                    ? "Manuel (banka/EFT)"
                    : "Manual (offline)"}
              </Badge>
            </span>
          </div>
          {manualUnsupported ? (
            <p className="mt-2 text-xs leading-relaxed text-amber-300/80">
              {isTr
                ? "Bu ödeme yönteminde otomatik sağlayıcı iadesi kullanılamıyor. Para iadesi manuel (banka/EFT) yapılmalı ve tamamlandığında aşağıdan işaretlenmelidir. Otomatik bir iade GERÇEKLEŞMEZ."
                : "Automatic provider refund is unavailable for this payment method. The refund must be made manually (bank transfer) and marked as completed below. No automatic refund happens."}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* İade tutarı (niyet) kırılımı. */}
      {ctx.intent ? (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            {isTr ? "İade tutarı kırılımı" : "Refund amount breakdown"}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <Money label={isTr ? "Ürün" : "Product"} value={formatMinor(ctx.intent.productRefundMinor, ctx.intent.currency)} />
            <Money label={isTr ? "Kargo" : "Shipping"} value={formatMinor(ctx.intent.shippingRefundMinor, ctx.intent.currency)} />
            <Money label={isTr ? "KDV (dahil)" : "VAT (incl.)"} value={formatMinor(ctx.intent.taxRefundMinor, ctx.intent.currency)} />
            <Money label={isTr ? "Toplam" : "Total"} value={formatMinor(ctx.intent.totalRefundMinor, ctx.intent.currency)} strong />
          </dl>
        </div>
      ) : null}

      {/* Refund satırları (defter). */}
      <div className="mt-5 space-y-4">
        {ctx.refunds.length === 0 ? (
          <p className="text-sm text-white/40">
            {ctx.canInitiate
              ? isTr
                ? "Henüz para iadesi başlatılmadı. Yukarıdan başlatabilirsiniz."
                : "No refund started yet. You can start one above."
              : isTr
                ? "Bu iade için henüz para iadesi kaydı yok."
                : "No refund records for this return yet."}
          </p>
        ) : (
          ctx.refunds.map((refund) => (
            <RefundRow
              key={refund.id}
              refund={refund}
              isTr={isTr}
              locale={locale}
              busy={busy}
              techOpen={Boolean(techOpen[refund.id])}
              onToggleTech={() =>
                setTechOpen((prev) => ({ ...prev, [refund.id]: !prev[refund.id] }))
              }
              onRefresh={() =>
                void runAction(() => storeApi.refreshRefund(refund.id))
              }
              onRetry={() => setDialog({ kind: "retry", refund })}
              onCancel={() => setDialog({ kind: "cancel", refund })}
              onManual={() => setDialog({ kind: "manual", refund })}
            />
          ))
        )}
      </div>

      {/* Onay / form modalleri. */}
      {dialog?.kind === "initiate" ? (
        <ConfirmDialog
          isTr={isTr}
          busy={busy}
          title={isTr ? "Para iadesini başlat" : "Start refund"}
          description={
            manualUnsupported
              ? isTr
                ? "Manuel iade kaydı oluşturulur. Parayı banka/EFT ile iade edip tamamlandığında işaretlemelisiniz. Bu adım otomatik para hareketi YAPMAZ."
                : "A manual refund record is created. You must refund the money via bank transfer and mark it completed. This step does not move money automatically."
              : isTr
                ? "Müşterinin orijinal ödemesine para iadesi başlatılır. Bu işlem geri alınamaz."
                : "A refund to the customer's original payment will be started. This action can't be undone."
          }
          confirmLabel={isTr ? "Başlat" : "Start"}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            void runAction(() =>
              storeApi.initiateRefund(returnId, { expectedReturnVersion: returnVersion }),
            )
          }
        />
      ) : null}

      {dialog?.kind === "retry" ? (
        <ConfirmDialog
          isTr={isTr}
          busy={busy}
          title={isTr ? "Para iadesini tekrar dene" : "Retry refund"}
          description={
            isTr
              ? "Başarısız olan para iadesi yeniden denenir."
              : "The failed refund will be retried."
          }
          confirmLabel={isTr ? "Tekrar dene" : "Retry"}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            void runAction(() =>
              storeApi.retryRefund(dialog.refund.id, { expectedVersion: dialog.refund.version }),
            )
          }
        />
      ) : null}

      {dialog?.kind === "cancel" ? (
        <CancelDialog
          isTr={isTr}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            void runAction(() =>
              storeApi.cancelRefund(dialog.refund.id, {
                expectedVersion: dialog.refund.version,
                ...(reason ? { reason } : {}),
              }),
            )
          }
        />
      ) : null}

      {dialog?.kind === "manual" ? (
        <ManualCompleteDialog
          isTr={isTr}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(manualReference, manualNote) =>
            void runAction(() =>
              storeApi.manualCompleteRefund(dialog.refund.id, {
                expectedVersion: dialog.refund.version,
                manualReference,
                manualNote,
              }),
            )
          }
        />
      ) : null}
    </SurfaceCard>
  );
}

function Money({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-white/35">{label}</dt>
      <dd className={strong ? "text-sm font-semibold text-white/90" : "text-sm text-white/70"}>{value}</dd>
    </div>
  );
}

function RefundRow({
  refund,
  isTr,
  locale,
  busy,
  techOpen,
  onToggleTech,
  onRefresh,
  onRetry,
  onCancel,
  onManual,
}: {
  refund: OrderRefund;
  isTr: boolean;
  locale: Locale;
  busy: boolean;
  techOpen: boolean;
  onToggleTech: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onManual: () => void;
}) {
  const meta = REFUND_STATUS_META[refund.status];
  const canRefresh = refund.status === "PROCESSING";
  const canRetry = refund.status === "FAILED";
  const canManual = refund.status === "PENDING" && refund.executionMode === "MANUAL_OFFLINE";
  const canCancel = refund.status === "PENDING" || refund.status === "PROCESSING";
  const hasTech = Boolean(refund.failureCode || refund.failureMessage);

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {/* Durum: renk TEK BAŞINA taşımaz — glif + metin etiketi. */}
            <Badge tone={meta.tone}>
              <span aria-hidden>{meta.glyph}</span> {isTr ? meta.tr : meta.en}
            </Badge>
            <span className="text-sm font-semibold text-white/90">
              {formatMinor(refund.totalRefundMinor, refund.currency)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/40">
            <span>
              {isTr ? "Ürün" : "Product"}: {formatMinor(refund.productRefundMinor, refund.currency)}
            </span>
            <span>
              {isTr ? "Kargo" : "Shipping"}: {formatMinor(refund.shippingRefundMinor, refund.currency)}
            </span>
            <span>
              {isTr ? "KDV" : "VAT"}: {formatMinor(refund.taxRefundMinor, refund.currency)}
            </span>
          </div>
          {/* TODO-175 — hedef (müşteri tercihi): SHOPPING_BALANCE = alışveriş bakiyesi legi (PSP yok). */}
          {refund.refundDestination ? (
            <div className="mt-1.5">
              <Badge tone={REFUND_DESTINATION_TONES[refund.refundDestination]}>
                {refundDestinationLabel(refund.refundDestination, locale)}
              </Badge>
            </div>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/30">
            <span>{executionModeLabel(refund.executionMode, isTr)}</span>
            {refund.provider ? <span>{providerLabel(refund.provider)}</span> : null}
            {refund.providerReference ? (
              <span className="font-mono">
                {isTr ? "Ref" : "Ref"}: {refund.providerReference}
              </span>
            ) : null}
            {refund.manualReference ? (
              <span className="font-mono">
                {manualMethodLabel(refund.manualMethod, isTr)}: {refund.manualReference}
              </span>
            ) : null}
            <span>
              {isTr ? "Talep" : "Requested"}: {formatDate(refund.requestedAt)}
            </span>
          </div>
          {refund.manualNote ? (
            <p className="mt-1 text-xs text-white/50">
              {isTr ? "Not" : "Note"}: {refund.manualNote}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canRefresh ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={onRefresh}>
              {isTr ? "Durumu yenile" : "Refresh status"}
            </Button>
          ) : null}
          {canRetry ? (
            <Button size="sm" disabled={busy} onClick={onRetry}>
              {isTr ? "Tekrar dene" : "Retry"}
            </Button>
          ) : null}
          {canManual ? (
            <Button size="sm" disabled={busy} onClick={onManual}>
              {isTr ? "Manuel iade tamamlandı" : "Mark manual refund done"}
            </Button>
          ) : null}
          {canCancel ? (
            <Button size="sm" variant="danger" disabled={busy} onClick={onCancel}>
              {isTr ? "İadeyi iptal et" : "Cancel refund"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Admin-only teknik hata detayı — KONTROLLÜ (varsayılan gizli). Müşteriye asla gösterilmez. */}
      {hasTech ? (
        <div className="mt-2 border-t border-white/[0.06] pt-2">
          <button
            type="button"
            className="text-xs font-medium text-white/50 underline hover:text-white/80"
            aria-expanded={techOpen}
            onClick={onToggleTech}
          >
            {techOpen
              ? isTr
                ? "Teknik detayı gizle"
                : "Hide technical detail"
              : isTr
                ? "Teknik detayı göster (yalnız yönetici)"
                : "Show technical detail (admin only)"}
          </button>
          {techOpen ? (
            <div className="mt-1.5 rounded-md border border-red-400/15 bg-red-400/[0.05] px-2.5 py-2 font-mono text-xs text-red-200/80">
              {refund.failureCode ? <p>code: {refund.failureCode}</p> : null}
              {refund.failureMessage ? <p className="mt-0.5 break-words">{refund.failureMessage}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Olay zaman çizelgesi — <ol> tabanlı (klavye/ekran okuyucu okunur). */}
      {refund.events.length > 0 ? (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            {isTr ? "Olay geçmişi" : "Event history"}
          </p>
          <Timeline>
            {refund.events.map((event, i) => (
              <TimelineItem
                key={`${event.type}-${event.createdAt}-${i}`}
                last={i === refund.events.length - 1}
                tone={EVENT_TONES[event.type]}
                title={isTr ? EVENT_LABELS[event.type].tr : EVENT_LABELS[event.type].en}
                meta={`${formatDate(event.createdAt)} · ${actorLabel(event.actorType, isTr)}`}
                description={
                  event.amountMinor > 0 || event.providerReference
                    ? [
                        event.amountMinor > 0
                          ? formatMinor(event.amountMinor, refund.currency)
                          : null,
                        event.providerReference ? `ref: ${event.providerReference}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : undefined
                }
              />
            ))}
          </Timeline>
        </div>
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  isTr,
  busy,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  isTr: boolean;
  busy: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      closeLabel={isTr ? "Vazgeç" : "Cancel"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button disabled={busy} onClick={onConfirm}>
            {busy ? (isTr ? "İşleniyor…" : "Processing…") : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-white/60">
        {isTr
          ? "Devam etmek istediğinize emin misiniz?"
          : "Are you sure you want to continue?"}
      </p>
    </Modal>
  );
}

function CancelDialog({
  isTr,
  busy,
  onClose,
  onConfirm,
}: {
  isTr: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={isTr ? "Para iadesini iptal et" : "Cancel refund"}
      description={
        isTr
          ? "Devam eden/bekleyen para iadesi iptal edilir. Bu işlem geri alınamaz."
          : "The pending/processing refund will be cancelled. This can't be undone."
      }
      closeLabel={isTr ? "Vazgeç" : "Cancel"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => onConfirm(reason.trim() || undefined)}>
            {busy ? (isTr ? "İptal ediliyor…" : "Cancelling…") : isTr ? "İadeyi iptal et" : "Cancel refund"}
          </Button>
        </>
      }
    >
      <Textarea
        id="refund-cancel-reason"
        label={isTr ? "İptal nedeni (opsiyonel)" : "Cancellation reason (optional)"}
        rows={2}
        maxLength={300}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Modal>
  );
}

function ManualCompleteDialog({
  isTr,
  busy,
  onClose,
  onConfirm,
}: {
  isTr: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (manualReference: string, manualNote: string) => void;
}) {
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const valid = reference.trim().length > 0 && note.trim().length > 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={isTr ? "Manuel iade tamamlandı" : "Mark manual refund done"}
      description={
        isTr
          ? "Parayı banka/EFT ile iade ettiyseniz burada işaretleyin. Referans ve açıklama zorunludur."
          : "Mark here once you've refunded the money via bank transfer. Reference and note are required."
      }
      closeLabel={isTr ? "Vazgeç" : "Cancel"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={() => onConfirm(reference.trim(), note.trim())}
          >
            {busy ? (isTr ? "Kaydediliyor…" : "Saving…") : isTr ? "Tamamlandı olarak işaretle" : "Mark completed"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          id="manual-refund-reference"
          label={isTr ? "Referans (banka/dekont)" : "Reference (bank/receipt)"}
          required
          maxLength={200}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <Textarea
          id="manual-refund-note"
          label={isTr ? "Açıklama" : "Note"}
          required
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}
