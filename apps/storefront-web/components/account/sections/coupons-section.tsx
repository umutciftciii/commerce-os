"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, EmptyState } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontCouponCenterView } from "../../../lib/catalog-types";
import {
  applyWalletCouponAction,
  claimCouponAction,
  type ClaimCouponResult,
} from "../../../lib/server/cart-actions";

type CouponsDict = StorefrontDictionary["account"]["coupons"];

type TabKey = "all" | "available" | "forYou" | "used" | "expired";

/**
 * F4A.5 — Vitrin "Kuponlarım / Tüm Kuponlar" kupon merkezi (client). Sunucu-otoriter
 * kartlari (kullanilabilir + kullanildi) sekme/arama ile filtreler; "Kupon Kodu Ekle"
 * (claim) ve "Kullan" (apply) mevcut Server Action'lara delege eder — indirim tutari
 * ISTEMCIDE hesaplanmaz. "Kullan" sonrasi router.refresh() ile sunucu durumu tazelenir.
 */
export function CouponsSection({
  coupons,
  t,
}: {
  coupons: StorefrontCouponCenterView[];
  t: CouponsDict;
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");

  const hasExpired = useMemo(() => coupons.some((c) => c.state === "EXPIRED"), [coupons]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return coupons.filter((coupon) => {
      if (!matchesTab(coupon, tab)) return false;
      if (!q) return true;
      return (
        coupon.code.toLocaleLowerCase("tr").includes(q) ||
        coupon.discountText.toLocaleLowerCase("tr").includes(q)
      );
    });
  }, [coupons, tab, query]);

  const tabs: TabKey[] = ["all", "available", "forYou", "used"];
  if (hasExpired) tabs.push("expired");

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">{t.title}</h1>
      <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>

      <ClaimForm t={t} />

      <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label={t.title}>
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={tabClass(tab === key)}
          >
            {t.tabs[key]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <label htmlFor="coupon-search" className="sr-only">
          {t.searchLabel}
        </label>
        <input
          id="coupon-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchPlaceholder}
          className="h-10 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {coupons.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t.empty} description={t.emptyHint} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t.emptyFilter} description={t.emptyHint} />
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((coupon) => (
            <li key={`${coupon.code}-${coupon.state}-${coupon.usedAt ?? ""}`}>
              <CouponCard coupon={coupon} t={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sekme uyeligi (saf). "Kullanılabilir" = kullanima acik durumlar. */
function matchesTab(coupon: StorefrontCouponCenterView, tab: TabKey): boolean {
  switch (tab) {
    case "all":
      return true;
    case "available":
      return (
        coupon.state === "AVAILABLE" ||
        coupon.state === "APPLIED" ||
        coupon.state === "MIN_ORDER_NOT_MET"
      );
    case "forYou":
      return coupon.source === "ASSIGNED";
    case "used":
      return coupon.state === "USED";
    case "expired":
      return coupon.state === "EXPIRED";
  }
}

function tabClass(active: boolean): string {
  return [
    "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-brand-600 text-white"
      : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900",
  ].join(" ");
}

/** Tek kupon karti; durumuna gore rozet/aksiyon gosterir. */
function CouponCard({
  coupon,
  t,
}: {
  coupon: StorefrontCouponCenterView;
  t: CouponsDict;
}) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  function use() {
    startTransition(async () => {
      await applyWalletCouponAction(coupon.code);
      router.refresh();
    });
  }

  function copy() {
    void navigator.clipboard?.writeText(coupon.code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  const sourceLabel =
    coupon.source === "ASSIGNED"
      ? t.sourceAssigned
      : coupon.source === "CLAIMED"
        ? t.sourceClaimed
        : t.sourcePublic;

  return (
    <Card className="flex h-full flex-col justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          {coupon.source === "ASSIGNED" ? (
            <Badge tone="success">{t.badgeForYou}</Badge>
          ) : (
            <Badge tone="neutral">{t.badgeCoupon}</Badge>
          )}
          <span className="text-[11px] font-medium text-slate-400">{sourceLabel}</span>
        </div>

        <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
          {coupon.discountText}
        </p>

        <div className="mt-1 flex items-center gap-2">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-slate-700">
            {coupon.code}
          </span>
          <button
            type="button"
            onClick={copy}
            className="text-[11px] font-medium text-brand-700 hover:text-brand-800"
          >
            {copied ? t.copied : t.copyCode}
          </button>
        </div>

        <p className="mt-1.5 text-xs text-slate-500">
          {coupon.minOrderLabel ? format(t.minOrder, { amount: coupon.minOrderLabel }) : t.noMinOrder}
        </p>
        {coupon.state === "USED" ? (
          coupon.usedAt ? (
            <p className="text-xs text-slate-400">
              {format(t.usedAt, { date: formatCouponDate(coupon.usedAt) })}
            </p>
          ) : null
        ) : coupon.endsAt ? (
          <p className="text-xs text-slate-400">
            {format(t.expiry, { date: formatCouponDate(coupon.endsAt) })}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <StatusBadge state={coupon.state} t={t} />
        <CardAction coupon={coupon} t={t} pending={isPending} onUse={use} />
      </div>

      {coupon.state === "AVAILABLE" ? (
        <p className="text-[11px] text-slate-400">{t.applyHint}</p>
      ) : null}
    </Card>
  );
}

function StatusBadge({
  state,
  t,
}: {
  state: StorefrontCouponCenterView["state"];
  t: CouponsDict;
}) {
  switch (state) {
    case "APPLIED":
      return <Badge tone="success">{t.stateApplied}</Badge>;
    case "USED":
      return <Badge tone="neutral">{t.stateUsed}</Badge>;
    case "MIN_ORDER_NOT_MET":
      return <Badge tone="warning">{t.stateMinOrder}</Badge>;
    case "EXPIRED":
      return <Badge tone="neutral">{t.stateExpired}</Badge>;
    default:
      return <Badge tone="info">{t.stateAvailable}</Badge>;
  }
}

function CardAction({
  coupon,
  t,
  pending,
  onUse,
}: {
  coupon: StorefrontCouponCenterView;
  t: CouponsDict;
  pending: boolean;
  onUse: () => void;
}) {
  if (coupon.state === "USED") {
    return coupon.orderNumber ? (
      <Link
        href={`/account/orders/${encodeURIComponent(coupon.orderNumber)}`}
        className="text-xs font-medium text-brand-700 hover:text-brand-800"
      >
        {t.viewOrder}
      </Link>
    ) : null;
  }
  if (coupon.state === "APPLIED") {
    return (
      <Link href="/cart" className="text-xs font-medium text-emerald-700 hover:text-emerald-900">
        {t.goToCart}
      </Link>
    );
  }
  if (coupon.state === "AVAILABLE") {
    return (
      <Button variant="secondary" className="shrink-0" onClick={onUse} disabled={pending}>
        {t.use}
      </Button>
    );
  }
  // MIN_ORDER_NOT_MET / EXPIRED: aksiyon yok (durum rozeti yeter).
  return null;
}

/**
 * F4A.5 — "Kupon Kodu Ekle" (claim). Mevcut claimCouponAction'a delege eder;
 * basarili claim sonrasi router.refresh() ile liste tazelenir (kart eklenir).
 * Uygulama AYRIDIR — claim otomatik uygulamaz.
 */
function ClaimForm({ t }: { t: CouponsDict }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ClaimCouponResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const value = code.trim();
    if (!value) return;
    startTransition(async () => {
      const outcome = await claimCouponAction(value);
      setResult(outcome);
      if (outcome.status === "ok") {
        setCode("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
      >
        + {t.addTitle}
      </button>
    );
  }

  return (
    <div className="mt-4 max-w-md">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t.addPlaceholder}
          aria-label={t.addTitle}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm uppercase text-slate-900 placeholder:text-slate-400 placeholder:normal-case focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <Button variant="secondary" onClick={submit} disabled={isPending || !code.trim()}>
          {t.addSubmit}
        </Button>
      </div>
      {result?.status === "ok" ? (
        <Alert tone="success" className="mt-2">
          {t.addSuccess}
        </Alert>
      ) : result?.status === "error" ? (
        <Alert tone="error" className="mt-2">
          {t.addInvalid}
        </Alert>
      ) : null}
    </div>
  );
}

/** ISO tarihi kisa TR bicimine cevirir. */
function formatCouponDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}
