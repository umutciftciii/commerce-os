"use client";

/**
 * TODO-161 — Sponsorlu kampanya detay + düzenleme. Üstte kampanya-kapsamlı performans panosu,
 * altta düzenleme formu (ürün/keyword atomik replace-set). placement IMMUTABLE (form kilitli).
 */

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, PageHeader, SkeletonRows, useLocale } from "../../../../components/ui";
import { SurfaceCard } from "../../../components/premium";
import { CampaignIcon } from "../../../../components/icons";
import type { SponsoredCampaignDetail } from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
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
