"use client";

import { useState, useTransition } from "react";
import { Button } from "@commerce-os/ui";
import type { PublicPayResolveResponse } from "@commerce-os/api-client";
import { payAction } from "../lib/server/pay-actions";

type PayDict = {
  title: string;
  orderLabel: string;
  amountLabel: string;
  statusLabel: string;
  pay: string;
  processing: string;
  successTitle: string;
  successDescription: string;
  failedTitle: string;
  failedDescription: string;
};

function formatMoney(minor: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * TODO-159F — Müşteri ödeme paneli. Bu fazda MOCK sandbox "Öde" akışı; sunucu
 * senaryoyu uygular ve sonucu döner. Nihai ödeme otoritesi sunucudur.
 */
export function PayPanel({
  token,
  state,
  d,
  locale,
}: {
  token: string;
  state: PublicPayResolveResponse;
  d: PayDict;
  locale: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"idle" | "success" | "failed">("idle");

  const submit = () => {
    startTransition(async () => {
      const res = await payAction(token, "success");
      if (res.ok && (res.data.status === "PAID" || res.data.status === "AUTHORIZED")) {
        setResult("success");
      } else {
        setResult("failed");
      }
    });
  };

  if (result === "success") {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <h2 className="text-lg font-semibold text-emerald-300">{d.successTitle}</h2>
        <p className="mt-2 text-sm text-white/70">{d.successDescription}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-semibold">{d.title}</h1>
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-white/50">{d.orderLabel}</dt>
          <dd className="font-medium">{state.orderNumber}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-white/50">{d.amountLabel}</dt>
          <dd className="text-lg font-semibold">
            {formatMoney(state.amountMinor, state.currency, locale)}
          </dd>
        </div>
      </dl>
      {result === "failed" ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <p className="font-medium">{d.failedTitle}</p>
          <p className="mt-1 text-white/60">{d.failedDescription}</p>
        </div>
      ) : null}
      <Button onClick={submit} disabled={pending} className="w-full">
        {pending ? d.processing : d.pay}
      </Button>
    </div>
  );
}
