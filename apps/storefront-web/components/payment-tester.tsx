"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Card } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { PublicPaymentScenario, PublicPaymentState } from "@commerce-os/api-client";
import { submitTestPaymentAction } from "../lib/server/cart-actions";

type PaymentDict = StorefrontDictionary["payment"];

const SCENARIOS: PublicPaymentScenario[] = [
  "success",
  "three_ds_required",
  "failure",
  "insufficient_funds",
  "cancelled",
];

type Phase =
  | { kind: "select" }
  | { kind: "processing" }
  | { kind: "paid" }
  | { kind: "failed"; title: string; description: string }
  | { kind: "requires_action" };

/**
 * F3B.2 — Test ödeme ekranı (MOCK provider). Gerçek tahsilat YOK; seçilen senaryo
 * gateway'de simüle edilir. Token + orderId server action'a taşınır; secret/
 * credential client'a asla gelmez.
 */
export function PaymentTester({
  state,
  orderId,
  token,
  t,
}: {
  state: PublicPaymentState;
  orderId: string;
  token: string;
  t: PaymentDict;
}) {
  const initialPhase: Phase =
    state.attempt.status === "REQUIRES_ACTION" ? { kind: "requires_action" } : { kind: "select" };
  const [phase, setPhase] = useState<Phase>(
    state.paymentStatus === "PAID" || state.paymentStatus === "AUTHORIZED"
      ? { kind: "paid" }
      : initialPhase,
  );

  async function run(scenario: PublicPaymentScenario) {
    setPhase({ kind: "processing" });
    const outcome = await submitTestPaymentAction(orderId, token, scenario);
    if (outcome.status !== "ok") {
      setPhase({ kind: "failed", title: t.failedTitle, description: t.invalidDescription });
      return;
    }
    const status = outcome.result.attempt.status;
    if (status === "PAID" || status === "AUTHORIZED") {
      setPhase({ kind: "paid" });
    } else if (status === "REQUIRES_ACTION") {
      setPhase({ kind: "requires_action" });
    } else if (status === "CANCELLED") {
      setPhase({ kind: "failed", title: t.cancelledTitle, description: t.failedDescription });
    } else {
      setPhase({ kind: "failed", title: t.failedTitle, description: t.failedDescription });
    }
  }

  const busy = phase.kind === "processing";

  return (
    <Card className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold text-slate-900">{t.title}</h1>
      <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">{t.orderLabel}</span>
          <span className="font-semibold text-slate-900">{state.orderNumber}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-slate-500">{t.totalLabel}</span>
          <span className="font-semibold text-slate-900">
            {new Intl.NumberFormat("tr-TR", { style: "currency", currency: state.currency }).format(
              state.totalMinor / 100,
            )}
          </span>
        </div>
      </div>

      {phase.kind === "paid" ? (
        <div className="mt-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            ✓
          </div>
          <h2 className="text-lg font-semibold text-slate-900">{t.paidTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.paidDescription}</p>
        </div>
      ) : phase.kind === "requires_action" ? (
        <div className="mt-6">
          <Alert tone="info">
            <span className="font-semibold">{t.threeDsTitle}.</span> {t.threeDsDescription}
          </Alert>
          <Button className="mt-4 w-full" onClick={() => run("success")} disabled={busy}>
            {busy ? t.processing : t.completeThreeDs}
          </Button>
        </div>
      ) : (
        <div className="mt-6">
          {phase.kind === "failed" ? (
            <Alert tone="error" className="mb-4">
              <span className="font-semibold">{phase.title}.</span> {phase.description}
            </Alert>
          ) : null}
          <p className="mb-3 text-sm font-medium text-slate-700">{t.chooseScenario}</p>
          <div className="grid grid-cols-1 gap-2">
            {SCENARIOS.filter((scenario) => state.scenarios.includes(scenario)).map((scenario) => (
              <Button
                key={scenario}
                variant="secondary"
                className="justify-between"
                onClick={() => run(scenario)}
                disabled={busy}
              >
                <span>{t.scenarios[scenario]}</span>
                <span aria-hidden className="text-slate-400">
                  →
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/products" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          {t.backToStore}
        </Link>
      </div>
    </Card>
  );
}
