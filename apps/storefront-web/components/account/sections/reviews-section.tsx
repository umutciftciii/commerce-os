"use client";

/**
 * TODO-159E (ADR-094) — Hesabım "Değerlendirmelerim" bölümü.
 *
 * İki blok: (1) yoruma uygun sipariş kalemleri (PDP'de yaz), (2) kendi yorumlarım
 * (tüm durumlar; PENDING/APPROVED/REJECTED/HIDDEN). İzinli durumda inline düzenleme
 * (approved düzenlenirse tekrar PENDING'e döner — gateway zorlar). Sadeleştirilmiş,
 * account (light) temasıyla uyumlu.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "@commerce-os/i18n";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerReview, ReviewEligibleOrderLine, ProductReviewStatus } from "@commerce-os/api-client";
import { updateReviewAction } from "../../../lib/server/reviews-actions";

type AccountDict = StorefrontDictionary["account"];

const STATUS_STYLE: Record<ProductReviewStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  HIDDEN: "bg-slate-200 text-slate-600",
};

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-hidden className="text-amber-500">
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function ReviewsSection({
  t,
  reviews,
  eligible,
  locale,
}: {
  t: AccountDict;
  reviews: CustomerReview[];
  eligible: ReviewEligibleOrderLine[];
  locale: string;
}) {
  const r = t.reviews;
  const statusLabels = r.statusLabels as Record<ProductReviewStatus, string>;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">{r.title}</h1>

      {/* Değerlendirebileceğiniz ürünler */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {r.eligibleTitle}
        </h2>
        {eligible.length === 0 ? (
          <p className="text-sm text-slate-500">{r.eligibleEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {eligible.map((item) => (
              <li
                key={item.orderLineId}
                className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-3"
              >
                <ProductThumb url={item.productImageUrl} alt={item.productTitle} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{item.productTitle}</p>
                  <p className="text-xs text-slate-500">
                    {format(r.purchasedAt, { date: new Date(item.purchasedAt).toLocaleDateString(locale) })}
                  </p>
                </div>
                <Link
                  href={`/products/${item.productSlug}#reviews`}
                  className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                >
                  {r.writeCta}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Kendi yorumlarım */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{r.myTitle}</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500">{r.myEmpty}</p>
        ) : (
          <ul className="space-y-4">
            {reviews.map((review) => (
              <MyReviewItem
                key={review.id}
                review={review}
                r={r}
                statusLabels={statusLabels}
                locale={locale}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProductThumb({ url, alt }: { url: string | null; alt: string }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100">
      {url ? <img src={url} alt={alt} className="h-full w-full object-cover" /> : null}
    </div>
  );
}

function MyReviewItem({
  review,
  r,
  statusLabels,
  locale,
}: {
  review: CustomerReview;
  r: AccountDict["reviews"];
  statusLabels: Record<ProductReviewStatus, string>;
  locale: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(review.rating);
  const [title, setTitle] = useState(review.title ?? "");
  const [body, setBody] = useState(review.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setBusy(true);
    const result = await updateReviewAction({
      reviewId: review.id,
      rating,
      title: title.trim() || null,
      body: body.trim(),
    });
    if (result.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setError(r.saveError);
    }
    setBusy(false);
  };

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/products/${review.productSlug}`}
            className="font-medium text-slate-900 hover:underline"
          >
            {review.productTitle}
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <Stars rating={review.rating} />
            <span className="text-xs text-slate-400">
              {new Date(review.createdAt).toLocaleDateString(locale)}
            </span>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[review.status]}`}
        >
          {statusLabels[review.status]}
        </span>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-500">{r.editNotice}</p>
          <div className="flex gap-1" onMouseLeave={() => undefined}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                aria-label={String(star)}
                onClick={() => setRating(star)}
                className={`text-lg ${rating >= star ? "text-amber-500" : "text-slate-300"}`}
              >
                ★
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={r.titlePlaceholder}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder={r.bodyPlaceholder}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {r.save}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="rounded-md border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700"
            >
              {r.cancel}
            </button>
          </div>
        </div>
      ) : (
        <>
          {review.title ? <p className="mt-2 font-medium text-slate-800">{review.title}</p> : null}
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{review.body}</p>
          {review.editable ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-3 text-xs font-medium text-slate-700 underline underline-offset-2"
            >
              {r.edit}
            </button>
          ) : null}
        </>
      )}
    </li>
  );
}
