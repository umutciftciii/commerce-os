"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  Select,
  SkeletonRows,
  Textarea,
  useLocale,
} from "../../../../../components/ui";
import type {
  AdminReturnDetail,
  AdminReturnItem,
  AdminReturnFastRefundContext,
} from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../../../lib/client/api";
import { messageForError } from "../../../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../../../lib/client/format";
// TODO-172 (ADR-273) — Fast Refund minor-unit tutarları KANONİK STRING; float'sız BigInt formatter.
import { formatMinorMoney } from "@commerce-os/utils";
import {
  DetailHero,
  DetailLayout,
  RailCard,
  RailRow,
  SurfaceCard,
  Timeline,
  TimelineItem,
} from "../../../../components/premium";
// TODO-170 (ADR-270) — İade defteri & ödeme ters çevirme paneli (REFUND_TO_ORIGINAL_PAYMENT).
import { RefundPanel } from "./refund-panel";
import { ReverseShipmentPanel } from "./reverse-shipment-panel";
import {
  PAYMENT_STATUS_TONES,
  RETURN_STATUS_TONES,
  RETURN_RESOLUTION_TONES,
  RETURN_REASON_TONES,
  RETURN_CONDITION_VALUES,
  RETURN_INSPECTION_VALUES,
  RETURN_RESTOCK_VALUES,
  returnStatusLabel,
  returnResolutionLabel,
  returnReasonLabel,
  returnConditionLabel,
  returnInspectionLabel,
  returnRestockLabel,
  canApproveReturn,
  canRejectReturn,
  canReceiveReturn,
  canInspectReturn,
  canRefundPending,
  canReplacementPending,
  type Tone,
  type ReturnConditionStatus,
  type ReturnInspectionResult,
  type ReturnRestockDecision,
  type ReturnResolutionType,
} from "../../order-shared";

// TODO-175 (ADR-285) — nötr "REFUND" çözümü de (hedef ayrı `refundDestination` alanında) orijinal
// REFUND_TO_ORIGINAL_PAYMENT ile aynı iade defteri/akışını kullanır. Refund-yolu kapıları bu helper'la.
function isRefundResolution(resolutionType: ReturnResolutionType): boolean {
  return resolutionType === "REFUND" || resolutionType === "REFUND_TO_ORIGINAL_PAYMENT";
}

// TODO-170 (ADR-272) — ledger-otoriteli refund özeti durumu → tone/glyph/etiket. Durum RENK-TEK-BAŞINA
// değil (glyph + metin). Tamamlanmış refund sonrası ASLA "beklemede" göstermez.
const REFUND_SUMMARY_TONE: Record<string, Tone> = {
  INTENT_PENDING: "warning",
  PROCESSING: "info",
  SUCCEEDED: "success",
  PARTIALLY_SUCCEEDED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};
const REFUND_SUMMARY_GLYPH: Record<string, string> = {
  INTENT_PENDING: "○",
  PROCESSING: "◐",
  SUCCEEDED: "✓",
  PARTIALLY_SUCCEEDED: "◑",
  FAILED: "✕",
  CANCELLED: "⊘",
};
function refundSummaryLabel(status: string, isTr: boolean): string {
  const tr: Record<string, string> = {
    INTENT_PENDING: "İade Niyeti · Beklemede",
    PROCESSING: "Para İadesi · İşleniyor",
    SUCCEEDED: "Para İadesi · Tamamlandı",
    PARTIALLY_SUCCEEDED: "Kısmi Para İadesi · Tamamlandı",
    FAILED: "Para İadesi · Başarısız",
    CANCELLED: "İade Niyeti · İptal Edildi",
  };
  const en: Record<string, string> = {
    INTENT_PENDING: "Refund Intent · Pending",
    PROCESSING: "Refund · Processing",
    SUCCEEDED: "Refund · Completed",
    PARTIALLY_SUCCEEDED: "Partial Refund · Completed",
    FAILED: "Refund · Failed",
    CANCELLED: "Refund Intent · Cancelled",
  };
  return (isTr ? tr : en)[status] ?? status;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; ret: AdminReturnDetail };

type Dialog = "reject" | "partial" | "inspect" | "refund" | "fast-refund" | null;

// Ham enum ASLA gösterilmez (standart #1). Tone paylaşılan `PAYMENT_STATUS_TONES`'tan; etiket
// admin genelindeki `paymentLabels` sözcükleriyle birebir (dosya idiom'u: isTr-tabanlı helper).
function paymentStatusLabel(status: AdminReturnDetail["orderPaymentStatus"], isTr: boolean): string {
  const tr: Record<string, string> = {
    UNPAID: "Ödenmedi",
    PAYMENT_PENDING: "Ödeme bekliyor",
    AUTHORIZED: "Yetkilendirildi",
    PAID: "Ödendi",
    PARTIALLY_REFUNDED: "Kısmen iade edildi",
    REFUNDED: "İade edildi",
    PAYMENT_FAILED: "Ödeme başarısız",
    CANCELLED: "İptal edildi",
  };
  const en: Record<string, string> = {
    UNPAID: "Unpaid",
    PAYMENT_PENDING: "Payment pending",
    AUTHORIZED: "Authorised",
    PAID: "Paid",
    PARTIALLY_REFUNDED: "Partially refunded",
    REFUNDED: "Refunded",
    PAYMENT_FAILED: "Payment failed",
    CANCELLED: "Cancelled",
  };
  return (isTr ? tr : en)[status] ?? status;
}

export default function ReturnDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const locale = useLocale();
  const isTr = locale === "tr";

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // TD-FR-7 Faz 1 ship-polish #1 — RefundPanel (gömülü, kendi getRefundContext state'ine
  // sahip) inspect-decision/reject sonrası kendiliğinden tazelenmez (sayfa elle yenilenene
  // kadar eski görünür). Bu sayaç yalnız ilgili mutation SONUÇLANINCA (başarı VEYA hata —
  // hata durumunda bile backend state'i değişmiş olabilir, örn. REFUND_PENDING'e geçmiş ama
  // refund başlatılamamış) bir artar; RefundPanel bunu prop olarak alıp kendi
  // useEffect deps'ine ekler → tek seferlik yeniden fetch, sonsuz döngü YOK.
  const [refreshKey, setRefreshKey] = useState(0);
  // TODO-172 (ADR-273) — Fast Refund bounded risk/uygunluk özeti. Yalnız kaynak durumlarda
  // (AWAITING_SHIPMENT/RECEIVED) + refund çözümünde çekilir; permission/enabled sunucudan gelir
  // (CTA görünürlüğü sunucu-otoriter, UI gizlemesi tek başına yeterli değil — backend de zorlar).
  const [fastCtx, setFastCtx] = useState<AdminReturnFastRefundContext | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.getReturn(id);
      setState({ status: "ready", ret: result.return });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fast Refund context'i yalnız kaynak durumda + refund çözümünde çek (gereksiz istek yok).
  // refreshKey değişince (mutation sonrası) yeniden çekilir; durum değişince gizlenir.
  const readyRet = state.status === "ready" ? state.ret : null;
  const fastEligibleStatus =
    readyRet?.status === "AWAITING_SHIPMENT" || readyRet?.status === "RECEIVED";
  const fastRefundResolution = readyRet != null && isRefundResolution(readyRet.resolutionType);
  useEffect(() => {
    if (!readyRet || !fastEligibleStatus || !fastRefundResolution) {
      setFastCtx(null);
      return;
    }
    let cancelled = false;
    void storeApi
      .getFastRefundContext(readyRet.id)
      .then((r) => {
        if (!cancelled) setFastCtx(r.context);
      })
      .catch(() => {
        if (!cancelled) setFastCtx(null);
      });
    return () => {
      cancelled = true;
    };
  }, [readyRet, fastEligibleStatus, fastRefundResolution, refreshKey]);

  // Aksiyon sonucu güncel detay döner → doğrudan state'e yansıt (ekstra fetch yok).
  // `refreshRefundPanel` — yalnız inspect-decision/reject gibi refund-context'i etkileyebilecek
  // mutasyonlar için true geçilir; RefundPanel'in KENDİ ayrı getRefundContext state'ini
  // tazelemesi için refreshKey'i BİR artırır (başarı VE hata dalında — hata dalında da backend
  // state'i değişmiş olabilir).
  const runAction = useCallback(
    async (
      fn: () => Promise<{ return: AdminReturnDetail }>,
      successMsg: string,
      opts?: { refreshRefundPanel?: boolean },
    ) => {
      setActionError(null);
      setBusy(true);
      try {
        const result = await fn();
        setState({ status: "ready", ret: result.return });
        setNotice(successMsg);
        setDialog(null);
        if (opts?.refreshRefundPanel) setRefreshKey((k) => k + 1);
      } catch (error) {
        // R3 — optimistic conflict: kayıt bu sırada değişti. Güncel detayı yeniden yükle
        // (taze version) ve kullanıcıya dostça mesaj göster; ham teknik kod gösterme.
        if (error instanceof UiError && error.code === "VERSION_CONFLICT") {
          await load();
          setDialog(null);
        }
        setActionError(messageForError(error, locale));
        if (opts?.refreshRefundPanel) setRefreshKey((k) => k + 1);
      } finally {
        setBusy(false);
      }
    },
    [locale, load],
  );

  if (state.status === "loading") return <SkeletonRows rows={6} />;
  if (state.status === "error") {
    return (
      <Alert tone="error" action={<Button size="sm" onClick={() => void load()}>{isTr ? "Yeniden dene" : "Retry"}</Button>}>
        {state.message}
      </Alert>
    );
  }

  const ret = state.ret;
  const s = ret.status;

  const doneMsg = isTr ? "İade güncellendi." : "Return updated.";

  const actions = (
    <>
      {canApproveReturn(s) ? (
        <>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void runAction(() => storeApi.approveReturn(ret.id, { expectedVersion: ret.version }), doneMsg)}
          >
            {isTr ? "Tamamen onayla" : "Approve all"}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog("partial")}>
            {isTr ? "Kısmi onayla" : "Partial approve"}
          </Button>
        </>
      ) : null}
      {canReceiveReturn(s) ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void runAction(
              () => storeApi.transitionReturn(ret.id, { targetStatus: "RECEIVED", expectedVersion: ret.version }),
              doneMsg,
            )
          }
        >
          {isTr ? "Teslim alındı" : "Mark received"}
        </Button>
      ) : null}
      {canInspectReturn(s) ? (
        <Button size="sm" disabled={busy} onClick={() => setDialog("inspect")}>
          {isTr ? "İnceleme sonucu gir" : "Enter inspection"}
        </Button>
      ) : null}
      {/* TODO-172 (ADR-273) — Hızlı iade CTA. Yalnız permission + fastRefundEnabled + kaynak durumda
          görünür (sunucu-otoriter fastCtx). Limit aşımı/uygunsuzluk CTA'yı GİZLEMEZ — modal içinde
          nedeni açıkça gösterilir + normal iade akışına yönlendirilir (spec §8). */}
      {fastCtx && fastCtx.permitted && fastCtx.enabled ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog("fast-refund")}>
          {isTr ? "Hızlı iade yap" : "Fast refund"}
        </Button>
      ) : null}
      {canRefundPending(s) && isRefundResolution(ret.resolutionType) ? (
        <Button size="sm" disabled={busy} onClick={() => setDialog("refund")}>
          {isTr ? "İade sürecine al" : "Move to refund"}
        </Button>
      ) : null}
      {canReplacementPending(s) && ret.resolutionType === "REPLACEMENT" ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void runAction(
              () => storeApi.transitionReturn(ret.id, { targetStatus: "REPLACEMENT_PENDING", expectedVersion: ret.version }),
              doneMsg,
            )
          }
        >
          {isTr ? "Değişim sürecine al" : "Move to replacement"}
        </Button>
      ) : null}
      {canRejectReturn(s) ? (
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setDialog("reject")}>
          {isTr ? "Reddet" : "Reject"}
        </Button>
      ) : null}
    </>
  );

  return (
    <>
      <DetailHero
        eyebrow={isTr ? "İade" : "Return"}
        title={ret.returnNumber}
        subtitle={
          <span>
            {isTr ? "Sipariş" : "Order"}{" "}
            <Link href={`/orders`} className="text-indigo-300 hover:text-indigo-200">
              {ret.orderNumber}
            </Link>
          </span>
        }
        backHref="/orders/returns"
        backLabel={isTr ? "İadeler" : "Returns"}
        badges={
          <>
            <Badge tone={RETURN_STATUS_TONES[s]}>{returnStatusLabel(s, locale)}</Badge>
            <Badge tone={RETURN_RESOLUTION_TONES[ret.resolutionType]}>
              {returnResolutionLabel(ret.resolutionType, locale)}
            </Badge>
            <span className="text-xs text-white/30">
              {isTr ? "Talep" : "Requested"} · {formatDate(ret.requestedAt)}
            </span>
          </>
        }
        actions={actions}
      />

      {notice ? (
        <div className="mb-4">
          <Alert tone="success" action={<Button variant="ghost" size="sm" onClick={() => setNotice(null)}>{isTr ? "Kapat" : "Dismiss"}</Button>}>
            {notice}
          </Alert>
        </div>
      ) : null}
      {actionError ? (
        <div className="mb-4">
          <Alert tone="error" action={<Button variant="ghost" size="sm" onClick={() => setActionError(null)}>{isTr ? "Kapat" : "Dismiss"}</Button>}>
            {actionError}
          </Alert>
        </div>
      ) : null}

      <DetailLayout
        main={
          <>
            <SurfaceCard title={isTr ? "İade Kalemleri" : "Return items"}>
              <ul className="divide-y divide-white/[0.06]">
                {ret.items.map((item) => (
                  <ReturnItemRow key={item.id} item={item} currency={ret.currency} returnId={ret.id} locale={locale} />
                ))}
              </ul>
            </SurfaceCard>

            <SurfaceCard title={isTr ? "Durum Geçmişi" : "Status history"}>
              {ret.history.length === 0 ? (
                <p className="text-sm text-white/40">{isTr ? "Kayıt yok." : "No entries."}</p>
              ) : (
                <Timeline>
                  {ret.history.map((h, i) => (
                    <TimelineItem
                      key={`${h.toStatus}-${h.createdAt}-${i}`}
                      last={i === ret.history.length - 1}
                      tone="brand"
                      title={returnStatusLabel(h.toStatus, locale)}
                      meta={`${formatDate(h.createdAt)} · ${actorLabel(h.actorType, isTr)}`}
                      description={h.note ?? undefined}
                    />
                  ))}
                </Timeline>
              )}
            </SurfaceCard>

            {/* TODO-170 (ADR-270) — Para iadesi orijinal ödemeye ise iade defteri paneli.
                Aksiyon sonrası load() ile üst detay (ret.version/durum) tazelenir.
                TD-FR-7 ship-polish #1 — refreshKey inspect-decision/reject sonrası panelin
                KENDİ getRefundContext state'ini de tazeler (aksi halde elle yenileyene kadar
                eski "henüz para iadesi kaydı yok" görünümü kalırdı). */}
            {isRefundResolution(ret.resolutionType) ? (
              <RefundPanel
                returnId={ret.id}
                returnVersion={ret.version}
                locale={locale}
                onChanged={load}
                refreshKey={refreshKey}
              />
            ) : null}

            {/* TODO-173 (ADR-274) — reddedilen adet disposition + ters gönderi (para iadesinden AYRI). */}
            <ReverseShipmentPanel ret={ret} locale={locale} onChanged={load} />
          </>
        }
        rail={
          <>
            <RailCard title={isTr ? "Müşteri & Teslimat" : "Customer & shipping"}>
              <RailRow label={isTr ? "Ad" : "Name"} value={ret.customerName ?? "—"} />
              <RailRow label={isTr ? "E-posta" : "Email"} value={ret.customerEmail ?? "—"} />
              {ret.shippingAddress ? (
                <div className="mt-2 border-t border-white/[0.06] pt-2 text-sm text-white/60">
                  <p className="text-white/80">{ret.shippingAddress.fullName}</p>
                  <p>{ret.shippingAddress.addressLine1}</p>
                  {ret.shippingAddress.addressLine2 ? <p>{ret.shippingAddress.addressLine2}</p> : null}
                  <p>
                    {[ret.shippingAddress.district, ret.shippingAddress.city, ret.shippingAddress.postalCode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="uppercase text-white/40">{ret.shippingAddress.countryCode}</p>
                  {ret.shippingAddress.phone ? <p>{ret.shippingAddress.phone}</p> : null}
                </div>
              ) : null}
              {ret.returnCarrier || ret.returnTrackingNumber ? (
                <div className="mt-2 border-t border-white/[0.06] pt-2">
                  {/* TODO-169 recovery — takip bilgisi bu fazda YALNIZ müşteri "Ürünü kargoya verdim"
                      akışından set edilir; admin'e kaynağı açıkça göster. */}
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">
                    {isTr ? "Müşteri tarafından gönderildi" : "Shipped by customer"}
                  </p>
                  <RailRow label={isTr ? "İade kargo" : "Return carrier"} value={ret.returnCarrier ?? "—"} />
                  <RailRow label={isTr ? "Takip no" : "Tracking"} value={ret.returnTrackingNumber ?? "—"} />
                </div>
              ) : null}
            </RailCard>

            <RailCard title={isTr ? "Ödeme & İade Tutarı" : "Payment & refund"}>
              <RailRow
                label={isTr ? "Sipariş ödemesi" : "Order payment"}
                value={
                  <Badge tone={PAYMENT_STATUS_TONES[ret.orderPaymentStatus]}>
                    {paymentStatusLabel(ret.orderPaymentStatus, isTr)}
                  </Badge>
                }
              />
              <RailRow
                label={isTr ? "Kargo iadesi" : "Refund shipping"}
                value={ret.refundShipping ? (isTr ? "Evet" : "Yes") : isTr ? "Hayır" : "No"}
              />
              {ret.refundSummary ? (
                <div className="mt-2 border-t border-white/[0.06] pt-2">
                  {/* TODO-170 (ADR-272) — ledger-otoriteli semantik durum; tamamlanınca "beklemede" GÖSTERMEZ. */}
                  <RailRow
                    label={isTr ? "Para iadesi" : "Refund"}
                    value={
                      <Badge tone={REFUND_SUMMARY_TONE[ret.refundSummary.status]}>
                        <span aria-hidden="true">{REFUND_SUMMARY_GLYPH[ret.refundSummary.status]}</span>{" "}
                        {refundSummaryLabel(ret.refundSummary.status, isTr)}
                      </Badge>
                    }
                  />
                  <RailRow
                    label={isTr ? "Ürün" : "Product"}
                    value={formatMinor(ret.refundSummary.productRefundMinor, ret.refundSummary.currency)}
                  />
                  <RailRow
                    label={isTr ? "Kargo" : "Shipping"}
                    value={formatMinor(ret.refundSummary.shippingRefundMinor, ret.refundSummary.currency)}
                  />
                  <RailRow
                    label={isTr ? "KDV (dahil)" : "VAT (incl.)"}
                    value={formatMinor(ret.refundSummary.taxRefundMinor, ret.refundSummary.currency)}
                  />
                  <RailRow
                    label={isTr ? "Niyet toplamı" : "Intent total"}
                    value={
                      <span className="font-semibold text-white/90">
                        {formatMinor(ret.refundSummary.intentTotalMinor, ret.refundSummary.currency)}
                      </span>
                    }
                  />
                  {ret.refundSummary.status !== "INTENT_PENDING" && ret.refundSummary.status !== "CANCELLED" ? (
                    <>
                      <RailRow
                        label={isTr ? "Gerçekleşen iade" : "Refunded"}
                        value={
                          <span className="font-semibold text-emerald-300/90">
                            {formatMinor(ret.refundSummary.realizedRefundMinor, ret.refundSummary.currency)}
                          </span>
                        }
                      />
                      <RailRow
                        label={isTr ? "Kalan tahsilat" : "Remaining collected"}
                        value={formatMinor(ret.refundSummary.refundableRemainingMinor, ret.refundSummary.currency)}
                      />
                      {ret.refundSummary.completedAt ? (
                        <RailRow
                          label={isTr ? "Tamamlanma" : "Completed"}
                          value={formatDate(ret.refundSummary.completedAt)}
                        />
                      ) : null}
                      {ret.refundSummary.reference ? (
                        <RailRow
                          label={isTr ? "Referans" : "Reference"}
                          value={<span className="font-mono text-[11px] text-white/60">{ret.refundSummary.reference}</span>}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {ret.refundSummary.status === "INTENT_PENDING" ? (
                    <p className="mt-1 text-[11px] text-amber-300/70">
                      {isTr ? "Henüz tahsil edilmedi." : "Not yet collected."}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-white/30">
                  {isTr ? "Henüz iade niyeti oluşturulmadı." : "No refund intent yet."}
                </p>
              )}
            </RailCard>

            {ret.customerNote || ret.adminNote || ret.rejectionReason ? (
              <RailCard title={isTr ? "Notlar" : "Notes"}>
                {ret.customerNote ? (
                  <div className="mb-2">
                    <p className="text-[11px] uppercase tracking-wider text-white/40">{isTr ? "Müşteri notu" : "Customer note"}</p>
                    <p className="text-sm text-white/70">{ret.customerNote}</p>
                  </div>
                ) : null}
                {ret.adminNote ? (
                  <div className="mb-2">
                    <p className="text-[11px] uppercase tracking-wider text-white/40">{isTr ? "Yönetici notu" : "Admin note"}</p>
                    <p className="text-sm text-white/70">{ret.adminNote}</p>
                  </div>
                ) : null}
                {ret.rejectionReason ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-red-300/70">{isTr ? "Ret nedeni" : "Rejection reason"}</p>
                    <p className="text-sm text-white/70">{ret.rejectionReason}</p>
                  </div>
                ) : null}
              </RailCard>
            ) : null}
          </>
        }
      />

      {dialog === "reject" ? (
        <RejectDialog
          busy={busy}
          locale={locale}
          onClose={() => setDialog(null)}
          onSubmit={(rejectionReason, adminNote) =>
            void runAction(
              () => storeApi.rejectReturn(ret.id, { rejectionReason, expectedVersion: ret.version, ...(adminNote ? { adminNote } : {}) }),
              doneMsg,
            )
          }
        />
      ) : null}

      {dialog === "partial" ? (
        <PartialApproveDialog
          busy={busy}
          locale={locale}
          items={ret.items}
          onClose={() => setDialog(null)}
          onSubmit={(items, adminNote) =>
            void runAction(
              () => storeApi.approveReturn(ret.id, { items, expectedVersion: ret.version, ...(adminNote ? { adminNote } : {}) }),
              doneMsg,
            )
          }
        />
      ) : null}

      {dialog === "inspect" ? (
        // TD-FR-7 Faz 1 / Task 5 — inceleme = karar merkezi. Kabul: TEK aksiyonda
        // inspect-decision (inceleme kararı + kabul varsa refund otomatik başlar). Red:
        // backend state-machine'i RECEIVED/INSPECTION_REQUIRED → REJECTED'i doğrudan izin
        // vermez (yalnız INSPECTED → REJECTED izinli) — bu yüzden önce inspectReturn (→
        // INSPECTED) sonra rejectReturn (→ REJECTED) sıralı çağrılır (backend'e DOKUNULMADI;
        // mevcut iki route reuse edilir). İlk adım commit olduktan sonra ikinci adım HANGİ
        // SEBEPLE olursa olsun (ağ/5xx/version) başarısız olursa dialog AÇIK BIRAKILMAZ (Fix
        // round 1, Important #1 — açık kalırsa içindeki butonlar INSPECTED→INSPECTED
        // NO_CHANGE 409 ile kırılırdı); kapat + tazele ki üst aksiyon çubuğu (artık INSPECTED
        // için geçerli Reddet/İade sürecine al) devam yolunu sunabilsin.
        <InspectDialog
          busy={busy}
          locale={locale}
          items={ret.items}
          resolutionType={ret.resolutionType}
          onClose={() => setDialog(null)}
          onAccept={(items, adminNote) =>
            void runAction(
              () =>
                storeApi.inspectDecisionReturn(ret.id, {
                  items,
                  expectedVersion: ret.version,
                  ...(adminNote ? { adminNote } : {}),
                }),
              doneMsg,
              // TD-FR-7 ship-polish #1 — bu çağrı REFUND_TO_ORIGINAL_PAYMENT çözümünde para
              // iadesini backend'de otomatik başlatır; RefundPanel'in kendi context'i taze
              // olmalı. Hata dalında da bump edilir (backend REFUND_PENDING'e geçmiş ama
              // refund init başarısız olmuş olabilir — panel güncel gerçeği göstermeli).
              { refreshRefundPanel: true },
            )
          }
          onReject={(items, rejectionReason, adminNote) =>
            void runAction(
              async () => {
                // Fix round 1 (Important #2) — reddedilen bir iade satılabilir stoğa GİREMEZ (ürün
                // müşteride kalır / fiziksel iade Faz 3 ters-kargoya kadar gerçekleşmez). Dialog'daki
                // restock seçimi yalnız KABUL yolu için anlamlıdır; reddet çağrısında her kalemin
                // restockDecision'ını DO_NOT_RESTOCK'a zorluyoruz ki applyInspectionDecisions sessizce
                // stok artırmasın (phantom envanter / oversatış riski).
                const rejectItems = items.map((i) => ({ ...i, restockDecision: "DO_NOT_RESTOCK" as const }));
                const inspected = await storeApi.inspectReturn(ret.id, {
                  items: rejectItems,
                  expectedVersion: ret.version,
                  ...(adminNote ? { adminNote } : {}),
                });
                try {
                  return await storeApi.rejectReturn(ret.id, {
                    rejectionReason,
                    expectedVersion: inspected.return.version,
                  });
                } catch (error) {
                  // İnceleme adımı ZATEN commit edildi (INSPECTED) — reject adımı ne sebeple
                  // başarısız olursa olsun dialogu kapatıp taze detayı yüklüyoruz (VERSION_CONFLICT
                  // için runAction'ın kendi davranışını TÜM hata kodlarına genelliyoruz).
                  setDialog(null);
                  await load();
                  throw error;
                }
              },
              isTr ? "İade reddedildi." : "Return rejected.",
              // TD-FR-7 ship-polish #1 — reddetme öncesi inceleme kararı zaten commit
              // edilmiş olabilir; RefundPanel'in context'i (varsa) tazelenmeli.
              { refreshRefundPanel: true },
            )
          }
        />
      ) : null}

      {dialog === "refund" ? (
        <RefundDialog
          busy={busy}
          locale={locale}
          onClose={() => setDialog(null)}
          onSubmit={(refundShipping, adminNote) =>
            void runAction(
              () =>
                storeApi.transitionReturn(ret.id, {
                  targetStatus: "REFUND_PENDING",
                  refundShipping,
                  expectedVersion: ret.version,
                  ...(adminNote ? { adminNote } : {}),
                }),
              doneMsg,
            )
          }
        />
      ) : null}

      {dialog === "fast-refund" && fastCtx ? (
        <FastRefundDialog
          busy={busy}
          locale={locale}
          ctx={fastCtx}
          currency={ret.currency}
          onClose={() => setDialog(null)}
          onSubmit={(reason) =>
            void runAction(
              () => storeApi.fastRefund(ret.id, { reason, expectedVersion: ret.version }),
              isTr ? "Hızlı iade başlatıldı." : "Fast refund started.",
              // Refund backend'de otomatik başlar; RefundPanel + fast-refund context tazelenmeli.
              { refreshRefundPanel: true },
            )
          }
        />
      ) : null}
    </>
  );
}

// TODO-172 (ADR-273) — Fast Refund onay modalı. Zorunlu gerekçe + atlanan adımlar + tutar/limit +
// bounded risk özeti + açık uyarı (renk-tek-başına DEĞİL: ⚠ glyph + metin). Limit aşımı/uygunsuzlukta
// onay butonu kilitlenir ve "Normal iade akışına devam edin" yönlendirmesi gösterilir (CTA gizlenmez).
function FastRefundDialog({
  busy,
  locale,
  ctx,
  currency,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  locale: string;
  ctx: AdminReturnFastRefundContext;
  currency: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const isTr = locale === "tr";
  const [reason, setReason] = useState("");
  const reasonValid = reason.trim().length >= 3;
  const canConfirm = ctx.eligible && reasonValid && !busy;

  const stepLabel = (step: string): string => {
    const map: Record<string, [string, string]> = {
      CUSTOMER_RETURN_SHIPMENT: ["Müşterinin ürünü geri göndermesi", "Customer return shipment"],
      STORE_RECEIPT: ["Ürünün teslim alınması", "Store receipt"],
      INSPECTION: ["Ürün incelemesi", "Inspection"],
    };
    const entry = map[step];
    return entry ? (isTr ? entry[0] : entry[1]) : step;
  };

  const reasonMessage = (): string | null => {
    if (ctx.eligible) return null;
    switch (ctx.reasonCode) {
      case "FAST_REFUND_LIMIT_EXCEEDED":
        return isTr
          ? "İade tutarı hızlı iade limitini aşıyor. Normal iade akışına devam edin."
          : "The refund amount exceeds the fast-refund limit. Continue with the normal return flow.";
      case "FAST_REFUND_CURRENCY_MISMATCH":
        return isTr
          ? "Limit para birimi sipariş para birimiyle eşleşmiyor. Normal iade akışına devam edin."
          : "The limit currency does not match the order currency. Continue with the normal return flow.";
      case "FAST_REFUND_LIMIT_NOT_SET":
        return isTr
          ? "Hızlı iade limiti tanımlı değil. Normal iade akışına devam edin."
          : "No fast-refund limit is set. Continue with the normal return flow.";
      default:
        return isTr
          ? "Bu iade hızlı iadeye uygun değil. Normal iade akışına devam edin."
          : "This return is not eligible for fast refund. Continue with the normal return flow.";
    }
  };
  const blockMsg = reasonMessage();

  return (
    <Modal
      open
      onClose={onClose}
      title={isTr ? "Hızlı iade yap" : "Fast refund"}
      description={
        isTr
          ? "Teslim alma ve inceleme adımları atlanarak müşteriye doğrudan para iadesi yapılacak."
          : "The receiving and inspection steps will be skipped and the customer refunded directly."
      }
      closeLabel={isTr ? "Vazgeç" : "Cancel"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button variant="danger" disabled={!canConfirm} onClick={() => onSubmit(reason.trim())}>
            {busy
              ? isTr
                ? "İşleniyor…"
                : "Processing…"
              : isTr
                ? "Hızlı iadeyi onayla"
                : "Confirm fast refund"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Açık uyarı — renk-tek-başına DEĞİL: ⚠ glyph + metin (a11y). */}
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.08] p-3 text-sm text-amber-200"
        >
          <span aria-hidden className="mt-0.5">
            ⚠
          </span>
          <span>
            {isTr
              ? "Teslim alma ve inceleme adımları atlanarak müşteriye doğrudan para iadesi yapılacak. Bu işlem geri alınamaz."
              : "The receiving and inspection steps will be skipped and the customer refunded directly. This action cannot be undone."}
          </span>
        </div>

        {/* Atlanan adımlar */}
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-white/40">
            {isTr ? "Atlanan adımlar" : "Skipped steps"}
          </div>
          <ul className="space-y-1 text-sm text-white/80">
            {ctx.skippedSteps.map((step) => (
              <li key={step} className="flex items-center gap-2">
                <span aria-hidden className="text-white/30">
                  ⏭
                </span>
                {stepLabel(step)}
              </li>
            ))}
          </ul>
        </div>

        {/* Tutar + limit + risk özeti */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-white/50">{isTr ? "İade tutarı" : "Refund amount"}</dt>
          <dd className="text-right font-medium text-white/90">
            {formatMinorMoney(ctx.refundAmountMinor, currency, locale)}
          </dd>
          <dt className="text-white/50">{isTr ? "Sipariş toplamı" : "Order total"}</dt>
          <dd className="text-right text-white/80">
            {formatMinorMoney(ctx.orderTotalMinor, currency, locale)}
          </dd>
          <dt className="text-white/50">{isTr ? "Hızlı iade limiti" : "Fast-refund limit"}</dt>
          <dd className="text-right text-white/80">
            {ctx.limitMinor === null ? "—" : formatMinorMoney(ctx.limitMinor, ctx.currency, locale)}
          </dd>
          <dt className="text-white/50">{isTr ? "Müşteri sipariş sayısı" : "Customer orders"}</dt>
          <dd className="text-right text-white/80">{ctx.customerOrderCount}</dd>
          <dt className="text-white/50">{isTr ? "Müşteri iade sayısı" : "Customer returns"}</dt>
          <dd className="text-right text-white/80">{ctx.customerReturnCount}</dd>
          <dt className="text-white/50">
            {isTr ? "Son 90 gün hızlı iade" : "Fast refunds (90 days)"}
          </dt>
          <dd className="text-right text-white/80">{ctx.fastRefundsLast90Days}</dd>
          <dt className="text-white/50">{isTr ? "Teslim alındı" : "Received"}</dt>
          <dd className="text-right text-white/80">
            {ctx.deliveryReceived ? (isTr ? "Evet" : "Yes") : isTr ? "Hayır" : "No"}
          </dd>
          <dt className="text-white/50">{isTr ? "İnceleme yapıldı" : "Inspected"}</dt>
          <dd className="text-right text-white/80">
            {ctx.inspectionDone ? (isTr ? "Evet" : "Yes") : isTr ? "Hayır" : "No"}
          </dd>
        </dl>

        {/* Limit aşımı / uygunsuzluk — CTA gizlenmez; neden açık gösterilir + normal akışa yönlendir. */}
        {blockMsg ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/[0.08] p-3 text-sm text-rose-200"
          >
            <span aria-hidden className="mt-0.5">
              ⛔
            </span>
            <span>{blockMsg}</span>
          </div>
        ) : null}

        <Textarea
          id="fast-refund-reason"
          label={isTr ? "Gerekçe" : "Reason"}
          required
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function actorLabel(actor: "CUSTOMER" | "ADMIN" | "SYSTEM", isTr: boolean): string {
  if (actor === "CUSTOMER") return isTr ? "Müşteri" : "Customer";
  if (actor === "ADMIN") return isTr ? "Yönetici" : "Admin";
  return isTr ? "Sistem" : "System";
}

function ReturnItemRow({
  item,
  currency,
  returnId,
  locale,
}: {
  item: AdminReturnItem;
  currency: string;
  returnId: string;
  locale: string;
}) {
  const isTr = locale === "tr";
  const remaining = Math.max(0, item.purchasedQuantity - item.priorReturnedQuantity - item.quantity);
  return (
    <li className="flex gap-3 py-3">
      {/* TODO-169 (blocker #3) — kapak görseli (store-scoped); yoksa ortak monogram placeholder. */}
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03]">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="font-serif text-lg text-white/25">
            {(item.title.trim()[0] ?? "?").toLocaleUpperCase(locale === "tr" ? "tr" : "en")}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white/90">{item.title}</p>
            {item.variantTitle ? <p className="truncate text-xs text-white/40">{item.variantTitle}</p> : null}
            <p className="font-mono text-xs text-white/30">{item.sku}</p>
          </div>
          <Badge tone={RETURN_REASON_TONES[item.reason]}>{returnReasonLabel(item.reason, locale)}</Badge>
        </div>

        {item.customerComment ? (
          <p className="mt-1 text-sm text-white/50">“{item.customerComment}”</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
          <span>
            {isTr ? "İade adedi" : "Return qty"}: <span className="text-white/70">{item.quantity}</span>
          </span>
          {item.approvedQuantity !== null ? (
            <span>
              {isTr ? "Onaylanan" : "Approved"}: <span className="text-emerald-300/90">{item.approvedQuantity}</span>
            </span>
          ) : null}
          {item.rejectedQuantity !== null && item.rejectedQuantity > 0 ? (
            <span>
              {isTr ? "Reddedilen" : "Rejected"}: <span className="text-red-300/90">{item.rejectedQuantity}</span>
            </span>
          ) : null}
          <span>
            {isTr ? "Birim" : "Unit"}: <span className="text-white/70">{formatMinor(item.unitPriceMinor, currency)}</span>
          </span>
          <span>
            {isTr ? "Satın alınan" : "Purchased"}: {item.purchasedQuantity}
          </span>
          <span>
            {isTr ? "Önceki iade" : "Prior returned"}: {item.priorReturnedQuantity}
          </span>
          <span>
            {isTr ? "Kalan iade edilebilir" : "Remaining returnable"}:{" "}
            <span className="text-white/70">{remaining}</span>
          </span>
        </div>

        {item.conditionStatus || item.inspectionResult || item.restockDecision ? (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {item.conditionStatus ? (
              <Badge tone="neutral">{returnConditionLabel(item.conditionStatus, locale)}</Badge>
            ) : null}
            {item.inspectionResult ? (
              <Badge tone={item.inspectionResult === "PASSED" ? "success" : item.inspectionResult === "FAILED" ? "danger" : "warning"}>
                {returnInspectionLabel(item.inspectionResult, locale)}
              </Badge>
            ) : null}
            {item.restockDecision ? (
              <Badge tone={item.restockDecision === "RESTOCK_AS_SELLABLE" ? "success" : "neutral"}>
                {returnRestockLabel(item.restockDecision, locale)}
              </Badge>
            ) : null}
            {item.restockedAt ? (
              <span className="text-xs text-white/30">{isTr ? "Stoğa alındı" : "Restocked"} · {formatDate(item.restockedAt)}</span>
            ) : null}
          </div>
        ) : null}

        {item.attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {item.attachments.map((att) => (
              <a
                key={att.id}
                href={`/api/orders/returns/${returnId}/attachments/${att.id}`}
                target="_blank"
                rel="noreferrer"
                className="block h-12 w-12 overflow-hidden rounded-md border border-white/[0.1] bg-white/[0.03]"
              >
                <img
                  src={`/api/orders/returns/${returnId}/attachments/${att.id}`}
                  alt={isTr ? "İade fotoğrafı" : "Return photo"}
                  className="h-full w-full object-cover"
                />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function RejectDialog({
  busy,
  locale,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  locale: string;
  onClose: () => void;
  onSubmit: (rejectionReason: string, adminNote?: string) => void;
}) {
  const isTr = locale === "tr";
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const valid = reason.trim().length > 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={isTr ? "İadeyi reddet" : "Reject return"}
      description={isTr ? "Ret nedeni zorunludur ve müşteriye görünür." : "A rejection reason is required and visible to the customer."}
      closeLabel={isTr ? "Vazgeç" : "Cancel"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button variant="danger" disabled={busy || !valid} onClick={() => onSubmit(reason.trim(), note.trim() || undefined)}>
            {busy ? (isTr ? "Reddediliyor…" : "Rejecting…") : isTr ? "Reddet" : "Reject"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Textarea
          id="reject-reason"
          label={isTr ? "Ret nedeni" : "Rejection reason"}
          required
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Textarea
          id="reject-note"
          label={isTr ? "Yönetici notu (opsiyonel, müşteriye görünmez)" : "Admin note (optional, internal)"}
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function PartialApproveDialog({
  busy,
  locale,
  items,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  locale: string;
  items: AdminReturnItem[];
  onClose: () => void;
  onSubmit: (items: { returnItemId: string; approvedQuantity: number }[], adminNote?: string) => void;
}) {
  const isTr = locale === "tr";
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, String(i.quantity)])),
  );
  const [note, setNote] = useState("");
  const parsed = items.map((i) => ({
    returnItemId: i.id,
    approvedQuantity: Number(qty[i.id] ?? "0"),
    max: i.quantity,
  }));
  const valid = parsed.every(
    (p) => Number.isInteger(p.approvedQuantity) && p.approvedQuantity >= 0 && p.approvedQuantity <= p.max,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={isTr ? "Kısmi onay" : "Partial approval"}
      description={isTr ? "Kalem başına onaylanan adedi belirleyin (0 = reddedildi)." : "Set approved quantity per item (0 = rejected)."}
      closeLabel={isTr ? "Vazgeç" : "Cancel"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={() =>
              onSubmit(
                parsed.map((p) => ({ returnItemId: p.returnItemId, approvedQuantity: p.approvedQuantity })),
                note.trim() || undefined,
              )
            }
          >
            {busy ? (isTr ? "Onaylanıyor…" : "Approving…") : isTr ? "Onayla" : "Approve"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.id} className="grid grid-cols-[1fr_6rem] items-end gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-white/80">{i.title}</p>
              <p className="text-xs text-white/40">{isTr ? "İstenen" : "Requested"}: {i.quantity}</p>
            </div>
            <Input
              id={`approve-${i.id}`}
              type="number"
              min={0}
              max={i.quantity}
              label={isTr ? "Onay" : "Approve"}
              value={qty[i.id] ?? ""}
              onChange={(e) => setQty((prev) => ({ ...prev, [i.id]: e.target.value }))}
            />
          </div>
        ))}
        <Textarea
          id="partial-note"
          label={isTr ? "Yönetici notu (opsiyonel)" : "Admin note (optional)"}
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

type InspectItemDecision = {
  returnItemId: string;
  conditionStatus: ReturnConditionStatus;
  inspectionResult: ReturnInspectionResult;
  restockDecision: ReturnRestockDecision;
};

/**
 * TD-FR-7 Faz 1 / Task 5 — inceleme = karar merkezi. Kalem başına fiziksel durum/sonuç/stok
 * kararı hâlâ burada girilir (Faz 1'de approvedQuantity'ye DOKUNMAZ, o approve aşamasında
 * sabitlenmiştir). Ama sonuç artık "kaydet" değil — admin ya kabul edip (İadeyi yap → refund
 * otomatik başlar) ya da gerekçeli reddeder (Reddet). İki karar da açıkça ayrı CTA'lar: birincil
 * = gerçek karar (İadeyi yap), yıkıcı = açık confirmation (Reddet, ret nedeni zorunlu).
 */
function InspectDialog({
  busy,
  locale,
  items,
  resolutionType,
  onClose,
  onAccept,
  onReject,
}: {
  busy: boolean;
  locale: string;
  items: AdminReturnItem[];
  resolutionType: ReturnResolutionType;
  onClose: () => void;
  onAccept: (items: InspectItemDecision[], adminNote?: string) => void;
  onReject: (items: InspectItemDecision[], rejectionReason: string, adminNote?: string) => void;
}) {
  const isTr = locale === "tr";
  // Fix round 1 (Important #2) — accept'in "İadeyi yap" birincil aksiyonu YALNIZ
  // REFUND_TO_ORIGINAL_PAYMENT çözümünde para iadesini otomatik başlatır (backend
  // advanceInspectedToRefundPending resolutionType kontrolü yapar). REPLACEMENT çözümünde
  // aynı çağrı yalnız inceleme kararını kaydeder (INSPECTED'de kalır) — admin ayrıca üstteki
  // "Değişim sürecine al" butonuna tıklamalıdır. Copy bunu YANLIŞ VAAT ETMEDEN yansıtır.
  // TODO-175 — nötr "REFUND" çözümü de refund-yoludur (hedef ayrı alanda); modül helper'ıyla kapsanır.
  const isRefund = isRefundResolution(resolutionType);
  const [rows, setRows] = useState<
    Record<string, { condition: ReturnConditionStatus; inspection: ReturnInspectionResult; restock: ReturnRestockDecision }>
  >(() =>
    Object.fromEntries(
      items.map((i) => [
        i.id,
        {
          condition: (i.conditionStatus ?? "NEW_UNOPENED") as ReturnConditionStatus,
          inspection: (i.inspectionResult ?? "PASSED") as ReturnInspectionResult,
          restock: (i.restockDecision ?? "RESTOCK_AS_SELLABLE") as ReturnRestockDecision,
        },
      ]),
    ),
  );
  const [note, setNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const canReject = rejectionReason.trim().length > 0;

  const itemDecisions = (): InspectItemDecision[] =>
    items.map((i) => ({
      returnItemId: i.id,
      conditionStatus: rows[i.id].condition,
      inspectionResult: rows[i.id].inspection,
      restockDecision: rows[i.id].restock,
    }));

  return (
    <Modal
      open
      onClose={onClose}
      title={isTr ? "İnceleme sonucu" : "Inspection result"}
      description={
        isRefund
          ? isTr
            ? "Kalem başına durum, sonuç ve stok kararı. Yalnız 'Satılabilir stoğa al' stok artırır. Ardından iadeyi kabul edip para iadesini başlatın veya gerekçeli şekilde reddedin."
            : "Per-item condition, result and restock decision. Only 'Restock as sellable' increments stock. Then either accept the return to start the refund, or reject it with a reason."
          : isTr
            ? "Kalem başına durum, sonuç ve stok kararı. Yalnız 'Satılabilir stoğa al' stok artırır. Bu, para iadesi başlatmaz — kaydettikten sonra değişimi başlatmak için üstteki 'Değişim sürecine al' butonunu kullanın; ya da gerekçeli şekilde reddedin."
            : "Per-item condition, result and restock decision. Only 'Restock as sellable' increments stock. This does not start a refund — after saving, use 'Move to replacement' above to proceed, or reject it with a reason."
      }
      closeLabel={isTr ? "Vazgeç" : "Cancel"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button
            variant="danger"
            disabled={busy || !canReject}
            onClick={() => onReject(itemDecisions(), rejectionReason.trim(), note.trim() || undefined)}
          >
            {busy ? (isTr ? "Reddediliyor…" : "Rejecting…") : isTr ? "Reddet" : "Reject"}
          </Button>
          <Button disabled={busy} onClick={() => onAccept(itemDecisions(), note.trim() || undefined)}>
            {isRefund
              ? busy
                ? isTr
                  ? "İşleniyor…"
                  : "Processing…"
                : isTr
                  ? "İadeyi yap"
                  : "Complete return"
              : busy
                ? isTr
                  ? "Kaydediliyor…"
                  : "Saving…"
                : isTr
                  ? "İncelemeyi kaydet"
                  : "Save inspection"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {items.map((i) => (
          <div key={i.id} className="rounded-lg border border-white/[0.07] p-3">
            <p className="mb-2 truncate text-sm font-medium text-white/80">{i.title}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Select
                id={`cond-${i.id}`}
                label={isTr ? "Durum" : "Condition"}
                value={rows[i.id].condition}
                onChange={(e) =>
                  setRows((prev) => ({ ...prev, [i.id]: { ...prev[i.id], condition: e.target.value as ReturnConditionStatus } }))
                }
                options={RETURN_CONDITION_VALUES.map((v) => ({ value: v, label: returnConditionLabel(v, locale) }))}
              />
              <Select
                id={`insp-${i.id}`}
                label={isTr ? "Sonuç" : "Result"}
                value={rows[i.id].inspection}
                onChange={(e) =>
                  setRows((prev) => ({ ...prev, [i.id]: { ...prev[i.id], inspection: e.target.value as ReturnInspectionResult } }))
                }
                options={RETURN_INSPECTION_VALUES.map((v) => ({ value: v, label: returnInspectionLabel(v, locale) }))}
              />
              <Select
                id={`rest-${i.id}`}
                label={isTr ? "Stok kararı" : "Restock"}
                value={rows[i.id].restock}
                onChange={(e) =>
                  setRows((prev) => ({ ...prev, [i.id]: { ...prev[i.id], restock: e.target.value as ReturnRestockDecision } }))
                }
                options={RETURN_RESTOCK_VALUES.map((v) => ({ value: v, label: returnRestockLabel(v, locale) }))}
              />
            </div>
          </div>
        ))}
        <Textarea
          id="inspect-note"
          label={isTr ? "Yönetici notu (opsiyonel)" : "Admin note (optional)"}
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Textarea
          id="inspect-reject-reason"
          label={
            isTr
              ? "Ret nedeni (yalnız 'Reddet' için zorunlu, müşteriye görünür)"
              : "Rejection reason (required only to Reject, visible to the customer)"
          }
          rows={2}
          maxLength={1000}
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function RefundDialog({
  busy,
  locale,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  locale: string;
  onClose: () => void;
  onSubmit: (refundShipping: boolean, adminNote?: string) => void;
}) {
  const isTr = locale === "tr";
  const [refundShipping, setRefundShipping] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={isTr ? "İade sürecine al" : "Move to refund"}
      description={
        isTr
          ? "İade talebi para iadesi aşamasına alınır ve iade tutarı hesaplanır. Parayı iade etmek için aşağıdaki İade Defteri panelinden “Para iadesini başlat”ı kullanın."
          : "The return moves to the refund stage and the refund amount is calculated. Use “Start refund” in the Refund ledger panel below to actually refund the money."
      }
      closeLabel={isTr ? "Vazgeç" : "Cancel"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button disabled={busy} onClick={() => onSubmit(refundShipping, note.trim() || undefined)}>
            {busy ? (isTr ? "İşleniyor…" : "Processing…") : isTr ? "Onayla" : "Confirm"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-transparent"
            checked={refundShipping}
            onChange={(e) => setRefundShipping(e.target.checked)}
          />
          {isTr ? "Kargo bedelini de iade et" : "Also refund shipping cost"}
        </label>
        <Textarea
          id="refund-note"
          label={isTr ? "Yönetici notu (opsiyonel)" : "Admin note (optional)"}
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}
