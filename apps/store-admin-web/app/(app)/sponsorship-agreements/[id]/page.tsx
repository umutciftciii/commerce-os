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
  SponsorshipPaymentMethod,
  SponsorshipSettlement,
} from "@commerce-os/api-client";
import {
  storeApi,
  UiError,
  type SponsorshipAdvance,
  type SponsorshipOpenCharge,
} from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate, formatMinor, inputToMinor, minorToInput } from "../../../../lib/client/format";
import { DetailHero, RailCard, RailRow, SurfaceCard } from "../../../components/premium";
import {
  AGREEMENT_STATUS_LABELS,
  CHARGE_DISPLAY_STATUS_LABELS,
  INELIGIBILITY_LABELS,
  PAYMENT_METHOD_LABELS,
  PRICING_MODEL_LABELS,
  SETTLEMENT_STATUS_LABELS,
  sponsorshipError,
  type Locale,
} from "../../sponsors/labels";

function errorText(error: unknown, locale: Locale): string {
  if (error instanceof UiError) return sponsorshipError(error.code) ?? messageForError(error, locale);
  return messageForError(error, locale);
}

// H-2 (ADR-181…185) — revenue-share currency guard fail-closed kodları (settlement üret/kesinleştir engellenir).
const CURRENCY_GUARD_CODES = new Set(["REVENUE_CURRENCY_MISMATCH", "SETTLEMENT_CURRENCY_MISMATCH", "AGREEMENT_CURRENCY_REQUIRED"]);
interface CurrencyGuardWarning {
  code: string;
  message: string;
  expectedCurrency?: string;
  foundCurrencies?: string[];
  mismatchedOrderCount?: number;
}
/** Currency-guard hatası ise kontrollü uyarı özeti üretir; değilse null. */
function currencyGuardWarning(error: unknown): CurrencyGuardWarning | null {
  if (!(error instanceof UiError) || !CURRENCY_GUARD_CODES.has(error.code)) return null;
  return {
    code: error.code,
    message: sponsorshipError(error.code) ?? error.code,
    expectedCurrency: error.details?.expectedCurrency,
    foundCurrencies: error.details?.foundCurrencies,
    mismatchedOrderCount: error.details?.mismatchedOrderCount,
  };
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
  const [advances, setAdvances] = useState<SponsorshipAdvance[]>([]);
  const [openCharges, setOpenCharges] = useState<SponsorshipOpenCharge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [detail, sts, advs, charges] = await Promise.all([
        storeApi.getSponsorshipAgreement(id),
        storeApi.listSponsorshipSettlements({ agreementId: id, pageSize: 50 }),
        storeApi.listSponsorshipAdvances({ agreementId: id }),
        storeApi.listSponsorshipOpenCharges({ agreementId: id }),
      ]);
      setAgreement(detail.data);
      setSettlements(sts.data);
      setAdvances(advs.data);
      setOpenCharges(charges.data);
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
  // Kullanılmamış avans = anlaşmaya bağlı avansların kalan (mahsup edilmemiş) toplamı (ADR-129).
  const unusedAdvanceMinor = advances.reduce((sum, adv) => sum + adv.availableMinor, 0);

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
          <BillingPanel
            agreement={a}
            advances={advances}
            openCharges={openCharges}
            locale={locale}
            onChange={() => void load()}
            onError={setError}
            onNotice={setNotice}
          />
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
          <RailRow
            label="Kullanılmamış avans"
            value={<span className="text-sky-300">{formatMinor(unusedAdvanceMinor, a.currency)}</span>}
          />
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
  // H-2 — karışık-para fail-closed uyarısı (kontrollü; ham finansal veri/PII göstermez).
  const [currencyWarn, setCurrencyWarn] = useState<CurrencyGuardWarning | null>(null);

  /** Currency-guard hatasıysa kontrollü uyarı kur; değilse genel hata olarak ilet. */
  function handleActionError(e: unknown) {
    const warn = currencyGuardWarning(e);
    if (warn) setCurrencyWarn(warn);
    else onError(errorText(e, locale));
  }

  async function preview() {
    setBusy(true);
    setCurrencyWarn(null);
    try {
      await storeApi.previewSponsorshipSettlement(agreement.id, {
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        periodKind: "MANUAL",
      });
      onNotice("Mutabakat taslağı hesaplandı.");
      onChange();
    } catch (e) {
      handleActionError(e);
    } finally {
      setBusy(false);
    }
  }

  async function finalize(settlementId: string) {
    setCurrencyWarn(null);
    try {
      await storeApi.finalizeSponsorshipSettlement(settlementId);
      onNotice("Mutabakat kesinleşti (immutable).");
      onChange();
    } catch (e) {
      handleActionError(e);
    }
  }

  async function charge(settlementId: string) {
    setCurrencyWarn(null);
    try {
      await storeApi.createSponsorshipCharge(settlementId, { issue: true });
      onNotice("Tahakkuk oluşturuldu ve düzenlendi.");
      onChange();
    } catch (e) {
      handleActionError(e);
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

      {currencyWarn ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm">
          <p className="font-medium text-amber-200">Para birimi uyuşmazlığı — mutabakat oluşturulamaz</p>
          <p className="mt-1 text-amber-100/80">{currencyWarn.message}</p>
          {currencyWarn.expectedCurrency || typeof currencyWarn.mismatchedOrderCount === "number" ? (
            <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs text-amber-100/70">
              {currencyWarn.expectedCurrency ? (
                <>
                  <dt className="text-amber-100/50">Beklenen para birimi</dt>
                  <dd className="font-medium tabular-nums">{currencyWarn.expectedCurrency}</dd>
                </>
              ) : null}
              {currencyWarn.foundCurrencies && currencyWarn.foundCurrencies.length ? (
                <>
                  <dt className="text-amber-100/50">Bulunan para birimleri</dt>
                  <dd className="font-medium tabular-nums">{currencyWarn.foundCurrencies.join(", ")}</dd>
                </>
              ) : null}
              {typeof currencyWarn.mismatchedOrderCount === "number" ? (
                <>
                  <dt className="text-amber-100/50">Uyuşmayan kayıt sayısı</dt>
                  <dd className="font-medium tabular-nums">{currencyWarn.mismatchedOrderCount}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          <p className="mt-2 text-xs text-amber-100/50">Farklı para birimleri tek toplamda birleştirilemez. Dönemi tek para birimine daraltın veya siparişlerin para birimini gözden geçirin.</p>
        </div>
      ) : null}

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

/**
 * TODO-161A.2 (ADR-129) — Tahakkuk & tahsilat işlemleri: FIXED_FEE'de doğrudan tahakkuk,
 * avans girişi ve avansın açık bir tahakkuğa mahsubu (append-only; otomatik dağıtım YOK).
 */
function BillingPanel({
  agreement,
  advances,
  openCharges,
  locale,
  onChange,
  onError,
  onNotice,
}: {
  agreement: SponsorshipAgreementDetail;
  advances: SponsorshipAdvance[];
  openCharges: SponsorshipOpenCharge[];
  locale: Locale;
  onChange: () => void;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
}) {
  const isFixedFee = agreement.pricingModel === "FIXED_FEE";

  // Tahakkuk oluştur (yalnız FIXED_FEE).
  const [chargeAmount, setChargeAmount] = useState(minorToInput(agreement.agreedAmountMinor));
  const [chargeBusy, setChargeBusy] = useState(false);

  // Avans ekle.
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<SponsorshipPaymentMethod>("BANK_TRANSFER");
  const [advanceBusy, setAdvanceBusy] = useState(false);

  // Avansı mahsup et.
  const usableAdvances = advances.filter((adv) => adv.availableMinor > 0);
  const [allocAdvanceId, setAllocAdvanceId] = useState("");
  const [allocChargeId, setAllocChargeId] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const [allocBusy, setAllocBusy] = useState(false);
  const selectedCharge = openCharges.find((ch) => ch.id === allocChargeId) ?? null;

  async function createCharge() {
    const amountMinor = inputToMinor(chargeAmount);
    if (amountMinor === null || amountMinor <= 0) {
      onError("Geçerli bir tutar girin.");
      return;
    }
    setChargeBusy(true);
    try {
      await storeApi.createFixedFeeSponsorshipCharge(agreement.id, { amountMinor, issue: true });
      onNotice("Tahakkuk oluşturuldu ve düzenlendi.");
      onChange();
    } catch (e) {
      onError(errorText(e, locale));
    } finally {
      setChargeBusy(false);
    }
  }

  async function addAdvance() {
    const amountMinor = inputToMinor(advanceAmount);
    if (amountMinor === null || amountMinor <= 0) {
      onError("Geçerli bir tutar girin.");
      return;
    }
    setAdvanceBusy(true);
    try {
      await storeApi.createSponsorshipAdvance(agreement.id, {
        amountMinor,
        currency: agreement.currency,
        method: advanceMethod,
      });
      onNotice("Avans kaydedildi.");
      setAdvanceAmount("");
      onChange();
    } catch (e) {
      onError(errorText(e, locale));
    } finally {
      setAdvanceBusy(false);
    }
  }

  async function allocate() {
    const advance = usableAdvances.find((adv) => adv.id === allocAdvanceId) ?? null;
    if (!advance || !selectedCharge) {
      onError("Avans ve tahakkuk seçin.");
      return;
    }
    const amountMinor = inputToMinor(allocAmount);
    if (amountMinor === null || amountMinor <= 0) {
      onError("Geçerli bir tutar girin.");
      return;
    }
    setAllocBusy(true);
    try {
      await storeApi.allocateSponsorshipAdvance({
        advancePaymentId: advance.id,
        chargeId: selectedCharge.id,
        amountMinor,
        // İyimser kilit: gördüğümüz kalan; sunucudakiyle uyuşmazsa BALANCE_CHANGED.
        expectedRemainingMinor: selectedCharge.remainingMinor,
      });
      onNotice("Avans mahsup edildi.");
      setAllocAmount("");
      setAllocAdvanceId("");
      setAllocChargeId("");
      onChange();
    } catch (e) {
      onError(errorText(e, locale));
    } finally {
      setAllocBusy(false);
    }
  }

  return (
    <SurfaceCard title="Tahakkuk & tahsilat" description="Doğrudan tahakkuk, avans ve mahsup (tahsilat geçmişine eklenir)">
      <div className="space-y-5">
        {isFixedFee ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-white/80">Tahakkuk oluştur</h3>
            <p className="mb-2 text-xs text-white/40">Sabit bedel anlaşmada doğrudan (mutabakat olmadan) tahakkuk. Boş bırakılırsa anlaşmanın sabit bedeli kullanılır.</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input label={`Tutar (${agreement.currency})`} inputMode="decimal" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} />
              </div>
              <Button onClick={() => void createCharge()} disabled={chargeBusy}>{chargeBusy ? "…" : "Oluştur"}</Button>
            </div>
          </div>
        ) : null}

        <div className={isFixedFee ? "border-t border-white/[0.07] pt-5" : undefined}>
          <h3 className="mb-2 text-sm font-semibold text-white/80">Avans ekle</h3>
          <p className="mb-2 text-xs text-white/40">Tahakkuka mahsup edilmemiş peşin nakit. Sonradan açık tahakkuklara mahsup edilir.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[140px] flex-1">
              <Input label={`Tutar (${agreement.currency})`} inputMode="decimal" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} />
            </div>
            <div className="min-w-[160px] flex-1">
              <Select
                label="Yöntem"
                value={advanceMethod}
                onChange={(e) => setAdvanceMethod(e.target.value as SponsorshipPaymentMethod)}
                options={(Object.keys(PAYMENT_METHOD_LABELS) as SponsorshipPaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
              />
            </div>
            <Button onClick={() => void addAdvance()} disabled={advanceBusy}>{advanceBusy ? "…" : "Ekle"}</Button>
          </div>
        </div>

        <div className="border-t border-white/[0.07] pt-5">
          <h3 className="mb-2 text-sm font-semibold text-white/80">Avansı mahsup et</h3>
          {usableAdvances.length === 0 || openCharges.length === 0 ? (
            <p className="text-sm text-white/40">
              {usableAdvances.length === 0 ? "Kullanılabilir avans yok." : "Açık (kalanı olan) tahakkuk yok."}
            </p>
          ) : (
            <div className="space-y-2">
              <Select
                label="Avans"
                value={allocAdvanceId}
                onChange={(e) => setAllocAdvanceId(e.target.value)}
                options={[
                  { value: "", label: "Avans seçin…" },
                  ...usableAdvances.map((adv) => ({
                    value: adv.id,
                    label: `${formatDate(adv.paidAt)} · ${PAYMENT_METHOD_LABELS[adv.method]} · kalan ${formatMinor(adv.availableMinor, adv.currency)}`,
                  })),
                ]}
              />
              <Select
                label="Tahakkuk"
                value={allocChargeId}
                onChange={(e) => setAllocChargeId(e.target.value)}
                options={[
                  { value: "", label: "Tahakkuk seçin…" },
                  ...openCharges.map((ch) => ({
                    value: ch.id,
                    label: `${ch.chargeNumber} · ${CHARGE_DISPLAY_STATUS_LABELS[ch.displayStatus]} · kalan ${formatMinor(ch.remainingMinor, ch.currency)}`,
                  })),
                ]}
              />
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label={`Mahsup tutarı (${agreement.currency})`}
                    inputMode="decimal"
                    value={allocAmount}
                    onChange={(e) => setAllocAmount(e.target.value)}
                  />
                  {selectedCharge ? (
                    <p className="mt-1 text-xs text-white/40">Bu tahakkukta kalan: {formatMinor(selectedCharge.remainingMinor, selectedCharge.currency)}</p>
                  ) : null}
                </div>
                <Button onClick={() => void allocate()} disabled={allocBusy || !allocAdvanceId || !allocChargeId}>
                  {allocBusy ? "…" : "Mahsup et"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SurfaceCard>
  );
}
