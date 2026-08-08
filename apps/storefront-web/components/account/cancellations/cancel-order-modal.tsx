"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type {
  CancellationOrderSummary,
  OrderCancellationReasonCategoryValue,
  OrderCancellationReasonValue,
  RefundDestinationValue,
} from "@commerce-os/contracts";
import {
  activeCancellationReasons,
  CANCELLATION_NOTE_MAX,
  cancellationReasonRequiresNote,
} from "@commerce-os/contracts";
import { formatMinor } from "../../../lib/money";
import { cancelOrderAction, type CancelOrderState } from "../../../lib/server/cancellation-actions";
import { Alert, Button, CharCounter, Radio, Stepper, Text, Textarea } from "../../ui";

type CancellationsDict = StorefrontDictionary["account"]["cancellations"];

/** Aktif nedenleri kategori sırasını koruyarak grupla (optgroup gösterimi için). */
function groupReasonsByCategory(): {
  category: OrderCancellationReasonCategoryValue;
  codes: OrderCancellationReasonValue[];
}[] {
  const groups: {
    category: OrderCancellationReasonCategoryValue;
    codes: OrderCancellationReasonValue[];
  }[] = [];
  for (const entry of activeCancellationReasons()) {
    let group = groups.find((g) => g.category === entry.category);
    if (!group) {
      group = { category: entry.category, codes: [] };
      groups.push(group);
    }
    group.codes.push(entry.code);
  }
  return groups;
}

/** Server error.code → müşteri-dostu mesaj (i18n). Bilinmeyen → generic. */
function errorMessage(code: string | null, t: CancellationsDict): string {
  switch (code) {
    case "CANCEL_CONFLICT":
      return t.errors.conflict;
    case "ORDER_NOT_FOUND":
      return t.errors.notFound;
    case "INVALID_REASON":
      return t.errors.invalidReason;
    case "NOTE_REQUIRED":
      return t.errors.noteRequired;
    case "BLOCKED_IN_TRANSIT":
      return t.errors.blockedInTransit;
    case "BLOCKED_DELIVERED":
      return t.errors.blockedDelivered;
    case "NOT_CANCELLABLE":
      return t.errors.notCancellable;
    default:
      return t.errors.generic;
  }
}

/**
 * TODO-174 (ADR-275/277/278) — Müşteri self-servis sipariş iptali çok adımlı modal.
 *
 * `return-wizard.tsx` deseninden türetildi (adım state, doğrulama, submit, hata özeti)
 * ama hafif overlay olarak sadeleştirildi. Uygunluk/tutar SUNUCU-OTORİTERDİR
 * (prop `summary`); istemci refund tutarı HESAPLAMAZ ve GÖNDERMEZ (yalnız reasonCode/
 * reasonNote/expectedVersion + opsiyonel refundDestination SEÇİMİ). Adım 1: neden
 * (+ OTHER için zorunlu açıklama). Adım 2 (KOŞULLU, TODO-175/ADR-285): iade yöntemi —
 * YALNIZ gerçek bir seçim varken (ödeme alınmış + hem original hem shopping-balance
 * teklif ediliyor). Son adım: özet + kesin onay. İstemci yalnız DESTINATION seçer,
 * tutar hesaplamaz. Başarıda refundStatus AYRI gösterilir (yanıltıcı "iade tamamlandı" yok).
 */
export function CancelOrderModal({
  orderNumber,
  summary,
  t,
  onClose,
}: {
  orderNumber: string;
  summary: CancellationOrderSummary;
  t: CancellationsDict;
  onClose: () => void;
}) {
  const router = useRouter();
  const groups = useMemo(groupReasonsByCategory, []);

  const [step, setStep] = useState(0);
  const [reason, setReason] = useState<OrderCancellationReasonValue | "">("");
  const [note, setNote] = useState("");
  const [destination, setDestination] = useState<RefundDestinationValue>("ORIGINAL_PAYMENT");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CancelOrderState>({ status: "idle" });

  const errorRef = useRef<HTMLDivElement>(null);
  const noteRequired = reason ? cancellationReasonRequiresNote(reason) : false;

  // TODO-175 — İade yöntemi adımı YALNIZ gerçek bir seçim varken görünür: ödeme alınmış
  // (isPaid) VE hem original-payment hem shopping-balance teklif ediliyor. Aksi halde
  // (unpaid, ya da external=0 → yalnız balance) adım gizlenir ve refundDestination GÖNDERİLMEZ.
  const hasDestinationChoice =
    summary.isPaid && summary.offerOriginalPayment && summary.offerShoppingBalance;

  // Adım anahtarları; destination adımı koşullu olarak neden↔onay arasına eklenir.
  const stepKeys: ("reason" | "destination" | "confirm")[] = hasDestinationChoice
    ? ["reason", "destination", "confirm"]
    : ["reason", "confirm"];
  const currentKey = stepKeys[step];
  const confirmIndex = stepKeys.length - 1;
  const steps = stepKeys.map((key) =>
    key === "reason"
      ? { label: t.steps.reason }
      : key === "destination"
        ? { label: t.refundDestinationTitle }
        : { label: t.steps.confirm },
  );
  const succeeded = result.status === "success";

  function focusErrors() {
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function validateReasonStep(): string[] {
    const found: string[] = [];
    if (!reason) {
      found.push(t.errors.invalidReason);
    } else if (noteRequired && note.trim().length === 0) {
      found.push(t.noteRequiredError);
    }
    return found;
  }

  function goNext() {
    // Neden adımında ilerlemeden önce doğrula; sonraki adımlar (destination) doğrulama gerektirmez.
    if (currentKey === "reason") {
      const found = validateReasonStep();
      setErrors(found);
      if (found.length > 0) {
        focusErrors();
        return;
      }
    }
    setStep((s) => s + 1);
  }

  function goBack() {
    setErrors([]);
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    const found = validateReasonStep();
    setErrors(found);
    if (found.length > 0 || !reason) {
      setStep(0);
      focusErrors();
      return;
    }
    setSubmitting(true);
    const state = await cancelOrderAction(orderNumber, {
      reasonCode: reason,
      reasonNote: note.trim() ? note.trim() : undefined,
      expectedVersion: summary.version,
      // İstemci YALNIZ hedefi seçer (tutar değil); adım gösterilmediyse GÖNDERME (server default).
      ...(hasDestinationChoice ? { refundDestination: destination } : {}),
    });
    setSubmitting(false);
    setResult(state);
    if (state.status === "error") {
      setErrors([errorMessage(state.code, t)]);
      focusErrors();
    }
  }

  /** Başarıda kapat → server verisini tazele (rozet/durum sunucudan yeniden gelir). */
  function closeAndRefresh() {
    onClose();
    if (succeeded) router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.modalAria}
      onKeyDown={(e) => {
        if (e.key === "Escape") closeAndRefresh();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-medium text-ink">
            {succeeded ? t.successTitle : t.title}
          </h2>
          <button
            type="button"
            onClick={closeAndRefresh}
            aria-label={t.close}
            className="shrink-0 text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ✕
          </button>
        </div>

        {succeeded ? (
          <SuccessPanel result={result} t={t} onClose={closeAndRefresh} />
        ) : (
          <div className="space-y-5">
            <Stepper
              steps={steps}
              current={step}
              ariaLabel={t.stepAria}
              completedLabel={t.stepCompleted}
              currentLabel={t.stepCurrent}
            />

            {errors.length > 0 ? (
              <div
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <ul className="list-disc space-y-0.5 pl-5">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {currentKey === "reason" ? (
              <ReasonStep
                reason={reason}
                setReason={(next) => {
                  setReason(next);
                  setErrors([]);
                }}
                note={note}
                setNote={setNote}
                noteRequired={noteRequired}
                groups={groups}
                t={t}
              />
            ) : currentKey === "destination" ? (
              <DestinationStep
                destination={destination}
                setDestination={setDestination}
                t={t}
              />
            ) : (
              <ConfirmStep
                orderNumber={orderNumber}
                summary={summary}
                reason={reason}
                destination={hasDestinationChoice ? destination : null}
                t={t}
              />
            )}

            <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row-reverse">
              {step === confirmIndex ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void submit()}
                  disabled={submitting}
                  className="w-full sm:w-auto"
                >
                  {submitting ? t.confirming : t.confirmCta}
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={goNext} className="w-full sm:w-auto">
                  {t.next}
                </Button>
              )}
              {step > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={goBack}
                  disabled={submitting}
                  className="w-full sm:w-auto"
                >
                  {t.back}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeAndRefresh}
                  disabled={submitting}
                  className="w-full sm:w-auto"
                >
                  {t.close}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Adım 1: iptal nedeni (+ OTHER için zorunlu açıklama) ─────────────────────── */
function ReasonStep({
  reason,
  setReason,
  note,
  setNote,
  noteRequired,
  groups,
  t,
}: {
  reason: OrderCancellationReasonValue | "";
  setReason: (next: OrderCancellationReasonValue) => void;
  note: string;
  setNote: (next: string) => void;
  noteRequired: boolean;
  groups: { category: OrderCancellationReasonCategoryValue; codes: OrderCancellationReasonValue[] }[];
  t: CancellationsDict;
}) {
  return (
    <div className="space-y-4">
      <Text>{t.reasonHelp}</Text>
      {/* Native <select> + optgroup: kategori gruplaması, klavye/ekran-okuyucu doğal. */}
      <div className="space-y-1.5">
        <label
          htmlFor="cancel-reason"
          className="block text-[11px] font-medium uppercase tracking-wideish text-ink-muted"
        >
          {t.reasonTitle}
        </label>
        <select
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as OrderCancellationReasonValue)}
          className="h-11 w-full appearance-none rounded-none border border-line bg-surface px-3.5 pr-9 text-sm text-ink transition-colors focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        >
          <option value="" disabled>
            {t.reasonPlaceholder}
          </option>
          {groups.map((group) => (
            <optgroup key={group.category} label={t.categories[group.category]}>
              {group.codes.map((code) => (
                <option key={code} value={code}>
                  {t.reasons[code]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {noteRequired ? (
        <div>
          <Textarea
            label={t.noteLabel}
            id="cancel-note"
            value={note}
            required
            maxLength={CANCELLATION_NOTE_MAX}
            aria-describedby="cancel-note-counter"
            hint={t.noteRequiredHint}
            onChange={(e) => setNote(e.target.value)}
          />
          <CharCounter id="cancel-note-counter" value={note.length} max={CANCELLATION_NOTE_MAX} />
        </div>
      ) : null}
    </div>
  );
}

/* ── İade yöntemi adımı (KOŞULLU, TODO-175/ADR-285) ──────────────────────────────
 * YALNIZ gerçek bir seçim varken render edilir (hasDestinationChoice). İki radyo:
 * ORIGINAL_PAYMENT (varsayılan) ve SHOPPING_BALANCE, ipuçlarıyla. İstemci tutar
 * HESAPLAMAZ; yalnız hedefi seçer. Tek isim (radio group) → biri seçili. */
function DestinationStep({
  destination,
  setDestination,
  t,
}: {
  destination: RefundDestinationValue;
  setDestination: (next: RefundDestinationValue) => void;
  t: CancellationsDict;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
        {t.refundDestinationTitle}
      </h3>
      <div className="space-y-3" role="radiogroup" aria-label={t.refundDestinationTitle}>
        <Radio
          id="refund-destination-original"
          name="refund-destination"
          value="ORIGINAL_PAYMENT"
          checked={destination === "ORIGINAL_PAYMENT"}
          onChange={() => setDestination("ORIGINAL_PAYMENT")}
          label={t.refundDestinationOriginal}
          description={t.refundDestinationOriginalHint}
        />
        <Radio
          id="refund-destination-balance"
          name="refund-destination"
          value="SHOPPING_BALANCE"
          checked={destination === "SHOPPING_BALANCE"}
          onChange={() => setDestination("SHOPPING_BALANCE")}
          label={t.refundDestinationBalance}
          description={t.refundDestinationBalanceHint}
        />
      </div>
    </div>
  );
}

/* ── Son adım: özet + kesin onay ─────────────────────────────────────────────────
 * İade satırı YALNIZ ödeme alınmışsa (isPaid) gösterilir. `destination` yalnız gerçek
 * seçim yapıldığında (adım gösterildi) dolu gelir; null → mevcut tek-satır davranışı.
 * Tutarlar server-otoriter (summary); istemci hesaplamaz — yalnız uygun alanı gösterir. */
function ConfirmStep({
  orderNumber,
  summary,
  reason,
  destination,
  t,
}: {
  orderNumber: string;
  summary: CancellationOrderSummary;
  reason: OrderCancellationReasonValue | "";
  destination: RefundDestinationValue | null;
  t: CancellationsDict;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
        {t.confirmTitle}
      </h3>
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-muted">{t.summaryOrder}</dt>
          <dd className="font-medium text-ink">{orderNumber}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-ink-muted">{t.summaryReason}</dt>
          <dd className="text-right text-ink">{reason ? t.reasons[reason] : "—"}</dd>
        </div>
        {summary.isPaid ? (
          <RefundSplitRows summary={summary} destination={destination} t={t} />
        ) : null}
      </dl>
      {summary.isPaid ? <Text className="text-xs text-ink-subtle">{t.refundNote}</Text> : null}
    </div>
  );
}

/* İade tutarı satır(lar)ı — hedef seçimine göre böler (server-otoriter tutarlar). */
function RefundSplitRows({
  summary,
  destination,
  t,
}: {
  summary: CancellationOrderSummary;
  destination: RefundDestinationValue | null;
  t: CancellationsDict;
}) {
  const money = (minor: number) => formatMinor(minor, summary.currency);

  // SHOPPING_BALANCE seçildi → tüm iade tutarı bakiyeye.
  if (destination === "SHOPPING_BALANCE") {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
        <dt className="text-ink-muted">{t.refundToBalanceLabel}</dt>
        <dd className="font-semibold text-ink tabular-nums">
          {money(summary.estimatedRefundMinor)}
        </dd>
      </div>
    );
  }

  // ORIGINAL_PAYMENT seçildi ve kredi-menşeli bileşen var → böl (bakiye + ödeme yöntemi).
  if (destination === "ORIGINAL_PAYMENT" && summary.creditRestorableMinor > 0) {
    return (
      <>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
          <dt className="text-ink-muted">{t.refundSplitBalanceLabel}</dt>
          <dd className="font-medium text-ink tabular-nums">
            {money(summary.creditRestorableMinor)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-muted">{t.refundDestinationOriginal}</dt>
          <dd className="font-semibold text-ink tabular-nums">
            {money(summary.externalRefundableMinor)}
          </dd>
        </div>
      </>
    );
  }

  // Seçim yok VEYA kredi-menşeli bileşen yok → mevcut tek-satır (toplam iade).
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
      <dt className="text-ink-muted">{t.refundLabel}</dt>
      <dd className="font-semibold text-ink tabular-nums">
        {money(summary.estimatedRefundMinor)}
      </dd>
    </div>
  );
}

/* ── Başarı: iptal edildi + refund durumu (AYRI, otoriter) ────────────────────── */
function SuccessPanel({
  result,
  t,
  onClose,
}: {
  result: CancelOrderState;
  t: CancellationsDict;
  onClose: () => void;
}) {
  // İptal başarılı; refund AYRI durum. Ödeme alınmadıysa (isPaid=false) refund satırı yok.
  const showRefund = result.status === "success" && result.isPaid;
  const refundStatus = result.status === "success" ? result.refundStatus : null;
  return (
    <div className="space-y-4">
      <Alert tone="success">{t.successBody}</Alert>
      {showRefund && refundStatus && refundStatus !== "NONE" ? (
        <div className="space-y-1 border border-line p-4">
          <p className="text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
            {t.refundStatusLabel}
          </p>
          <p className="text-sm text-ink">{t.refundStatusValues[refundStatus]}</p>
        </div>
      ) : null}
      <div className="flex justify-end border-t border-line pt-4">
        <Button variant="primary" size="sm" onClick={onClose}>
          {t.close}
        </Button>
      </div>
    </div>
  );
}
