"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Button } from "@commerce-os/ui";
import { format } from "@commerce-os/i18n";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { ProductReviewStatus } from "@commerce-os/api-client";
import { buyAgainAction, type BuyAgainState } from "../../lib/server/order-actions";
import { ReviewForm } from "../reviews/pdp-reviews";
import type { ReturnEligibility } from "../../lib/orders";
import type {
  OrderReviewReason,
  OrderReviewState,
  ReviewableItem,
  ReviewedItem,
} from "../../lib/orders-review";

type OrdersDict = StorefrontDictionary["account"]["orders"];
type ReviewsDict = StorefrontDictionary["reviews"];

/**
 * TODO-079 / TODO-159E hotfix — Sipariş kartı/detayı post-order CTA grubu (istemci).
 *
 * "Tekrar satın al" gerçek Server Action ({@link buyAgainAction}) tetikler. "Ürün yorumu
 * yaz" artık GERÇEK review akışını açar ({@link OrderReviewAction}) — TODO-159E eligibility
 * + form + create/edit contract'ları yeniden kullanılır (placeholder "yakında" KALDIRILDI).
 * İade/destek CTA'ları bu fazda placeholder: dürüst "yakında" notu açar.
 */
export function OrderActions({
  orderNumber,
  t,
  reorderable,
  returnState,
  review,
  reviewsT,
  layout = "card",
}: {
  orderNumber: string;
  t: OrdersDict;
  reorderable: boolean;
  returnState: ReturnEligibility;
  review: OrderReviewState;
  reviewsT: ReviewsDict;
  layout?: "card" | "detail";
}) {
  const [pending, startTransition] = useTransition();
  const [buyAgain, setBuyAgain] = useState<BuyAgainState>({ status: "idle" });
  const [panel, setPanel] = useState<null | "support" | "return">(null);

  function runBuyAgain() {
    setPanel(null);
    startTransition(async () => {
      setBuyAgain(await buyAgainAction(orderNumber));
    });
  }

  function togglePanel(next: "support" | "return") {
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
        <OrderReviewAction state={review} t={t} reviewsT={reviewsT} />
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
      {panel === "return" ? <Alert tone="info">{t.return.note}</Alert> : null}
    </div>
  );
}

const STATUS_STYLE: Record<ProductReviewStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  HIDDEN: "bg-slate-200 text-slate-600",
};

function reasonText(reason: OrderReviewReason, t: OrdersDict): string {
  return reason === "not-delivered" ? t.review.locked : t.review.notEligible;
}

/**
 * TODO-159E hotfix — Sipariş yüzeyi "Ürün yorumu yaz" aksiyonu.
 *
 * Durum {@link resolveOrderReview} ile SUNUCU verisinden (eligible + reviews) türetilir;
 * istemcide uygunluk yeniden hesaplanmaz. Tek uygun kalem → form doğrudan açılır. Çok kalem
 * → seçim listesi (her kalem ayrı durumla). Uygun değil → açıklamalı disabled. Gönderim
 * sonrası ilgili kalem tekrar form SUNMAZ (moderasyon/PENDING durumu gösterilir).
 */
function OrderReviewAction({
  state,
  t,
  reviewsT,
}: {
  state: OrderReviewState;
  t: OrdersDict;
  reviewsT: ReviewsDict;
}) {
  const [open, setOpen] = useState(false);
  // Bu oturumda gönderilen (PENDING'e düşen) orderLineId'ler → tekrar form açılmaz.
  const [submitted, setSubmitted] = useState<Record<string, true>>({});

  // Uygun değil ve mevcut yorum da yok → açıklamalı disabled (placeholder ASLA gösterilmez).
  if (!state.visible) {
    return (
      <Button size="sm" variant="secondary" disabled title={reasonText(state.reason, t)}>
        {t.actions.review}
      </Button>
    );
  }

  const single = state.reviewable.length === 1 && state.reviewed.length === 0;

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {t.actions.review}
      </Button>
      {open ? (
        <div
          className="w-full rounded-lg border border-slate-200 bg-white p-3"
          role="group"
          aria-label={t.review.chooseTitle}
        >
          {!single ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t.review.chooseTitle}
            </p>
          ) : null}
          <ul className="space-y-2">
            {state.reviewable.map((item) => (
              <ReviewableRow
                key={item.orderLineId}
                item={item}
                t={t}
                reviewsT={reviewsT}
                autoOpen={single}
                done={Boolean(submitted[item.orderLineId])}
                onSubmitted={() =>
                  setSubmitted((prev) => ({ ...prev, [item.orderLineId]: true }))
                }
              />
            ))}
            {state.reviewed.map((item) => (
              <ReviewedRow
                key={item.reviewId}
                item={item}
                t={t}
                statusLabels={reviewsT.statusLabels}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function ItemHeader({
  title,
  variantLabel,
  badge,
}: {
  title: string;
  variantLabel: string | null;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 text-sm text-slate-700">
        <span className="font-medium text-slate-900">{title}</span>
        {variantLabel ? <span className="text-slate-500"> · {variantLabel}</span> : null}
      </span>
      {badge}
    </div>
  );
}

function ReviewableRow({
  item,
  t,
  reviewsT,
  autoOpen,
  done,
  onSubmitted,
}: {
  item: ReviewableItem;
  t: OrdersDict;
  reviewsT: ReviewsDict;
  autoOpen: boolean;
  done: boolean;
  onSubmitted: () => void;
}) {
  const [formOpen, setFormOpen] = useState(autoOpen);

  if (done) {
    return (
      <li className="rounded-md border border-slate-100 bg-slate-50 p-3">
        <ItemHeader
          title={item.productTitle}
          variantLabel={item.variantLabel}
          badge={
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE.PENDING}`}
            >
              {reviewsT.statusLabels.PENDING}
            </span>
          }
        />
        <p className="mt-1 text-xs text-slate-500">{reviewsT.pendingNotice}</p>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-slate-100 bg-slate-50 p-3">
      <ItemHeader
        title={item.productTitle}
        variantLabel={item.variantLabel}
        badge={
          !formOpen ? (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
            >
              {t.review.writeItem}
            </button>
          ) : undefined
        }
      />
      {formOpen ? (
        <div className="mt-3">
          <ReviewForm
            orderLineId={item.orderLineId}
            r={reviewsT}
            onCancel={() => setFormOpen(false)}
            onSuccess={() => {
              setFormOpen(false);
              onSubmitted();
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

function ReviewedRow({
  item,
  t,
  statusLabels,
}: {
  item: ReviewedItem;
  t: OrdersDict;
  statusLabels: Record<ProductReviewStatus, string>;
}) {
  return (
    <li className="rounded-md border border-slate-100 bg-slate-50 p-3">
      <ItemHeader
        title={item.productTitle}
        variantLabel={item.variantLabel}
        badge={
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[item.status]}`}
          >
            {statusLabels[item.status]}
          </span>
        }
      />
      {item.status === "APPROVED" ? (
        <Link
          href={`/products/${item.productSlug}#reviews`}
          className="mt-2 inline-block text-xs font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
        >
          {t.review.viewReview}
        </Link>
      ) : null}
    </li>
  );
}
