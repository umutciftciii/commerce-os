"use client";

/** TODO-161 — Yeni sponsorlu kampanya oluşturma sayfası (tam sayfa form). Kayıt sonrası detaya gider. */

import { useRouter } from "next/navigation";
import { PageHeader, useLocale } from "../../../../components/ui";
import { SurfaceCard } from "../../../components/premium";
import { CampaignIcon } from "../../../../components/icons";
import { sponsoredLabels, type Locale } from "../labels";
import { SponsoredCampaignForm } from "../sponsored-form";

export default function NewSponsoredCampaignPage() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = sponsoredLabels(locale);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={t.eyebrow} title={t.newTitle} description={t.description} />
      <SurfaceCard title={t.newTitle} icon={<CampaignIcon />}>
        <SponsoredCampaignForm
          editing={null}
          labels={t.form}
          locale={locale}
          onSaved={(id) => router.push(`/sponsored-products/${id}`)}
          onCancel={() => router.push("/sponsored-products")}
        />
      </SurfaceCard>
    </div>
  );
}
