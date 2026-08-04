"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { Alert, Button, Input } from "../../ui";
import { cancelReturnAction, submitTrackingAction } from "../../../lib/server/return-actions";

type ReturnsDict = StorefrontDictionary["account"]["returns"];

/**
 * TODO-169 (ADR-269) — İade detayı istemci aksiyonları. Kargo takip gönderimi
 * (canSubmitTracking) ve iptal (canCancel) yalnız SUNUCU state-machine karar verirse
 * görünür (prop). Başarıda `router.refresh()` ile server-otoriter detay tazelenir.
 */
export function ReturnTrackingForm({
  returnNumber,
  t,
}: {
  returnNumber: string;
  t: ReturnsDict;
}) {
  const d = t.detail;
  const router = useRouter();
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (carrier.trim().length === 0 || trackingNumber.trim().length === 0) {
      setError(d.trackingMissing);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitTrackingAction(returnNumber, carrier, trackingNumber);
      if (result.status === "success") {
        setDone(true);
        router.refresh();
      } else {
        setError(t.error);
      }
    });
  }

  if (done) {
    return <Alert tone="success">{d.trackingSuccess}</Alert>;
  }

  return (
    <div className="space-y-3">
      <p id="return-tracking-help" className="text-sm text-ink-muted">
        {d.trackingHelp}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label={d.carrierLabel}
          id="return-carrier"
          value={carrier}
          required
          aria-describedby="return-tracking-help"
          placeholder={d.carrierPlaceholder}
          onChange={(e) => setCarrier(e.target.value)}
        />
        <Input
          label={d.trackingLabel}
          id="return-tracking"
          value={trackingNumber}
          required
          aria-describedby="return-tracking-help"
          onChange={(e) => setTrackingNumber(e.target.value)}
        />
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
        {pending ? d.submittingTracking : d.submitTracking}
      </Button>
    </div>
  );
}

export function ReturnCancelButton({
  returnNumber,
  t,
}: {
  returnNumber: string;
  t: ReturnsDict;
}) {
  const d = t.detail;
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelReturnAction(returnNumber);
      if (result.status === "success") {
        setConfirming(false);
        router.refresh();
      } else {
        setError(t.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">{d.cancelHelp}</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {confirming ? (
        <div className="space-y-3 border border-line p-4">
          <p className="text-sm text-ink">{d.cancelConfirm}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={cancel} disabled={pending}>
              {pending ? d.cancelling : d.cancelConfirmCta}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              {d.cancelKeep}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          {d.cancelCta}
        </Button>
      )}
    </div>
  );
}
