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
import type { AdminReturnDetail, AdminReturnItem } from "@commerce-os/api-client";
import { storeApi } from "../../../../../lib/client/api";
import { messageForError } from "../../../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../../../lib/client/format";
import {
  DetailHero,
  DetailLayout,
  RailCard,
  RailRow,
  SurfaceCard,
  Timeline,
  TimelineItem,
} from "../../../../components/premium";
import {
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
  canReviewReturn,
  canApproveReturn,
  canRejectReturn,
  canAwaitShipment,
  canReceiveReturn,
  canInspectReturn,
  canRefundPending,
  canReplacementPending,
  canCloseReturn,
  type Tone,
  type ReturnConditionStatus,
  type ReturnInspectionResult,
  type ReturnRestockDecision,
} from "../../order-shared";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; ret: AdminReturnDetail };

type Dialog = "reject" | "partial" | "inspect" | "refund" | null;

const PAYMENT_TONES: Record<AdminReturnDetail["orderPaymentStatus"], Tone> = {
  UNPAID: "warning",
  AUTHORIZED: "info",
  PAID: "success",
  REFUNDED: "neutral",
};

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

  // Aksiyon sonucu güncel detay döner → doğrudan state'e yansıt (ekstra fetch yok).
  const runAction = useCallback(
    async (fn: () => Promise<{ return: AdminReturnDetail }>, successMsg: string) => {
      setActionError(null);
      setBusy(true);
      try {
        const result = await fn();
        setState({ status: "ready", ret: result.return });
        setNotice(successMsg);
        setDialog(null);
      } catch (error) {
        setActionError(messageForError(error, locale));
      } finally {
        setBusy(false);
      }
    },
    [locale],
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
      {canReviewReturn(s) ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void runAction(
              () => storeApi.transitionReturn(ret.id, { targetStatus: "UNDER_REVIEW" }),
              doneMsg,
            )
          }
        >
          {isTr ? "İncelemeye al" : "Start review"}
        </Button>
      ) : null}
      {canApproveReturn(s) ? (
        <>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void runAction(() => storeApi.approveReturn(ret.id, {}), doneMsg)}
          >
            {isTr ? "Tamamen onayla" : "Approve all"}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog("partial")}>
            {isTr ? "Kısmi onayla" : "Partial approve"}
          </Button>
        </>
      ) : null}
      {canAwaitShipment(s) ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void runAction(
              () => storeApi.transitionReturn(ret.id, { targetStatus: "AWAITING_SHIPMENT" }),
              doneMsg,
            )
          }
        >
          {isTr ? "Gönderim bekleniyor" : "Await shipment"}
        </Button>
      ) : null}
      {canReceiveReturn(s) ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void runAction(
              () => storeApi.transitionReturn(ret.id, { targetStatus: "RECEIVED" }),
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
      {canRefundPending(s) && ret.resolutionType === "REFUND_TO_ORIGINAL_PAYMENT" ? (
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
              () => storeApi.transitionReturn(ret.id, { targetStatus: "REPLACEMENT_PENDING" }),
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
      {canCloseReturn(s) ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void runAction(
              () => storeApi.transitionReturn(ret.id, { targetStatus: "CLOSED" }),
              doneMsg,
            )
          }
        >
          {isTr ? "Kapat" : "Close"}
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
          <Alert tone="success" action={<button type="button" className="text-emerald-300 underline" onClick={() => setNotice(null)}>{isTr ? "Kapat" : "Dismiss"}</button>}>
            {notice}
          </Alert>
        </div>
      ) : null}
      {actionError ? (
        <div className="mb-4">
          <Alert tone="error" action={<button type="button" className="text-red-300 underline" onClick={() => setActionError(null)}>{isTr ? "Kapat" : "Dismiss"}</button>}>
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
                  <RailRow label={isTr ? "İade kargo" : "Return carrier"} value={ret.returnCarrier ?? "—"} />
                  <RailRow label={isTr ? "Takip no" : "Tracking"} value={ret.returnTrackingNumber ?? "—"} />
                </div>
              ) : null}
            </RailCard>

            <RailCard title={isTr ? "Ödeme & İade Tutarı" : "Payment & refund"}>
              <RailRow
                label={isTr ? "Sipariş ödemesi" : "Order payment"}
                value={<Badge tone={PAYMENT_TONES[ret.orderPaymentStatus]}>{ret.orderPaymentStatus}</Badge>}
              />
              <RailRow
                label={isTr ? "Kargo iadesi" : "Refund shipping"}
                value={ret.refundShipping ? (isTr ? "Evet" : "Yes") : isTr ? "Hayır" : "No"}
              />
              {ret.refundIntent ? (
                <div className="mt-2 border-t border-white/[0.06] pt-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">
                    {isTr
                      ? "İade Niyeti (beklemede) — henüz tahsil edilmedi"
                      : "Refund Intent (pending) — not yet collected"}
                  </p>
                  <RailRow
                    label={isTr ? "Ürün" : "Product"}
                    value={formatMinor(ret.refundIntent.productRefundMinor, ret.refundIntent.currency)}
                  />
                  <RailRow
                    label={isTr ? "Kargo" : "Shipping"}
                    value={formatMinor(ret.refundIntent.shippingRefundMinor, ret.refundIntent.currency)}
                  />
                  <RailRow
                    label={isTr ? "KDV (dahil)" : "VAT (incl.)"}
                    value={formatMinor(ret.refundIntent.taxRefundMinor, ret.refundIntent.currency)}
                  />
                  <RailRow
                    label={isTr ? "Toplam" : "Total"}
                    value={
                      <span className="font-semibold text-white/90">
                        {formatMinor(ret.refundIntent.totalRefundMinor, ret.refundIntent.currency)}
                      </span>
                    }
                  />
                  <RailRow label={isTr ? "Durum" : "Status"} value={ret.refundIntent.status} />
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
              () => storeApi.rejectReturn(ret.id, { rejectionReason, ...(adminNote ? { adminNote } : {}) }),
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
              () => storeApi.approveReturn(ret.id, { items, ...(adminNote ? { adminNote } : {}) }),
              doneMsg,
            )
          }
        />
      ) : null}

      {dialog === "inspect" ? (
        <InspectDialog
          busy={busy}
          locale={locale}
          items={ret.items}
          onClose={() => setDialog(null)}
          onSubmit={(items, adminNote) =>
            void runAction(
              () => storeApi.inspectReturn(ret.id, { items, ...(adminNote ? { adminNote } : {}) }),
              doneMsg,
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
                  ...(adminNote ? { adminNote } : {}),
                }),
              doneMsg,
            )
          }
        />
      ) : null}
    </>
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
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03]">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
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

function InspectDialog({
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
  onSubmit: (
    items: {
      returnItemId: string;
      conditionStatus: ReturnConditionStatus;
      inspectionResult: ReturnInspectionResult;
      restockDecision: ReturnRestockDecision;
    }[],
    adminNote?: string,
  ) => void;
}) {
  const isTr = locale === "tr";
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
  return (
    <Modal
      open
      onClose={onClose}
      title={isTr ? "İnceleme sonucu" : "Inspection result"}
      description={
        isTr
          ? "Kalem başına durum, sonuç ve stok kararı. Yalnız 'Satılabilir stoğa al' stok artırır."
          : "Per-item condition, result and restock decision. Only 'Restock as sellable' increments stock."
      }
      closeLabel={isTr ? "Vazgeç" : "Cancel"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              onSubmit(
                items.map((i) => ({
                  returnItemId: i.id,
                  conditionStatus: rows[i.id].condition,
                  inspectionResult: rows[i.id].inspection,
                  restockDecision: rows[i.id].restock,
                })),
                note.trim() || undefined,
              )
            }
          >
            {busy ? (isTr ? "Kaydediliyor…" : "Saving…") : isTr ? "Kaydet" : "Save"}
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
          ? "İade niyeti (beklemede) güncellenir. Para hareketi bu aşamada YAPILMAZ (TODO-170)."
          : "The refund intent (pending) is refreshed. No money moves at this stage (TODO-170)."
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
