"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "@commerce-os/i18n";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type {
  CustomerReturnCreateRequest,
  CustomerReturnEligibility,
  CustomerReturnEligibilityLine,
  RefundDestinationValue,
  ReturnReasonValue,
  ReturnResolutionTypeValue,
} from "@commerce-os/contracts";
import { RETURN_COMMENT_MAX, returnReasonRequiresComment } from "@commerce-os/contracts";
import {
  createReturnAction,
  uploadAttachmentAction,
} from "../../../lib/server/return-actions";
import {
  Button,
  ButtonLink,
  CharCounter,
  EmptyState,
  Heading,
  PhotoUpload,
  ProductMediaFrame,
  Radio,
  Select,
  Stepper,
  Text,
  Textarea,
} from "../../ui";

type ReturnsDict = StorefrontDictionary["account"]["returns"];

/** Sözleşme sırasıyla iade nedenleri (enum değerleri sabit; etiket t.reasons'tan). */
const REASON_VALUES: ReturnReasonValue[] = [
  "NO_LONGER_NEEDED",
  "ORDERED_BY_MISTAKE",
  "BETTER_PRICE_AVAILABLE",
  "NOT_AS_DESCRIBED",
  "WRONG_ITEM_RECEIVED",
  "DEFECTIVE_OR_NOT_WORKING",
  "DAMAGED_PRODUCT",
  "DAMAGED_PACKAGING",
  "MISSING_PARTS_OR_ACCESSORIES",
  "QUALITY_NOT_EXPECTED",
  "SIZE_OR_FIT_ISSUE",
  "DELIVERY_TOO_LATE",
  "UNAUTHORIZED_PURCHASE",
  "OTHER",
];

interface LineDraft {
  selected: boolean;
  quantity: number;
  reason: ReturnReasonValue | "";
  comment: string;
  attachmentMediaIds: string[];
}

function isSelectable(line: CustomerReturnEligibilityLine): boolean {
  return line.eligibility === "ELIGIBLE" && line.remainingReturnableQty > 0;
}

/**
 * TODO-169 (ADR-269) — Müşteri iade sihirbazı (4 adım). Uygunluk SUNUCUDAN gelir
 * (prop); istemci uygunluk/tutar HESAPLAMAZ. Adımlar: 1) ürün+adet 2) neden+açıklama
 * +foto 3) çözüm 4) özet+onay. Erişilebilirlik (§18): adım göstergesi, hata özeti
 * (role=alert + odak), aria-describedby, klavye, yapışkan özet paneli içeriği örtmez.
 */
export function ReturnWizard({
  eligibility,
  t,
}: {
  eligibility: CustomerReturnEligibility;
  t: ReturnsDict;
}) {
  const router = useRouter();
  const w = t.wizard;
  const selectableLines = eligibility.lines.filter(isSelectable);

  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() => {
    const initial: Record<string, LineDraft> = {};
    for (const line of eligibility.lines) {
      initial[line.orderLineId] = {
        selected: false,
        quantity: Math.min(1, line.remainingReturnableQty),
        reason: "",
        comment: "",
        attachmentMediaIds: [],
      };
    }
    return initial;
  });

  const resolutionOptions = useMemo<ReturnResolutionTypeValue[]>(() => {
    const options: ReturnResolutionTypeValue[] = [];
    // TODO-175 — nötr REFUND çözümü sunulur (hedef ayrı `refundDestination` alt-seçiminde belirlenir);
    // legacy REFUND_TO_ORIGINAL_PAYMENT artık gönderilmez.
    if (eligibility.allowOriginalPaymentRefund) options.push("REFUND");
    if (eligibility.allowReplacement) options.push("REPLACEMENT");
    return options;
  }, [eligibility.allowOriginalPaymentRefund, eligibility.allowReplacement]);

  const [resolution, setResolution] = useState<ReturnResolutionTypeValue | "">(
    resolutionOptions.length === 1 ? resolutionOptions[0] : "",
  );
  // TODO-175 — REFUND çözümünde zorunlu iade yöntemi (ORIGINAL_PAYMENT ön-seçili). REPLACEMENT'ta gönderilmez.
  // Ödeme bilgisi prop'ta yok → her iki seçenek de gösterilir; sunucu geçersiz seçimi REFUND_DESTINATION_INVALID
  // ile reddeder (istemci tutar HESAPLAMAZ/GÖNDERMEZ).
  const [refundDestination, setRefundDestination] = useState<RefundDestinationValue | "">(
    "ORIGINAL_PAYMENT",
  );
  const [customerNote, setCustomerNote] = useState("");
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const headingRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const steps = [
    { label: w.steps.items },
    { label: w.steps.reason },
    { label: w.steps.resolution },
    { label: w.steps.review },
  ];

  const selectedLines = eligibility.lines.filter((l) => drafts[l.orderLineId]?.selected);

  function patch(orderLineId: string, next: Partial<LineDraft>) {
    setDrafts((prev) => ({ ...prev, [orderLineId]: { ...prev[orderLineId], ...next } }));
  }

  function focusErrors() {
    requestAnimationFrame(() => errorRef.current?.focus());
  }
  function focusHeading() {
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function validateStep(current: number): string[] {
    const found: string[] = [];
    if (current === 0) {
      if (selectedLines.length === 0) found.push(w.selectAtLeastOne);
    }
    if (current === 1) {
      for (const line of selectedLines) {
        const d = drafts[line.orderLineId];
        if (!d.reason) {
          found.push(`${line.title}: ${w.reasonMissing}`);
          continue;
        }
        if (returnReasonRequiresComment(d.reason) && d.comment.trim().length === 0) {
          found.push(`${line.title}: ${w.commentRequiredError}`);
        }
      }
    }
    if (current === 2) {
      if (!resolution) found.push(w.resolutionMissing);
      // TODO-175 — REFUND çözümünde iade yöntemi zorunlu (sözleşme superRefine + sunucu da doğrular).
      else if (resolution === "REFUND" && !refundDestination) found.push(w.refundDestinationMissing);
    }
    return found;
  }

  function goNext() {
    const found = validateStep(step);
    setErrors(found);
    if (found.length > 0) {
      focusErrors();
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
    focusHeading();
  }

  function goBack() {
    setErrors([]);
    setStep((s) => Math.max(s - 1, 0));
    focusHeading();
  }

  async function submit() {
    // Tüm adımları son kez doğrula (fail-closed).
    const all = [...validateStep(0), ...validateStep(1), ...validateStep(2)];
    setErrors(all);
    if (all.length > 0) {
      focusErrors();
      return;
    }
    if (!resolution) return;

    const body: CustomerReturnCreateRequest = {
      orderNumber: eligibility.orderNumber,
      resolutionType: resolution,
      // TODO-175 — REFUND çözümünde müşteri hedefi gönderilir; REPLACEMENT'ta atlanır (istemci tutar göndermez).
      refundDestination:
        resolution === "REFUND" && refundDestination ? refundDestination : undefined,
      customerNote: customerNote.trim() ? customerNote.trim() : undefined,
      items: selectedLines.map((line) => {
        const d = drafts[line.orderLineId];
        return {
          orderLineId: line.orderLineId,
          quantity: d.quantity,
          reason: d.reason as ReturnReasonValue,
          customerComment: d.comment.trim() ? d.comment.trim() : undefined,
          attachmentMediaIds:
            d.attachmentMediaIds.length > 0 ? d.attachmentMediaIds : undefined,
        };
      }),
    };

    setSubmitting(true);
    const result = await createReturnAction(body);
    setSubmitting(false);
    if (result.status === "success") {
      router.push(`/account/returns/${encodeURIComponent(result.returnNumber)}`);
    } else {
      setErrors([t.error]);
      focusErrors();
    }
  }

  // İade edilebilir ürün yoksa sihirbaz açılmaz (server zaten returnable=false verebilir).
  if (selectableLines.length === 0) {
    return (
      <EmptyState
        title={t.ineligibleTitle}
        description={w.noEligibleItems}
        action={
          <ButtonLink
            href={`/account/orders/${encodeURIComponent(eligibility.orderNumber)}`}
            variant="secondary"
            size="sm"
          >
            {t.backToOrder}
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="space-y-8 pb-28 lg:pb-0">
      <Stepper
        steps={steps}
        current={step}
        ariaLabel={w.stepAria}
        completedLabel={w.stepCompleted}
        currentLabel={w.stepCurrent}
      />

      {errors.length > 0 ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <p className="font-medium">{w.errorSummaryTitle}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-6">
          <div ref={headingRef} tabIndex={-1} className="focus:outline-none">
            <Heading as="h2" className="text-xl sm:text-2xl">
              {step === 0
                ? w.itemsTitle
                : step === 1
                  ? w.reasonTitle
                  : step === 2
                    ? w.resolutionTitle
                    : w.reviewTitle}
            </Heading>
          </div>

          {step === 0 ? (
            <StepItems eligibility={eligibility} drafts={drafts} patch={patch} t={t} />
          ) : null}
          {step === 1 ? (
            <StepReasons selectedLines={selectedLines} drafts={drafts} patch={patch} t={t} />
          ) : null}
          {step === 2 ? (
            <StepResolution
              options={resolutionOptions}
              resolution={resolution}
              setResolution={setResolution}
              refundDestination={refundDestination}
              setRefundDestination={setRefundDestination}
              customerNote={customerNote}
              setCustomerNote={setCustomerNote}
              t={t}
            />
          ) : null}
          {step === 3 ? (
            <StepReview
              eligibility={eligibility}
              selectedLines={selectedLines}
              drafts={drafts}
              resolution={resolution}
              refundDestination={refundDestination}
              customerNote={customerNote}
              t={t}
            />
          ) : null}
          {/* Submit hatası tek yerden gösterilir: yukarıdaki role="alert" özet kutusu (setErrors([t.error])).
              Ayrı inline kopya kaldırıldı — çift render + palet-dışı renk. */}
        </div>

        <SummaryPanel
          eligibility={eligibility}
          selectedCount={selectedLines.length}
          resolution={resolution}
          step={step}
          totalSteps={steps.length}
          onBack={goBack}
          onNext={goNext}
          onSubmit={() => void submit()}
          submitting={submitting}
          t={t}
        />
      </div>
    </div>
  );
}

/* ── Adım 1: ürün + adet ─────────────────────────────────────────────────────── */
function StepItems({
  eligibility,
  drafts,
  patch,
  t,
}: {
  eligibility: CustomerReturnEligibility;
  drafts: Record<string, LineDraft>;
  patch: (id: string, next: Partial<LineDraft>) => void;
  t: ReturnsDict;
}) {
  const w = t.wizard;
  return (
    <div className="space-y-3">
      <Text>{w.itemsHelp}</Text>
      <ul className="space-y-3">
        {eligibility.lines.map((line) => {
          const d = drafts[line.orderLineId];
          const selectable = isSelectable(line);
          const selId = `sel-${line.orderLineId}`;
          return (
            <li
              key={line.orderLineId}
              className={selectable ? "border border-line p-4" : "border border-line bg-surface-muted p-4"}
            >
              <div className={selectable ? "flex items-start gap-3" : "flex items-start gap-3 opacity-70"}>
                {selectable ? (
                  <input
                    type="checkbox"
                    id={selId}
                    checked={d.selected}
                    onChange={(e) => patch(line.orderLineId, { selected: e.target.checked })}
                    className="mt-1 h-4 w-4 shrink-0 accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                    aria-label={w.selectItem}
                  />
                ) : null}
                {/* Zengin başlık etiketi: checkbox ile htmlFor eşlenir (label akış içeriği alır → div geçerli). */}
                {selectable ? (
                  <label htmlFor={selId} className="min-w-0 flex-1 cursor-pointer">
                    <LineHeader line={line} />
                  </label>
                ) : (
                  <div className="min-w-0 flex-1">
                    <LineHeader line={line} />
                  </div>
                )}
              </div>

              {selectable && d.selected ? (
                <div className="mt-3 space-y-1 pl-7">
                  <QuantityStepper
                    label={w.quantityLabel}
                    value={d.quantity}
                    max={line.remainingReturnableQty}
                    onChange={(q) => patch(line.orderLineId, { quantity: q })}
                    decreaseLabel={w.decreaseQuantity}
                    increaseLabel={w.increaseQuantity}
                  />
                  <p className="text-xs text-ink-subtle">
                    {format(w.remainingQty, { count: line.remainingReturnableQty })}
                  </p>
                </div>
              ) : null}

              {!selectable ? (
                <p className="mt-2 text-xs font-medium uppercase tracking-wideish text-ink-subtle">
                  {t.eligibilityStatus[line.eligibility]}
                </p>
              ) : line.hasActiveReturn ? (
                <p className="mt-2 pl-7 text-xs text-ink-subtle">{w.activeReturnNote}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LineHeader({ line }: { line: CustomerReturnEligibilityLine }) {
  return (
    <div className="flex min-w-0 gap-3">
      <ProductMediaFrame
        variant="line-thumbnail"
        handle={line.productSlug}
        title={line.title}
        imageUrl={line.imageUrl}
        className="h-14 w-14 shrink-0 border border-line"
      />
      <div className="min-w-0">
        <span className="block text-sm font-medium text-ink">{line.title}</span>
        {line.variantTitle ? (
          <span className="block text-xs text-ink-subtle">{line.variantTitle}</span>
        ) : null}
        <span className="block text-xs text-ink-subtle">{line.sku}</span>
      </div>
    </div>
  );
}

function QuantityStepper({
  label,
  value,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (q: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-ink">
      <span className="text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
        {label}
      </span>
      <span className="inline-flex items-center border border-line">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center text-ink hover:bg-surface-muted disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={value <= 1}
          aria-label={decreaseLabel}
        >
          −
        </button>
        <span className="min-w-8 px-2 text-center tabular-nums">{value}</span>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center text-ink hover:bg-surface-muted disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={increaseLabel}
        >
          +
        </button>
      </span>
    </label>
  );
}

/* ── Adım 2: neden + açıklama + foto ─────────────────────────────────────────── */
function StepReasons({
  selectedLines,
  drafts,
  patch,
  t,
}: {
  selectedLines: CustomerReturnEligibilityLine[];
  drafts: Record<string, LineDraft>;
  patch: (id: string, next: Partial<LineDraft>) => void;
  t: ReturnsDict;
}) {
  const w = t.wizard;
  return (
    <div className="space-y-4">
      <Text>{w.reasonHelp}</Text>
      {selectedLines.map((line) => {
        const d = drafts[line.orderLineId];
        const commentRequired = d.reason ? returnReasonRequiresComment(d.reason) : false;
        const commentId = `comment-${line.orderLineId}`;
        const counterId = `counter-${line.orderLineId}`;
        return (
          <fieldset key={line.orderLineId} className="space-y-3 border border-line p-4">
            <legend className="sr-only">{line.title}</legend>
            <LineHeader line={line} />

            <Select
              label={w.reasonLabel}
              id={`reason-${line.orderLineId}`}
              value={d.reason}
              onChange={(e) => patch(line.orderLineId, { reason: e.target.value as ReturnReasonValue })}
            >
              <option value="" disabled>
                {w.reasonPlaceholder}
              </option>
              {REASON_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t.reasons[value]}
                </option>
              ))}
            </Select>

            <div>
              <Textarea
                label={w.commentLabel}
                id={commentId}
                value={d.comment}
                required={commentRequired}
                maxLength={RETURN_COMMENT_MAX}
                aria-describedby={counterId}
                hint={commentRequired ? w.commentRequiredHint : w.commentOptionalHint}
                onChange={(e) => patch(line.orderLineId, { comment: e.target.value })}
              />
              <CharCounter id={counterId} value={d.comment.length} max={RETURN_COMMENT_MAX} />
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
                {w.photosLabel}
              </p>
              <PhotoUpload
                labels={t.photo}
                onUpload={async (file) => {
                  const form = new FormData();
                  form.append("file", file);
                  const res = await uploadAttachmentAction(form);
                  return res.ok ? { ok: true, mediaId: res.mediaId } : { ok: false };
                }}
                onChange={(ids) => patch(line.orderLineId, { attachmentMediaIds: ids })}
              />
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

/* ── Adım 3: çözüm tercihi ───────────────────────────────────────────────────── */
function StepResolution({
  options,
  resolution,
  setResolution,
  refundDestination,
  setRefundDestination,
  customerNote,
  setCustomerNote,
  t,
}: {
  options: ReturnResolutionTypeValue[];
  resolution: ReturnResolutionTypeValue | "";
  setResolution: (r: ReturnResolutionTypeValue) => void;
  refundDestination: RefundDestinationValue | "";
  setRefundDestination: (d: RefundDestinationValue) => void;
  customerNote: string;
  setCustomerNote: (v: string) => void;
  t: ReturnsDict;
}) {
  const w = t.wizard;
  const desc: Record<ReturnResolutionTypeValue, string> = {
    REFUND: w.resolutionRefundDesc,
    REFUND_TO_ORIGINAL_PAYMENT: w.resolutionRefundDesc,
    REPLACEMENT: w.resolutionReplacementDesc,
  };
  return (
    <div className="space-y-4">
      <Text>{w.resolutionHelp}</Text>
      <div className="space-y-2" role="radiogroup" aria-label={w.resolutionTitle}>
        {options.map((option) => (
          <div
            key={option}
            className={
              resolution === option
                ? "border border-ink p-4"
                : "border border-line p-4"
            }
          >
            <Radio
              name="resolution"
              id={`res-${option}`}
              checked={resolution === option}
              onChange={() => setResolution(option)}
              label={t.resolutions[option]}
              description={desc[option]}
            />

            {/* TODO-175 — REFUND seçilince iade yöntemi alt-seçimi (ORIGINAL_PAYMENT ön-seçili). */}
            {option === "REFUND" && resolution === "REFUND" ? (
              <div className="mt-4 space-y-2 border-t border-line pt-4 pl-7">
                <p className="text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
                  {w.refundDestinationTitle}
                </p>
                <div
                  className="space-y-2"
                  role="radiogroup"
                  aria-label={w.refundDestinationTitle}
                >
                  <div
                    className={
                      refundDestination === "ORIGINAL_PAYMENT"
                        ? "border border-ink p-3"
                        : "border border-line p-3"
                    }
                  >
                    <Radio
                      name="refund-destination"
                      id="refund-dest-original"
                      checked={refundDestination === "ORIGINAL_PAYMENT"}
                      onChange={() => setRefundDestination("ORIGINAL_PAYMENT")}
                      label={w.refundDestinationOriginal}
                      description={w.refundDestinationOriginalDesc}
                    />
                  </div>
                  <div
                    className={
                      refundDestination === "SHOPPING_BALANCE"
                        ? "border border-ink p-3"
                        : "border border-line p-3"
                    }
                  >
                    <Radio
                      name="refund-destination"
                      id="refund-dest-balance"
                      checked={refundDestination === "SHOPPING_BALANCE"}
                      onChange={() => setRefundDestination("SHOPPING_BALANCE")}
                      label={w.refundDestinationBalance}
                      description={w.refundDestinationBalanceDesc}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <Textarea
        label={w.noteLabel}
        id="customer-note"
        value={customerNote}
        maxLength={RETURN_COMMENT_MAX}
        onChange={(e) => setCustomerNote(e.target.value)}
      />
    </div>
  );
}

/* ── Adım 4: özet + onay ─────────────────────────────────────────────────────── */
function StepReview({
  eligibility,
  selectedLines,
  drafts,
  resolution,
  refundDestination,
  customerNote,
  t,
}: {
  eligibility: CustomerReturnEligibility;
  selectedLines: CustomerReturnEligibilityLine[];
  drafts: Record<string, LineDraft>;
  resolution: ReturnResolutionTypeValue | "";
  refundDestination: RefundDestinationValue | "";
  customerNote: string;
  t: ReturnsDict;
}) {
  const w = t.wizard;
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
          {w.reviewItems}
        </h3>
        <ul className="space-y-3">
          {selectedLines.map((line) => {
            const d = drafts[line.orderLineId];
            return (
              <li key={line.orderLineId} className="flex gap-3 border border-line p-3">
                <ProductMediaFrame
                  variant="line-thumbnail"
                  handle={line.productSlug}
                  title={line.title}
                  imageUrl={line.imageUrl}
                  className="h-12 w-12 shrink-0 border border-line"
                />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-ink">{line.title}</p>
                  <p className="text-xs text-ink-subtle">
                    {w.quantityLabel}: {d.quantity}
                    {line.variantTitle ? ` · ${line.variantTitle}` : ""}
                  </p>
                  {d.reason ? (
                    <p className="text-xs text-ink-muted">
                      {w.reviewReason}: {t.reasons[d.reason]}
                    </p>
                  ) : null}
                  {d.comment.trim() ? (
                    <p className="mt-1 text-xs text-ink-muted">“{d.comment.trim()}”</p>
                  ) : null}
                  {d.attachmentMediaIds.length > 0 ? (
                    <p className="text-xs text-ink-subtle">
                      {format(t.detail.attachments, { count: d.attachmentMediaIds.length })}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-1 border-t border-line pt-4">
        <h3 className="text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
          {w.reviewResolution}
        </h3>
        <p className="text-sm text-ink">
          {resolution ? t.resolutions[resolution] : "—"}
        </p>
        {/* TODO-175 — REFUND çözümünde seçilen iade yöntemini de özetle. */}
        {resolution === "REFUND" && refundDestination ? (
          <p className="text-xs text-ink-muted">
            {w.refundDestinationTitle}:{" "}
            {refundDestination === "SHOPPING_BALANCE"
              ? w.refundDestinationBalance
              : w.refundDestinationOriginal}
          </p>
        ) : null}
      </section>

      {customerNote.trim() ? (
        <section className="space-y-1">
          <h3 className="text-[11px] font-medium uppercase tracking-wideish text-ink-muted">
            {w.reviewNote}
          </h3>
          <p className="text-sm text-ink-muted">{customerNote.trim()}</p>
        </section>
      ) : null}

      <p className="text-xs text-ink-subtle">
        {eligibility.customerPaysReturnShipping ? w.shippingPaidByCustomer : w.shippingFree}
      </p>
      <p className="text-xs text-ink-subtle">{w.confirmNote}</p>
    </div>
  );
}

/* ── Yapışkan özet + navigasyon ──────────────────────────────────────────────── */
function SummaryPanel({
  eligibility,
  selectedCount,
  resolution,
  step,
  totalSteps,
  onBack,
  onNext,
  onSubmit,
  submitting,
  t,
}: {
  eligibility: CustomerReturnEligibility;
  selectedCount: number;
  resolution: ReturnResolutionTypeValue | "";
  step: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitting: boolean;
  t: ReturnsDict;
}) {
  const w = t.wizard;
  const isLast = step === totalSteps - 1;
  // TODO-169 (blocker #2) — dar sağ rail (~248px) + uzun TR CTA ("İade talebini gönder") taşmasın:
  // butonlar TAM GENİŞLİK + alt alta (primary üstte, "Geri" altta). Sabit dar width yok; metin tek/iki
  // güvenli satır. Loading'de yalnız etiket değişir (buton genişliği sabit → layout kaymaz).
  const nav = (
    <div className="flex flex-col gap-2">
      {isLast ? (
        <Button variant="primary" size="sm" onClick={onSubmit} disabled={submitting} className="w-full">
          {submitting ? w.submitting : w.submit}
        </Button>
      ) : (
        <Button variant="primary" size="sm" onClick={onNext} disabled={submitting} className="w-full">
          {w.next}
        </Button>
      )}
      {step > 0 ? (
        <Button variant="secondary" size="sm" onClick={onBack} disabled={submitting} className="w-full">
          {w.back}
        </Button>
      ) : null}
    </div>
  );

  const summaryBody = (
    <dl className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-ink-muted">{w.reviewItems}</dt>
        <dd className="font-medium text-ink tabular-nums">{selectedCount}</dd>
      </div>
      {resolution ? (
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-muted">{w.reviewResolution}</dt>
          <dd className="text-right text-ink">{t.resolutions[resolution]}</dd>
        </div>
      ) : null}
      <p className="border-t border-line pt-2 text-xs text-ink-subtle">
        {eligibility.customerPaysReturnShipping ? w.shippingPaidByCustomer : w.shippingFree}
      </p>
    </dl>
  );

  return (
    <>
      {/* Masaüstü: yapışkan yan panel. */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-4 border border-line p-4">
          {summaryBody}
          {nav}
        </div>
      </aside>
      {/* Mobil: alt yapışkan çubuk. İçerik pb-28 ile örtülmez. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3 shadow-[0_-1px_0_var(--line)] lg:hidden">
        <div className="mx-auto max-w-3xl">{nav}</div>
      </div>
    </>
  );
}
