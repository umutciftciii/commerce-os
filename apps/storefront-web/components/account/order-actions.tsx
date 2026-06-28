"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Button } from "@commerce-os/ui";
import { format } from "@commerce-os/i18n";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { buyAgainAction, type BuyAgainState } from "../../lib/server/order-actions";
import type { ReturnEligibility } from "../../lib/orders";

type OrdersDict = StorefrontDictionary["account"]["orders"];

/**
 * TODO-079 — Sipariş kartı/detayı post-order CTA grubu (istemci).
 *
 * "Tekrar satın al" gerçek Server Action ({@link buyAgainAction}) tetikler;
 * güncel katalog/stok doğrulaması sunucuda yapılır. İade/destek/yorum CTA'ları
 * bu fazda PLACEHOLDER: tıklanınca dürüst "yakında" notu açılır (yanlış vaat yok).
 * İade penceresi (15 gün) ve yorum (teslimat sonrası) kuralları UI'da uygulanır.
 */
export function OrderActions({
  orderNumber,
  t,
  reorderable,
  returnState,
  canReview,
  layout = "card",
}: {
  orderNumber: string;
  t: OrdersDict;
  reorderable: boolean;
  returnState: ReturnEligibility;
  canReview: boolean;
  layout?: "card" | "detail";
}) {
  const [pending, startTransition] = useTransition();
  const [buyAgain, setBuyAgain] = useState<BuyAgainState>({ status: "idle" });
  const [panel, setPanel] = useState<null | "support" | "review" | "return">(null);

  function runBuyAgain() {
    setPanel(null);
    startTransition(async () => {
      setBuyAgain(await buyAgainAction(orderNumber));
    });
  }

  function togglePanel(next: "support" | "review" | "return") {
    setBuyAgain({ status: "idle" });
    setPanel((current) => (current === next ? null : next));
  }

  return (
    <div className={layout === "detail" ? "space-y-3" : "mt-4 space-y-3"}>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/account/orders/${encodeURIComponent(orderNumber)}`}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-card transition-all hover:border-slate-300 hover:bg-slate-50"
        >
          {t.actions.detail}
        </Link>
        {reorderable ? (
          <Button size="sm" variant="primary" onClick={runBuyAgain} disabled={pending}>
            {pending ? t.buyAgain.pending : t.actions.buyAgain}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => togglePanel("support")}>
          {t.actions.support}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => togglePanel("review")}
          disabled={!canReview}
          title={canReview ? undefined : t.review.locked}
        >
          {t.actions.review}
        </Button>
        {returnState.visible ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => togglePanel("return")}
            disabled={returnState.windowExpired}
            title={returnState.windowExpired ? t.return.expired : undefined}
          >
            {t.actions.return}
          </Button>
        ) : null}
      </div>

      {buyAgain.status === "success" ? (
        <Alert tone="success">
          <span>
            {format(t.buyAgain.success, { count: buyAgain.addedCount })}
            {buyAgain.unavailableCount > 0 ? ` ${t.buyAgain.partial}` : ""}
          </span>{" "}
          <Link href="/cart" className="font-medium underline">
            {t.buyAgain.goToCart}
          </Link>
        </Alert>
      ) : null}
      {buyAgain.status === "error" ? (
        <Alert tone="warning">
          {buyAgain.reason === "none-available" ? t.buyAgain.unavailable : t.buyAgain.error}
        </Alert>
      ) : null}

      {panel === "support" ? <Alert tone="info">{t.support.note}</Alert> : null}
      {panel === "review" ? <Alert tone="info">{t.review.note}</Alert> : null}
      {panel === "return" ? <Alert tone="info">{t.return.note}</Alert> : null}
    </div>
  );
}
