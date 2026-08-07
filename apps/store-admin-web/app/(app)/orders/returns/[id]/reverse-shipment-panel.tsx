"use client";

import { useState } from "react";
import { Alert, Badge, Button, Input, Modal, Select, Textarea } from "../../../../../components/ui";
import { SurfaceCard } from "../../../../components/premium";
import { storeApi } from "../../../../../lib/client/api";
import type { AdminReturnDetail } from "@commerce-os/api-client";
import { messageForError } from "../../../../../lib/client/messages";
import { formatDate } from "../../../../../lib/client/format";
import type { Locale } from "@commerce-os/i18n";

/**
 * TODO-173 (ADR-274) — Reddedilen adet disposition + reverse shipment (STORE_RETURN_TO_CUSTOMER) paneli.
 *
 * İnceleme sonrası reddedilen (rejectedQuantity) ürün için admin bir disposition seçer (müşteriye geri
 * gönder / imha / tedarikçiye / mağazada tut / iletişim). YALNIZ "müşteriye geri gönder" bir ters gönderi
 * oluşturabilir. Bu PARA İADESİ DEĞİLDİR — ürün müşteriye geri gönderilir.
 *
 * Erişilebilirlik: durum renk + metin etiketiyle iletilir; quantity/carrier/tracking alanları label'lı;
 * yıkıcı onay modalinde açık uyarı; hata özeti role=alert. Güvenlik: internal reason yalnız admin yüzeyinde.
 */

type ItemRow = AdminReturnDetail["items"][number];
type Disposition = ItemRow["dispositions"][number];
type ReverseShipment = ItemRow["reverseShipments"][number];

const DISPOSITION_LABELS: Record<Disposition["type"], { tr: string; en: string }> = {
  RETURN_TO_CUSTOMER: { tr: "Müşteriye geri gönder", en: "Return to customer" },
  DESTROY: { tr: "İmha et", en: "Destroy" },
  SEND_TO_VENDOR: { tr: "Tedarikçiye gönder", en: "Send to vendor" },
  KEEP_IN_STORE: { tr: "Mağazada tut", en: "Keep in store" },
  CONTACT_CUSTOMER: { tr: "Müşteriyle iletişim gerekli", en: "Contact customer" },
};

const DISPOSITION_STATUS: Record<Disposition["status"], { tr: string; en: string; tone: "neutral" | "success" | "warning" }> = {
  PENDING: { tr: "Beklemede", en: "Pending", tone: "warning" },
  COMPLETED: { tr: "Tamamlandı", en: "Completed", tone: "success" },
  CANCELLED: { tr: "İptal edildi", en: "Cancelled", tone: "neutral" },
};

// Ters gönderi durumu: renk + metin + glif (renk TEK BAŞINA taşımaz).
const SHIP_STATUS: Record<string, { tr: string; en: string; glyph: string; tone: "neutral" | "info" | "success" | "danger" | "warning" }> = {
  DRAFT: { tr: "Oluşturuldu", en: "Created", glyph: "○", tone: "neutral" },
  IN_TRANSIT: { tr: "Kargoya verildi", en: "Shipped", glyph: "◐", tone: "info" },
  OUT_FOR_DELIVERY: { tr: "Dağıtımda", en: "Out for delivery", glyph: "◑", tone: "info" },
  DELIVERED: { tr: "Teslim edildi", en: "Delivered", glyph: "✓", tone: "success" },
  DELIVERY_FAILED: { tr: "Teslim edilemedi", en: "Delivery failed", glyph: "!", tone: "warning" },
  CANCELLED: { tr: "İptal edildi", en: "Cancelled", glyph: "⊘", tone: "neutral" },
  FAILED: { tr: "Başarısız", en: "Failed", glyph: "✕", tone: "danger" },
};

type Dialog =
  | { kind: "disposition"; item: ItemRow }
  | { kind: "reverse"; item: ItemRow }
  | { kind: "tracking"; shipment: ReverseShipment }
  | { kind: "cancel-disposition"; disposition: Disposition }
  | { kind: "cancel-shipment"; shipment: ReverseShipment }
  | null;

export function ReverseShipmentPanel({
  ret,
  locale,
  onChanged,
}: {
  ret: AdminReturnDetail;
  locale: Locale;
  onChanged: () => Promise<void> | void;
}) {
  const isTr = locale === "tr";
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rejectedItems = ret.items.filter((i) => (i.rejectedQuantity ?? 0) > 0);
  if (rejectedItems.length === 0) return null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
      setDialog(null);
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SurfaceCard
      title={isTr ? "Reddedilen Ürünler & Ters Gönderi" : "Rejected items & reverse shipment"}
      description={
        isTr
          ? "Reddedilen adet için karar verin. Müşteriye geri gönderme PARA İADESİ DEĞİLDİR."
          : "Decide disposition for rejected quantity. Returning to customer is NOT a refund."
      }
    >
      {error ? (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      ) : null}
      <ul className="divide-y divide-white/[0.06]">
        {rejectedItems.map((item) => (
          <li key={item.id} className="py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/90">
                  {item.title}
                  {item.variantTitle ? <span className="text-white/50"> · {item.variantTitle}</span> : null}
                </p>
                <p className="text-xs text-white/50">
                  {isTr ? "Reddedilen" : "Rejected"}: <strong>{item.rejectedQuantity}</strong>
                  {" · "}
                  {isTr ? "Karar bekleyen" : "Undecided"}: <strong>{item.undispositionedRejectedQuantity}</strong>
                </p>
              </div>
              {item.undispositionedRejectedQuantity > 0 ? (
                <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setDialog({ kind: "disposition", item })}>
                  {isTr ? "Disposition ekle" : "Add disposition"}
                </Button>
              ) : null}
            </div>

            {/* Disposition kararları */}
            {item.dispositions.length > 0 ? (
              <ul className="space-y-1.5">
                {item.dispositions.map((d) => {
                  const st = DISPOSITION_STATUS[d.status];
                  return (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone={st.tone} dot>{isTr ? st.tr : st.en}</Badge>
                        <span className="text-white/80">
                          {isTr ? DISPOSITION_LABELS[d.type].tr : DISPOSITION_LABELS[d.type].en} × {d.quantity}
                        </span>
                        {d.type === "RETURN_TO_CUSTOMER" && d.status !== "CANCELLED" ? (
                          <span className="text-white/40">
                            ({isTr ? "kalan gönderilebilir" : "shippable left"}: {d.reverseShippableRemaining})
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {d.type === "RETURN_TO_CUSTOMER" && d.reverseShippableRemaining > 0 ? (
                          <Button size="sm" variant="primary" onClick={() => setDialog({ kind: "reverse", item })}>
                            {isTr ? "Müşteriye geri gönder" : "Return to customer"}
                          </Button>
                        ) : null}
                        {d.status === "PENDING" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setDialog({ kind: "cancel-disposition", disposition: d })}
                          >
                            {isTr ? "İptal" : "Cancel"}
                          </Button>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {/* Ters gönderiler */}
            {item.reverseShipments.length > 0 ? (
              <ul className="space-y-2 rounded-lg bg-white/[0.02] p-3">
                {item.reverseShipments.map((s) => (
                  <ReverseShipmentRow
                    key={s.id}
                    shipment={s}
                    returnId={ret.id}
                    isTr={isTr}
                    busy={busy}
                    onStatus={(status) =>
                      run(() => storeApi.reverseShipmentStatus(ret.id, s.id, { status }))
                    }
                    onTracking={() => setDialog({ kind: "tracking", shipment: s })}
                    onCancel={() => setDialog({ kind: "cancel-shipment", shipment: s })}
                  />
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {dialog?.kind === "disposition" ? (
        <DispositionDialog
          item={dialog.item}
          isTr={isTr}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(input) => run(() => storeApi.setReturnDisposition(ret.id, { ...input, expectedVersion: ret.version }))}
        />
      ) : null}

      {dialog?.kind === "reverse" ? (
        <ReverseDialog
          item={dialog.item}
          shippingAddress={ret.shippingAddress}
          isTr={isTr}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(input) =>
            run(() => storeApi.createReverseShipment(ret.id, { ...input, returnItemId: dialog.item.id, expectedVersion: ret.version }))
          }
        />
      ) : null}

      {dialog?.kind === "tracking" ? (
        <TrackingDialog
          shipment={dialog.shipment}
          isTr={isTr}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(input) => run(() => storeApi.reverseShipmentTracking(ret.id, dialog.shipment.id, input))}
        />
      ) : null}

      {/* Yıkıcı iptaller onay adımından geçer (refund panel standardı). */}
      {dialog?.kind === "cancel-disposition" ? (
        <ConfirmDialog
          isTr={isTr}
          busy={busy}
          danger
          title={isTr ? "Kararı iptal et" : "Cancel disposition"}
          description={isTr ? "Bu bekleyen karar iptal edilecek." : "This pending disposition will be cancelled."}
          confirmLabel={isTr ? "Kararı iptal et" : "Cancel disposition"}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            run(() =>
              storeApi.cancelReturnDisposition(ret.id, dialog.disposition.id, {
                dispositionId: dialog.disposition.id,
                expectedVersion: ret.version,
              }),
            )
          }
        />
      ) : null}

      {dialog?.kind === "cancel-shipment" ? (
        <ConfirmDialog
          isTr={isTr}
          busy={busy}
          danger
          title={isTr ? "Gönderiyi iptal et" : "Cancel shipment"}
          description={isTr ? "Bu ters gönderi iptal edilecek." : "This reverse shipment will be cancelled."}
          confirmLabel={isTr ? "Gönderiyi iptal et" : "Cancel shipment"}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            run(() => storeApi.reverseShipmentStatus(ret.id, dialog.shipment.id, { status: "CANCELLED" }))
          }
        />
      ) : null}
    </SurfaceCard>
  );
}

/**
 * Yıkıcı işlem onay modali (refund panel deseniyle aynı): fragment footer (Modal zaten flex/justify-end/gap
 * uygular), secondary "Vazgeç" + primary/danger onay. Odak-tuzağı/ESC/scroll-lock paylaşılan Modal'dan gelir.
 */
function ConfirmDialog({
  isTr,
  busy,
  danger,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  isTr: boolean;
  busy: boolean;
  danger?: boolean;
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
          <Button variant={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>
            {busy ? (isTr ? "İşleniyor…" : "Processing…") : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-white/60">
        {isTr
          ? "Bu işlem geri alınamaz. Devam etmek istiyor musunuz?"
          : "This action cannot be undone. Do you want to continue?"}
      </p>
    </Modal>
  );
}

function ReverseShipmentRow({
  shipment,
  isTr,
  busy,
  onStatus,
  onTracking,
  onCancel,
}: {
  shipment: ReverseShipment;
  returnId: string;
  isTr: boolean;
  busy: boolean;
  onStatus: (status: "IN_TRANSIT" | "DELIVERED") => void;
  onTracking: () => void;
  onCancel: () => void;
}) {
  const meta = SHIP_STATUS[shipment.status] ?? SHIP_STATUS.DRAFT;
  const terminal = ["DELIVERED", "CANCELLED", "FAILED"].includes(shipment.status);
  return (
    <li className="space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone={meta.tone} dot>
            <span aria-hidden>{meta.glyph}</span> {isTr ? meta.tr : meta.en}
          </Badge>
          <span className="text-white/70">
            {isTr ? "Adet" : "Qty"}: {shipment.returnQuantity}
          </span>
          {shipment.carrierName ? <span className="text-white/60">· {shipment.carrierName}</span> : null}
          {shipment.trackingNumber ? (
            <span className="min-w-0 break-all text-white/40">· {shipment.trackingNumber}</span>
          ) : null}
        </span>
      </div>
      <p className="text-white/40">
        {isTr ? "Oluşturuldu" : "Created"}: {formatDate(shipment.createdAt)}
        {shipment.deliveredAt ? ` · ${isTr ? "Teslim" : "Delivered"}: ${formatDate(shipment.deliveredAt)}` : ""}
      </p>
      {!terminal ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {shipment.status === "DRAFT" ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onStatus("IN_TRANSIT")}>
              {isTr ? "Kargoya verildi" : "Mark shipped"}
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onStatus("DELIVERED")}>
            {isTr ? "Teslim edildi" : "Mark delivered"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onTracking}>
            {isTr ? "Takip güncelle" : "Update tracking"}
          </Button>
          {/* Yıkıcı: onaylı + belirgin (danger). Ters gönderiyi iptal eder. */}
          <Button size="sm" variant="danger" disabled={busy} onClick={onCancel}>
            {isTr ? "İptal et" : "Cancel"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function DispositionDialog({
  item,
  isTr,
  busy,
  onClose,
  onSubmit,
}: {
  item: ItemRow;
  isTr: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { returnItemId: string; type: Disposition["type"]; quantity: number; reason?: string }) => void;
}) {
  const [type, setType] = useState<Disposition["type"]>("RETURN_TO_CUSTOMER");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const max = item.undispositionedRejectedQuantity;
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={isTr ? "Kapat" : "Close"}
      title={isTr ? "Disposition ekle" : "Add disposition"}
      description={item.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={busy || quantity < 1 || quantity > max}
            onClick={() => onSubmit({ returnItemId: item.id, type, quantity, reason: reason.trim() || undefined })}
          >
            {isTr ? "Kaydet" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label={isTr ? "Karar" : "Decision"}
          id="disp-type"
          value={type}
          onChange={(e) => setType(e.target.value as Disposition["type"])}
          options={Object.entries(DISPOSITION_LABELS).map(([v, l]) => ({ value: v, label: isTr ? l.tr : l.en }))}
        />
        <Input
          label={`${isTr ? "Adet" : "Quantity"} (${isTr ? "en çok" : "max"} ${max})`}
          id="disp-qty"
          type="number"
          min={1}
          max={max}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          required
        />
        <Textarea
          label={isTr ? "Gerekçe (internal)" : "Reason (internal)"}
          id="disp-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint={isTr ? "Müşteriye gösterilmez." : "Not shown to the customer."}
        />
      </div>
    </Modal>
  );
}

function ReverseDialog({
  item,
  shippingAddress,
  isTr,
  busy,
  onClose,
  onSubmit,
}: {
  item: ItemRow;
  shippingAddress: AdminReturnDetail["shippingAddress"];
  isTr: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { quantity: number; carrierName?: string; trackingNumber?: string; reason: string }) => void;
}) {
  const rtc = item.dispositions.find((d) => d.type === "RETURN_TO_CUSTOMER" && d.reverseShippableRemaining > 0);
  const max = rtc?.reverseShippableRemaining ?? 0;
  const [quantity, setQuantity] = useState(Math.min(1, max) || 1);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={isTr ? "Kapat" : "Close"}
      title={isTr ? "Müşteriye geri gönder" : "Return to customer"}
      description={item.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={busy || quantity < 1 || quantity > max || reason.trim().length < 3}
            onClick={() => onSubmit({ quantity, carrierName: carrier.trim() || undefined, trackingNumber: tracking.trim() || undefined, reason: reason.trim() })}
          >
            {isTr ? "Gönderi oluştur" : "Create shipment"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Alert tone="warning">
          {isTr
            ? "Bu işlem para iadesi değildir. Ürün müşteriye geri gönderilecektir."
            : "This is not a refund. The product will be shipped back to the customer."}
        </Alert>
        {shippingAddress ? (
          <div className="rounded-lg bg-white/[0.02] p-3 text-xs text-white/60">
            <p className="font-medium text-white/80">{shippingAddress.fullName}</p>
            <p>
              {shippingAddress.addressLine1}
              {shippingAddress.addressLine2 ? `, ${shippingAddress.addressLine2}` : ""}
            </p>
            <p>
              {shippingAddress.district ? `${shippingAddress.district} / ` : ""}
              {shippingAddress.city}
            </p>
          </div>
        ) : null}
        <Input
          label={`${isTr ? "Adet" : "Quantity"} (${isTr ? "en çok" : "max"} ${max})`}
          id="rev-qty"
          type="number"
          min={1}
          max={max}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          required
        />
        <Input label={isTr ? "Taşıyıcı" : "Carrier"} id="rev-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        <Input label={isTr ? "Takip numarası" : "Tracking number"} id="rev-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        <Textarea
          label={isTr ? "Gerekçe (zorunlu, internal)" : "Reason (required, internal)"}
          id="rev-reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint={isTr ? "Müşteriye gösterilmez." : "Not shown to the customer."}
        />
      </div>
    </Modal>
  );
}

function TrackingDialog({
  shipment,
  isTr,
  busy,
  onClose,
  onSubmit,
}: {
  shipment: ReverseShipment;
  isTr: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { carrierName?: string; trackingNumber?: string }) => void;
}) {
  const [carrier, setCarrier] = useState(shipment.carrierName ?? "");
  const [tracking, setTracking] = useState(shipment.trackingNumber ?? "");
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={isTr ? "Kapat" : "Close"}
      title={isTr ? "Takip güncelle" : "Update tracking"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {isTr ? "Vazgeç" : "Cancel"}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => onSubmit({ carrierName: carrier.trim() || undefined, trackingNumber: tracking.trim() || undefined })}>
            {isTr ? "Kaydet" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label={isTr ? "Taşıyıcı" : "Carrier"} id="trk-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        <Input label={isTr ? "Takip numarası" : "Tracking number"} id="trk-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
      </div>
    </Modal>
  );
}
