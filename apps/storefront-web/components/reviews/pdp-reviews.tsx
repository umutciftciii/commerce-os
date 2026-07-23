"use client";

/**
 * TODO-159E (ADR-094) — PDP değerlendirme bölümü.
 *
 * SSR ilk sayfa + özet + uygunluk props ile gelir; filtre/sort/sayfalama istemcide
 * `/api/reviews/{productId}` proxy'sinden (gateway URL sunucu-yalnız kalır). "Yorum yaz"
 * akışı: giriş yok → login; uygun değil → mesaj; uygun → form → gönderim sonrası PENDING.
 * Faydalı oyu optimistic. Tüm puan verisi GERÇEK (mock yok); Theme token'ları kullanılır.
 */
import { useState } from "react";
import Link from "next/link";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type {
  PublicReview,
  ReviewEligibilityResponse,
  ReviewPublicListResponse,
  ReviewSummary,
} from "@commerce-os/api-client";
import { Stars } from "../ui/stars";
import {
  createReviewAction,
  toggleReviewHelpfulAction,
} from "../../lib/server/reviews-actions";

type Eligibility = ReviewEligibilityResponse["data"] | null;
type SortValue = "newest" | "oldest" | "highest" | "lowest" | "most_helpful";

export function PdpReviews({
  productId,
  initial,
  eligibility,
  loginHref,
  t,
  locale,
}: {
  productId: string;
  initial: ReviewPublicListResponse;
  eligibility: Eligibility;
  loginHref: string;
  t: StorefrontDictionary;
  locale: string;
}) {
  const r = t.reviews;
  const [summary, setSummary] = useState<ReviewSummary>(initial.summary);
  const [reviews, setReviews] = useState<PublicReview[]>(initial.data);
  const [page, setPage] = useState<number>(initial.pagination.page);
  const [totalPages, setTotalPages] = useState<number>(initial.pagination.totalPages);
  const [sort, setSort] = useState<SortValue>("newest");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchPage = async (nextPage: number, nextSort: SortValue, nextRating: number | null) => {
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(nextPage));
      qs.set("sort", nextSort);
      if (nextRating) qs.set("rating", String(nextRating));
      const res = await fetch(`/api/reviews/${encodeURIComponent(productId)}?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load-failed");
      const data = (await res.json()) as ReviewPublicListResponse;
      setSummary(data.summary);
      setReviews((prev) => (nextPage > 1 ? [...prev, ...data.data] : data.data));
      setPage(data.pagination.page);
      setTotalPages(data.pagination.totalPages);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const applySort = (value: SortValue) => {
    setSort(value);
    void fetchPage(1, value, ratingFilter);
  };
  const applyRating = (value: number | null) => {
    setRatingFilter(value);
    void fetchPage(1, sort, value);
  };

  const hasReviews = summary.reviewCount > 0;

  return (
    <section className="mt-20 border-t border-line pt-12" id="reviews" aria-label={r.title}>
      <h2 className="text-xl font-medium text-ink sm:text-2xl">{r.title}</h2>

      <div className="mt-8 grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* Özet + dağılım + yaz aksiyonu */}
        <div className="space-y-6">
          {hasReviews ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-semibold text-ink">
                  {summary.averageRating.toFixed(1)}
                </span>
                <div>
                  <Stars
                    rating={summary.averageRating}
                    ariaLabel={format(r.averageAria, { rating: summary.averageRating.toFixed(1) })}
                  />
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    {format(r.basedOn, { count: summary.reviewCount })}
                  </p>
                </div>
              </div>
              <Distribution summary={summary} activeRating={ratingFilter} onSelect={applyRating} r={r} />
            </>
          ) : (
            <p className="text-sm text-ink-subtle">{r.emptyBody}</p>
          )}

          <WriteReviewPanel
            eligibility={eligibility}
            loginHref={loginHref}
            t={t}
            onCreated={() => {
              // Gönderim PENDING → hemen listede görünmez; özeti tazelemek için ilk sayfayı çek.
              void fetchPage(1, sort, ratingFilter);
            }}
          />
        </div>

        {/* Liste + kontroller */}
        <div>
          {hasReviews ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <RatingFilterChips activeRating={ratingFilter} onSelect={applyRating} r={r} />
              <label className="flex items-center gap-2 text-xs text-ink-subtle">
                {r.sortLabel}
                <select
                  value={sort}
                  onChange={(e) => applySort(e.target.value as SortValue)}
                  className="rounded-sm border border-line bg-surface px-2 py-1 text-xs text-ink"
                >
                  <option value="newest">{r.sort.newest}</option>
                  <option value="oldest">{r.sort.oldest}</option>
                  <option value="highest">{r.sort.highest}</option>
                  <option value="lowest">{r.sort.lowest}</option>
                  <option value="most_helpful">{r.sort.most_helpful}</option>
                </select>
              </label>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-sm border border-line bg-surface p-6 text-center">
              <p className="text-sm text-ink-subtle">{r.loadError}</p>
              <button
                type="button"
                onClick={() => void fetchPage(page, sort, ratingFilter)}
                className="mt-3 text-xs font-medium uppercase tracking-wideish text-ink underline underline-offset-4"
              >
                {r.retry}
              </button>
            </div>
          ) : reviews.length === 0 && !loading ? (
            <div className="rounded-sm border border-line bg-surface p-8 text-center">
              <p className="font-medium text-ink">{r.emptyTitle}</p>
              <p className="mt-1 text-sm text-ink-subtle">{r.emptyBody}</p>
            </div>
          ) : (
            <ul className="space-y-6">
              {reviews.map((review) => (
                <ReviewItem key={review.id} review={review} t={t} locale={locale} />
              ))}
            </ul>
          )}

          {loading ? <p className="mt-4 text-xs text-ink-subtle">{r.loading}</p> : null}

          {!error && page < totalPages ? (
            <button
              type="button"
              onClick={() => void fetchPage(page + 1, sort, ratingFilter)}
              disabled={loading}
              className="mt-6 w-full rounded-sm border border-line py-2.5 text-xs font-medium uppercase tracking-wideish text-ink transition-colors hover:bg-surface-muted disabled:opacity-50"
            >
              {r.loadMore}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Distribution({
  summary,
  activeRating,
  onSelect,
  r,
}: {
  summary: ReviewSummary;
  activeRating: number | null;
  onSelect: (rating: number | null) => void;
  r: StorefrontDictionary["reviews"];
}) {
  const total = summary.reviewCount || 1;
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = summary.ratingDistribution[String(star) as "1" | "2" | "3" | "4" | "5"];
        const pct = Math.round((count / total) * 100);
        const active = activeRating === star;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onSelect(active ? null : star)}
            aria-pressed={active}
            className={`flex w-full items-center gap-2 text-[11px] ${active ? "text-ink" : "text-ink-subtle"}`}
          >
            <span className="w-10 text-left">{format(r.filterStar, { rating: star })}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <span className="block h-full bg-ink/70" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-8 text-right tabular-nums">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function RatingFilterChips({
  activeRating,
  onSelect,
  r,
}: {
  activeRating: number | null;
  onSelect: (rating: number | null) => void;
  r: StorefrontDictionary["reviews"];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip active={activeRating === null} onClick={() => onSelect(null)}>
        {r.filterAll}
      </Chip>
      {[5, 4, 3, 2, 1].map((star) => (
        <Chip key={star} active={activeRating === star} onClick={() => onSelect(star)}>
          {format(r.filterStar, { rating: star })}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
        active ? "border-ink bg-ink text-surface" : "border-line text-ink-subtle hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ReviewItem({
  review,
  t,
  locale,
}: {
  review: PublicReview;
  t: StorefrontDictionary;
  locale: string;
}) {
  const r = t.reviews;
  const [helpful, setHelpful] = useState(review.viewerFoundHelpful);
  const [count, setCount] = useState(review.helpfulCount);
  const [pending, setPending] = useState(false);
  const author = review.authorName.trim() || r.anonymous;
  const dateText = new Date(review.publishedAt ?? review.createdAt).toLocaleDateString(locale);

  const onHelpful = async () => {
    if (pending) return;
    setPending(true);
    const next = !helpful;
    // Optimistic
    setHelpful(next);
    setCount((c) => c + (next ? 1 : -1));
    const result = await toggleReviewHelpfulAction(review.id, next);
    if (!result.ok) {
      // Rollback
      setHelpful(!next);
      setCount((c) => c + (next ? -1 : 1));
    } else {
      setHelpful(result.helpful);
      setCount(result.helpfulCount);
    }
    setPending(false);
  };

  return (
    <li className="border-b border-line pb-6 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <Stars
          rating={review.rating}
          ariaLabel={format(r.averageAria, { rating: review.rating.toFixed(1) })}
        />
        <span className="text-[11px] text-ink-subtle">{dateText}</span>
      </div>
      {review.title ? <p className="mt-2 font-medium text-ink">{review.title}</p> : null}
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{review.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-subtle">
        <span className="font-medium text-ink-muted">{author}</span>
        {review.verifiedPurchase ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {r.verifiedBadge}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void onHelpful()}
          aria-pressed={helpful}
          disabled={pending}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 transition-colors disabled:opacity-50 ${
            helpful ? "border-ink text-ink" : "border-line hover:border-ink"
          }`}
        >
          {format(r.helpfulCount, { count })}
        </button>
      </div>
    </li>
  );
}

function WriteReviewPanel({
  eligibility,
  loginHref,
  t,
  onCreated,
}: {
  eligibility: Eligibility;
  loginHref: string;
  t: StorefrontDictionary;
  onCreated: () => void;
}) {
  const r = t.reviews;
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Giriş yapılmamış
  if (eligibility === null) {
    return (
      <div className="rounded-sm border border-line bg-surface p-4 text-sm">
        <p className="text-ink-subtle">{r.loginPrompt}</p>
        <Link
          href={loginHref}
          className="mt-2 inline-block text-xs font-medium uppercase tracking-wideish text-ink underline underline-offset-4"
        >
          {r.loginCta}
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-sm border border-line bg-surface p-4 text-sm text-ink-muted">
        {r.pendingNotice}
      </div>
    );
  }

  // Zaten yorumlamış
  if (!eligibility.eligible && eligibility.reason === "ALREADY_REVIEWED") {
    return (
      <div className="rounded-sm border border-line bg-surface p-4 text-sm text-ink-subtle">
        {r.alreadyReviewed}
      </div>
    );
  }
  // Uygun satın alma yok
  if (!eligibility.eligible) {
    return (
      <div className="rounded-sm border border-line bg-surface p-4 text-sm text-ink-subtle">
        {r.notEligible}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-sm bg-ink py-2.5 text-xs font-medium uppercase tracking-wideish text-surface transition-opacity hover:opacity-90"
      >
        {r.writeCta}
      </button>
    );
  }

  return (
    <ReviewForm
      orderLineId={eligibility.orderLineId ?? ""}
      r={r}
      onCancel={() => setOpen(false)}
      onSuccess={() => {
        setSubmitted(true);
        setOpen(false);
        onCreated();
      }}
    />
  );
}

/**
 * Paylaşılan yorum formu (PDP + sipariş yüzeyi ortak). `orderLineId` sunucudan gelen
 * uygun kalem kimliğidir; gönderim {@link createReviewAction} ile PENDING oluşturur.
 */
export function ReviewForm({
  orderLineId,
  r,
  onCancel,
  onSuccess,
}: {
  orderLineId: string;
  r: StorefrontDictionary["reviews"];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const f = r.form;
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (rating < 1) {
      setError(f.ratingRequired);
      return;
    }
    if (!body.trim()) {
      setError(f.bodyRequired);
      return;
    }
    setBusy(true);
    const result = await createReviewAction({
      orderLineId,
      rating,
      title: title.trim() || null,
      body: body.trim(),
    });
    if (result.ok) {
      onSuccess();
    } else {
      setError(f.submitError);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-sm border border-line bg-surface p-4">
      <div>
        <p className="mb-1 text-xs font-medium text-ink">{f.ratingLabel}</p>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={String(star)}
              onMouseEnter={() => setHover(star)}
              onClick={() => setRating(star)}
              className="text-xl leading-none"
            >
              <span className={(hover || rating) >= star ? "text-ink" : "text-line-strong"}>★</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink">{f.titleLabel}</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder={f.titlePlaceholder}
          className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink">{f.bodyLabel}</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={4}
          placeholder={f.bodyPlaceholder}
          className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="flex-1 rounded-sm bg-ink py-2 text-xs font-medium uppercase tracking-wideish text-surface disabled:opacity-50"
        >
          {f.submit}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-sm border border-line px-4 py-2 text-xs font-medium uppercase tracking-wideish text-ink"
        >
          {f.cancel}
        </button>
      </div>
    </div>
  );
}
