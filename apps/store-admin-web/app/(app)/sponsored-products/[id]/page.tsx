"use client";

/**
 * TODO-161 — Sponsorlu kampanya detay + düzenleme. Üstte kampanya-kapsamlı performans panosu,
 * altta düzenleme formu (ürün/keyword atomik replace-set). placement IMMUTABLE (form kilitli).
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, PageHeader, SkeletonRows, useLocale } from "../../../../components/ui";
import { RailRow, SurfaceCard } from "../../../components/premium";
import { CampaignIcon } from "../../../../components/icons";
import type { SponsoredCampaignDetail } from "@commerce-os/api-client";
import { storeApi, type SponsorshipCampaignCommercialSummary } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatMinor } from "../../../../lib/client/format";
import {
  AGREEMENT_STATUS_LABELS,
  INELIGIBILITY_LABELS,
  PRICING_MODEL_LABELS,
} from "../../sponsors/labels";
import { sponsoredLabels, type Locale } from "../labels";
import { SponsoredCampaignForm } from "../sponsored-form";
import { SponsoredDashboard } from "../dashboard";

export default function SponsoredCampaignDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const locale = useLocale() as Locale;
  const t = sponsoredLabels(locale);

  const [detail, setDetail] = useState<SponsoredCampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await storeApi.getSponsoredCampaign(id);
      setDetail(res.data);
    } catch (cause) {
      setError(messageForError(cause, locale));
    } finally {
      setLoading(false);
    }
  }, [id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={detail?.name ?? t.editTitle}
        description={t.description}
        actions={<Button variant="secondary" onClick={() => router.push("/sponsored-products")}>{t.back}</Button>}
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading && !detail ? <SkeletonRows rows={4} /> : null}

      {detail ? (
        <>
          <CommercialSummaryCard campaignId={detail.id} locale={locale} />
          <SponsoredDashboard t={t} locale={locale} campaignId={detail.id} />
          <SurfaceCard title={t.editTitle} icon={<CampaignIcon />}>
            <SponsoredCampaignForm
              editing={detail}
              labels={t.form}
              locale={locale}
              onSaved={() => void load()}
              onCancel={() => router.push("/sponsored-products")}
            />
          </SurfaceCard>
        </>
      ) : null}
    </div>
  );
}

/**
 * TODO-161A.2 (ADR-128) — Kampanya ticari özeti. SPONSORED kampanyada sponsor/anlaşma/finans;
 * INTERNAL_PROMOTION'da sade bilgi etiketi; anlaşmasız SPONSORED'da aktivasyon uyarısı.
 */
function CommercialSummaryCard({ campaignId, locale }: { campaignId: string; locale: Locale }) {
  const [summary, setSummary] = useState<SponsorshipCampaignCommercialSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    storeApi
      .getCampaignCommercialSummary(campaignId)
      .then((r) => {
        if (!cancelled) setSummary(r.data);
      })
      .catch((e) => {
        if (!cancelled) setError(messageForError(e, locale));
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, locale]);

  if (error) return null; // Ticari özet ikincil bilgidir; hata sayfayı bloklamasın.
  if (!summary) return null;

  if (summary.commercialMode === "INTERNAL_PROMOTION") {
    return (
      <SurfaceCard title="Ticari özet" description="Bu kampanya bir iç promosyondur">
        <p className="px-1 py-2 text-sm text-white/50">
          İç promosyon — sponsor firma ve tahakkuk yok. Kampanya mağazanızın kendi ürünlerini öne çıkarır.
        </p>
      </SurfaceCard>
    );
  }

  const ag = summary.agreement;
  const currency = summary.currency ?? ag?.currency ?? "TRY";

  return (
    <SurfaceCard title="Ticari özet" description="Sponsor, anlaşma ve tahsilat durumu">
      {!ag ? (
        <Alert tone="warning" title="Anlaşma bağlı değil">
          Bu ticari sponsorlu kampanyaya henüz bir anlaşma bağlı değil. Kampanyanın yayınlanması için ilgili
          anlaşma sayfasından bağlama yapın.
        </Alert>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link
                href={`/sponsorship-agreements/${ag.id}`}
                className="text-sm font-medium text-indigo-300 hover:underline"
              >
                {ag.agreementNumber} · {ag.title}
              </Link>
              <Badge tone={ag.status === "ACTIVE" ? "success" : ag.status === "CANCELLED" ? "danger" : "neutral"}>
                {AGREEMENT_STATUS_LABELS[ag.status]}
              </Badge>
            </div>
            <RailRow label="Sponsor" value={ag.sponsorCompanyName} />
            <RailRow label="Model" value={PRICING_MODEL_LABELS[ag.pricingModel]} />
            <RailRow label="Para birimi" value={ag.currency} />
            <RailRow
              label="Kampanya ayrımı"
              value={ag.allocationAmountMinor === null ? "—" : formatMinor(ag.allocationAmountMinor, ag.currency)}
            />
            {!ag.commerciallyEligible ? (
              <p className="mt-2 text-xs text-amber-300">
                {ag.ineligibilityReason
                  ? INELIGIBILITY_LABELS[ag.ineligibilityReason] ?? ag.ineligibilityReason
                  : "Anlaşma şu an sponsorlu teslim için uygun değil."}
              </p>
            ) : null}
          </div>
          <div>
            <RailRow label="Tahakkuk" value={formatMinor(summary.chargedMinor, currency)} />
            <RailRow label="Tahsil" value={formatMinor(summary.paidMinor, currency)} />
            <RailRow label="Kalan alacak" value={formatMinor(summary.outstandingMinor, currency)} />
            <RailRow
              label="Vadesi geçen"
              value={
                <span className={summary.overdueMinor > 0 ? "text-rose-300" : undefined}>
                  {formatMinor(summary.overdueMinor, currency)}
                </span>
              }
            />
          </div>
        </div>
      )}
    </SurfaceCard>
  );
}
