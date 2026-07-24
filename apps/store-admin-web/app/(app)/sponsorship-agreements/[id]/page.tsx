"use client";

/**
 * TODO-161A — Anlaşma detayı: yaşam döngüsü (durum geçişleri allowlist), kampanya bağlama
 * (anlaşma penceresi kampanyayı kapsamalı — ADR-122), dönem mutabakatı önizle → kesinleştir →
 * tahakkuk üret. Ticari uygunluk göstergesi (ADR-124) üstte açıkça gösterilir.
 */
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Select, SkeletonRows, useLocale } from "../../../../components/ui";
import type {
  SponsoredCampaignSummary,
  SponsorshipAgreementDetail,
  SponsorshipAgreementStatus,
  SponsorshipSettlement,
} from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../../lib/client/format";
import { DetailHero, RailCard, RailRow, SurfaceCard } from "../../../components/premium";
import {
  AGREEMENT_STATUS_LABELS,
  INELIGIBILITY_LABELS,
  PRICING_MODEL_LABELS,
  SETTLEMENT_STATUS_LABELS,
  sponsorshipError,
  type Locale,
} from "../../sponsors/labels";

function errorText(error: unknown, locale: Locale): string {
  if (error instanceof UiError) return sponsorshipError(error.code) ?? messageForError(error, locale);
  return messageForError(error, locale);
}

const NEXT_STATUSES: Record<SponsorshipAgreementStatus, SponsorshipAgreementStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "ACTIVE", "CANCELLED"],
  PENDING_APPROVAL: ["ACTIVE", "DRAFT", "CANCELLED"],
  ACTIVE: ["SUSPENDED", "COMPLETED", "CANCELLED"],
  SUSPENDED: ["ACTIVE", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export default function AgreementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const locale = useLocale() as Locale;
  const [agreement, setAgreement] = useState<SponsorshipAgreementDetail | null>(null);
  const [settlements, setSettlements] = useState<SponsorshipSettlement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [detail, sts] = await Promise.all([
        storeApi.getSponsorshipAgreement(id),
        storeApi.listSponsorshipSettlements({ agreementId: id, pageSize: 50 }),
      ]);
      setAgreement(detail.data);
      setSettlements(sts.data);
    } catch (e) {
      setError(errorText(e, locale));
    }
  }, [id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  async function transition(next: SponsorshipAgreementStatus) {
    try {
      await storeApi.updateSponsorshipAgreement(id, { status: next });
      void load();
    } catch (e) {
      setError(errorText(e, locale));
    }
  }

  if (error && !agreement) return <Alert tone="error" title="Yüklenemedi">{error}</Alert>;
  if (!agreement) return <SkeletonRows rows={6} />;

  const a = agreement;

  return (
    <div className="space-y-5">
      <DetailHero
        eyebrow={`Anlaşma · ${PRICING_MODEL_LABELS[a.pricingModel]}`}
        title={`${a.agreementNumber} · ${a.title}`}
        subtitle={<Link href={`/sponsors/${a.sponsorAccountId}`} className="hover:underline">{a.sponsorCompanyName}</Link>}
        badges={
          <div className="flex items-center gap-1.5">
            <Badge tone={a.status === "ACTIVE" ? "success" : a.status === "CANCELLED" ? "danger" : "neutral"}>{AGREEMENT_STATUS_LABELS[a.status]}</Badge>
            {a.hasOverdueCharge ? <Badge tone="danger">Vade aşımı</Badge> : null}
            {a.budgetExhausted ? <Badge tone="warning">Bütçe tükendi</Badge> : null}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {NEXT_STATUSES[a.status].map((next) => (
              <Button key={next} variant="secondary" size="sm" onClick={() => void transition(next)}>
                → {AGREEMENT_STATUS_LABELS[next]}
              </Button>
            ))}
          </div>
        }
        backHref="/sponsorship-agreements"
        backLabel="Anlaşmalar"
      />

      {!a.commerciallyEligible ? (
        <Alert tone="warning" title="Ticari uygunluk riski">
          Bu anlaşma şu an sponsorlu teslim için uygun değil: {a.ineligibilityReason ? INELIGIBILITY_LABELS[a.ineligibilityReason] ?? a.ineligibilityReason : "—"}. Bağlı SPONSORED kampanyalar (mağaza ayarı izin vermiyorsa) yayınlanmaz.
        </Alert>
      ) : null}
      {notice ? <Alert tone="success" title="Tamam">{notice}</Alert> : null}
      {error ? <Alert tone="error" title="Hata">{error}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <CampaignLinker agreement={a} locale={locale} onChange={() => void load()} onError={setError} />
          <SettlementPanel agreement={a} settlements={settlements} locale={locale} onChange={() => void load()} onError={setError} onNotice={setNotice} />
        </div>

        <RailCard title="Sözleşme koşulları">
          <RailRow label="Dönem" value={`${formatDate(a.startsAt)} – ${formatDate(a.endsAt)}`} />
          <RailRow label="Para birimi" value={a.currency} />
          <RailRow label="Model" value={PRICING_MODEL_LABELS[a.pricingModel]} />
          {a.agreedAmountMinor != null ? <RailRow label="Sabit bedel" value={formatMinor(a.agreedAmountMinor, a.currency)} /> : null}
          {a.unitPriceMinor != null ? <RailRow label="Birim bedel" value={formatMinor(a.unitPriceMinor, a.currency)} /> : null}
          {a.revenueSharePercentBp != null ? <RailRow label="Gelir payı" value={`%${(a.revenueSharePercentBp / 100).toFixed(2)}`} /> : null}
          {a.budgetLimitMinor != null ? <RailRow label="Bütçe limiti" value={formatMinor(a.budgetLimitMinor, a.currency)} /> : null}
          <RailRow label="KDV" value={`%${(a.taxRateBp / 100).toFixed(2)}`} />
          <RailRow label="Vade" value={`${a.paymentTermDays} gün`} />
          <RailRow label="Tahakkuk" value={formatMinor(a.chargedMinor, a.currency)} />
          <RailRow label="Tahsil" value={formatMinor(a.paidMinor, a.currency)} />
          <RailRow label="Kalan" value={formatMinor(a.outstandingMinor, a.currency)} />
        </RailCard>
      </div>
    </div>
  );
}

function CampaignLinker({ agreement, locale, onChange, onError }: { agreement: SponsorshipAgreementDetail; locale: Locale; onChange: () => void; onError: (m: string) => void }) {
  const [candidates, setCandidates] = useState<SponsoredCampaignSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    storeApi.listSponsoredCampaigns({ pageSize: 100 }).then((r) => setCandidates(r.data)).catch(() => {});
  }, []);

  const linkedIds = new Set(agreement.campaigns.map((c) => c.campaignId));
  const available = candidates.filter((c) => !linkedIds.has(c.id));

  async function link() {
    if (!selected) return;
    setBusy(true);
    try {
      await storeApi.linkSponsorshipCampaign(agreement.id, { campaignId: selected });
      setSelected("");
      onChange();
    } catch (e) {
      onError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(campaignId: string) {
    try {
      await storeApi.unlinkSponsorshipCampaign(agreement.id, campaignId);
      onChange();
    } catch (e) {
      onError(errorText(e, locale));
    }
  }

  return (
    <SurfaceCard title="Bağlı kampanyalar" description="Anlaşma tarih penceresi kampanyayı tümüyle kapsamalı">
      {agreement.campaigns.length === 0 ? (
        <p className="px-1 py-4 text-sm text-white/40">Henüz kampanya bağlı değil.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {agreement.campaigns.map((c) => (
            <li key={c.campaignId} className="flex items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium text-white/85">{c.campaignName}</div>
                <div className="text-xs text-white/40">{c.placement} · {c.commercialMode === "SPONSORED" ? "Sponsorlu" : "İç promosyon"}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void unlink(c.campaignId)}>Bağı çöz</Button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 ? (
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Select label="Kampanya bağla" options={[{ value: "", label: "Seçin…" }, ...available.map((c) => ({ value: c.id, label: c.name }))]} value={selected} onChange={(e) => setSelected(e.target.value)} />
          </div>
          <Button onClick={() => void link()} disabled={busy || !selected}>{busy ? "…" : "Bağla"}</Button>
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function SettlementPanel({
  agreement,
  settlements,
  locale,
  onChange,
  onError,
  onNotice,
}: {
  agreement: SponsorshipAgreementDetail;
  settlements: SponsorshipSettlement[];
  locale: Locale;
  onChange: () => void;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
}) {
  const [periodStart, setPeriodStart] = useState(agreement.startsAt.slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(agreement.endsAt.slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true);
    try {
      await storeApi.previewSponsorshipSettlement(agreement.id, {
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        periodKind: "MANUAL",
      });
      onNotice("Mutabakat taslağı hesaplandı.");
      onChange();
    } catch (e) {
      onError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }

  async function finalize(settlementId: string) {
    try {
      await storeApi.finalizeSponsorshipSettlement(settlementId);
      onNotice("Mutabakat kesinleşti (immutable).");
      onChange();
    } catch (e) {
      onError(errorText(e, locale));
    }
  }

  async function charge(settlementId: string) {
    try {
      await storeApi.createSponsorshipCharge(settlementId, { issue: true });
      onNotice("Tahakkuk oluşturuldu ve düzenlendi.");
      onChange();
    } catch (e) {
      onError(errorText(e, locale));
    }
  }

  async function refundAdjust(settlementId: string) {
    try {
      const res = await storeApi.createSponsorshipRefundAdjustment(settlementId);
      onNotice(res.data ? "İade düzeltme tahakkuku oluşturuldu." : "İade etkisi yok — düzeltme gerekmedi.");
      onChange();
    } catch (e) {
      onError(errorText(e, locale));
    }
  }

  return (
    <SurfaceCard title="Dönem mutabakatı" description="Metrik snapshot → kesinleştir → tahakkuk (ADR-123)">
      <div className="flex items-end gap-2">
        <div className="flex-1"><Input label="Dönem başı" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
        <div className="flex-1"><Input label="Dönem sonu" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
        <Button onClick={() => void preview()} disabled={busy}>{busy ? "…" : "Önizle / Hesapla"}</Button>
      </div>

      {settlements.length === 0 ? (
        <p className="mt-4 px-1 text-sm text-white/40">Henüz mutabakat yok. Bir dönem seçip hesaplayın.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-white/50">
              <tr className="border-b border-white/10 text-left">
                <th className="px-3 py-2 font-medium">Dönem</th>
                <th className="px-3 py-2 text-right font-medium">Gösterim</th>
                <th className="px-3 py-2 text-right font-medium">Tıklama</th>
                <th className="px-3 py-2 text-right font-medium">Sipariş</th>
                <th className="px-3 py-2 text-right font-medium">Bedel</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                <th className="px-3 py-2 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.id} className="border-b border-white/5 text-white/80">
                  <td className="px-3 py-2 text-xs">{formatDate(s.periodStart)}–{formatDate(s.periodEnd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.billableImpressions}<span className="text-white/30">/{s.impressions}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.billableClicks}<span className="text-white/30">/{s.clicks}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMinor(s.calculatedChargeMinor, s.currency)}</td>
                  <td className="px-3 py-2"><Badge tone={s.status === "FINALIZED" ? "info" : "neutral"}>{SETTLEMENT_STATUS_LABELS[s.status]}</Badge></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {s.status === "DRAFT" ? <Button variant="secondary" size="sm" onClick={() => void finalize(s.id)}>Kesinleştir</Button> : null}
                      {s.status === "FINALIZED" && !s.chargeId ? <Button variant="secondary" size="sm" onClick={() => void charge(s.id)}>Tahakkuk üret</Button> : null}
                      {s.status === "FINALIZED" && s.chargeId ? <Button variant="ghost" size="sm" onClick={() => void refundAdjust(s.id)}>İade düzelt</Button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SurfaceCard>
  );
}
