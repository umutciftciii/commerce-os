"use client";

/**
 * TODO-174B (ADR-283) — Müşteri Deneyimi > Sipariş Deneyimi.
 * ProductReview moderasyonundan TAMAMEN AYRI. Liste = OrderExperienceReview (recovery case OPSİYONEL).
 * KPI mağaza-geneli (ayrı endpoint). 1-2★ otomatik case; 3★ manuel açılabilir; 4-5★ case gerekmez.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  Select,
  SkeletonRows,
  StatCard,
  useLocale,
} from "../../../components/ui";
import { SurfaceCard } from "../../components/premium";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../lib/client/format";
import {
  outcomeLabel,
  recoveryStatusKeys,
  recoveryStatusLabel,
  recoveryStatusTone,
  slaState,
} from "../../../lib/client/recovery-labels";
import type {
  ExperienceKpiDto,
  ExperienceListResponse,
  ExperienceListRow,
  RecoveryReportDto,
} from "@commerce-os/api-client";

/** TD-174B-2 — Dakikayı insan-okur süreye çevirir (gün/saat/dakika). null → "—". */
function formatDuration(minutes: number | null, tr: boolean): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} ${tr ? "dk" : "min"}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h} ${tr ? "sa" : "h"} ${m} ${tr ? "dk" : "min"}` : `${h} ${tr ? "sa" : "h"}`;
  const days = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${days} ${tr ? "g" : "d"} ${rh} ${tr ? "sa" : "h"}` : `${days} ${tr ? "g" : "d"}`;
}

export default function OrderExperiencePage() {
  const locale = useLocale();
  const tr = locale === "tr";
  const router = useRouter();
  const [ratingBucket, setRatingBucket] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [kpi, setKpi] = useState<ExperienceKpiDto | null>(null);
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: ExperienceListResponse }
  >({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // TD-174B-2 — Recovery raporu (son 30 gün; trend + zamanlama + outcome + goodwill).
  const [report, setReport] = useState<RecoveryReportDto | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const query: Record<string, string> = {};
      if (ratingBucket) query.ratingBucket = ratingBucket;
      if (recoveryStatus) query.recoveryStatus = recoveryStatus;
      if (overdueOnly) query.overdueOnly = "true";
      const [data, kpiData] = await Promise.all([
        storeApi.listOrderExperience(query),
        storeApi.getOrderExperienceKpi(),
      ]);
      setKpi(kpiData);
      setState({ status: "ready", data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [ratingBucket, recoveryStatus, overdueOnly, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  // Rapor mağaza-geneli/son-30-gün; filtrelerden bağımsız (bir kez yüklenir). Fail-open.
  useEffect(() => {
    let cancelled = false;
    void storeApi
      .getRecoveryReport()
      .then((res) => {
        if (!cancelled) setReport(res);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openManual = useCallback(
    async (row: ExperienceListRow) => {
      setBusy(row.reviewId);
      setNotice(null);
      try {
        const created = await storeApi.openRecoveryCase({ reviewId: row.reviewId });
        router.push(`/order-experience/${created.caseId}`);
      } catch (error) {
        setNotice(messageForError(error, locale));
        setBusy(null);
      }
    },
    [router, locale],
  );

  const pct = (n: number) => `%${Math.round(n * 100)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tr ? "Sipariş Deneyimi" : "Order Experience"}
        description={
          tr
            ? "İptal sonrası müşteri deneyimi değerlendirmeleri ve geri kazanım operasyonu. Ürün puanlarından bağımsızdır."
            : "Post-cancellation experience reviews and recovery operations. Independent from product ratings."
        }
      />

      {kpi && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label={tr ? "Ortalama puan" : "Avg rating"} value={kpi.averageRating.toFixed(2)} />
          <StatCard label={tr ? "Toplam değerlendirme" : "Total reviews"} value={String(kpi.totalReviews)} />
          <StatCard label={tr ? "1-2★ oranı" : "1-2★ ratio"} value={pct(kpi.lowRatingRatio)} badgeTone="warning" />
          <StatCard label={tr ? "4-5★ oranı" : "4-5★ ratio"} value={pct(kpi.highRatingRatio)} badgeTone="success" />
          <StatCard label={tr ? "Açık recovery" : "Open recovery"} value={String(kpi.openRecoveryCount)} badgeTone="warning" />
          <StatCard label={tr ? "SLA geciken" : "SLA overdue"} value={String(kpi.slaOverdueCount)} badgeTone="warning" />
          <StatCard label={tr ? "Ulaşılan oranı" : "Reached ratio"} value={pct(kpi.reachedRatio)} />
          <StatCard label={tr ? "Çözüm oranı" : "Resolution ratio"} value={pct(kpi.resolutionRatio)} />
          <StatCard
            label={tr ? "Goodwill bakiyesi" : "Goodwill issued"}
            value={formatMinor(Number(kpi.totalGoodwillCreditMinor), "TRY")}
            badgeTone="info"
          />
        </div>
      )}

      {report && (
        <SurfaceCard>
          <div className="space-y-4 p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-white/80">
                {tr ? "Geri kazanım raporu" : "Recovery report"}
              </h3>
              <span className="text-xs text-white/40">
                {report.range.dateFrom} — {report.range.dateTo}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label={tr ? "Ort. ilk temas" : "Avg first contact"}
                value={formatDuration(report.avgFirstContactMinutes, tr)}
              />
              <StatCard
                label={tr ? "Ort. çözüm süresi" : "Avg resolution"}
                value={formatDuration(report.avgResolutionMinutes, tr)}
              />
              <StatCard
                label={tr ? "Ulaşma oranı" : "Contact success"}
                value={pct(report.contactSuccessRatio)}
              />
              <StatCard
                label={tr ? "İyi niyet bakiyesi" : "Goodwill issued"}
                value={formatMinor(Number(report.goodwill.totalMinor), "TRY")}
                badgeTone="info"
              />
            </div>

            {/* Puan trendi — basit dikey çubuk (son 30 gün; zero-fill). */}
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-white/40">
                {tr ? "Puan trendi (değerlendirme sayısı)" : "Rating trend (review count)"}
              </p>
              <div className="flex h-20 items-end gap-[3px]">
                {report.ratingTrend.map((point) => {
                  const max = Math.max(1, ...report.ratingTrend.map((p) => p.count));
                  const heightPct = point.count > 0 ? Math.max(6, (point.count / max) * 100) : 2;
                  const tone = point.lowCount > 0 ? "bg-amber-400/70" : "bg-sky-400/60";
                  return (
                    <div
                      key={point.date}
                      className={`flex-1 rounded-t ${point.count > 0 ? tone : "bg-white/10"}`}
                      style={{ height: `${heightPct}%` }}
                      title={`${point.date}: ${point.count} · ★${point.averageRating.toFixed(1)}`}
                    />
                  );
                })}
              </div>
            </div>

            {report.outcomeDistribution.length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-white/40">
                  {tr ? "Sonuç dağılımı" : "Outcome distribution"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {report.outcomeDistribution.map((slice) => (
                    <Badge key={slice.outcome} tone="neutral">
                      {outcomeLabel(slice.outcome, tr)}: {slice.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SurfaceCard>
      )}

      <SurfaceCard>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Select
            label={tr ? "Puan" : "Rating"}
            value={ratingBucket}
            onChange={(e) => setRatingBucket(e.target.value)}
            options={[
              { value: "", label: tr ? "Tümü" : "All" },
              { value: "ONE_TWO", label: "1-2★" },
              { value: "THREE", label: "3★" },
              { value: "FOUR_FIVE", label: "4-5★" },
            ]}
          />
          <Select
            label={tr ? "Recovery durumu" : "Recovery status"}
            value={recoveryStatus}
            onChange={(e) => setRecoveryStatus(e.target.value)}
            options={[
              { value: "", label: tr ? "Tümü" : "All" },
              ...recoveryStatusKeys.map((s) => ({ value: s, label: recoveryStatusLabel(s, tr) })),
            ]}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            {tr ? "Yalnız gecikenler" : "Overdue only"}
          </label>
        </div>
      </SurfaceCard>

      {notice && <Alert tone="error">{notice}</Alert>}

      <SurfaceCard>
        {state.status === "loading" && <SkeletonRows rows={6} />}
        {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
        {state.status === "ready" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide opacity-70">
                  <th className="p-3">{tr ? "Puan" : "Rating"}</th>
                  <th className="p-3">{tr ? "Müşteri" : "Customer"}</th>
                  <th className="p-3">{tr ? "Sipariş" : "Order"}</th>
                  <th className="p-3">{tr ? "Yorum" : "Comment"}</th>
                  <th className="p-3">{tr ? "Tarih" : "Date"}</th>
                  <th className="p-3">Recovery</th>
                  <th className="p-3">{tr ? "Atanan" : "Assignee"}</th>
                  <th className="p-3">SLA</th>
                  <th className="p-3">{tr ? "İşlem" : "Action"}</th>
                </tr>
              </thead>
              <tbody>
                {state.data.rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center opacity-60">
                      {tr ? "Kayıt yok." : "No records."}
                    </td>
                  </tr>
                )}
                {state.data.rows.map((row) => (
                  <tr key={row.reviewId} className="border-t border-white/5">
                    <td className="p-3 font-semibold">{"★".repeat(row.rating)}</td>
                    <td className="p-3">{row.customerName}</td>
                    <td className="p-3">{row.orderNumber}</td>
                    <td className="p-3 max-w-[220px] truncate opacity-80">{row.comment ?? "—"}</td>
                    <td className="p-3 whitespace-nowrap">{formatDate(row.reviewCreatedAt)}</td>
                    <td className="p-3">
                      {row.recovery ? (
                        <Badge tone={recoveryStatusTone(row.recovery.status)}>
                          {recoveryStatusLabel(row.recovery.status, tr)}
                        </Badge>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.recovery?.assigneeName ? (
                        <span className="text-xs opacity-80">{row.recovery.assigneeName}</span>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.recovery ? (
                        (() => {
                          const sla = slaState(row.recovery, Date.now(), tr);
                          return sla.state === "INSIDE" ? (
                            <span className="opacity-70 text-xs">{formatDate(row.recovery.dueAt)}</span>
                          ) : (
                            <Badge tone={sla.tone}>{sla.label}</Badge>
                          );
                        })()
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.recovery ? (
                        <Button variant="secondary" onClick={() => router.push(`/order-experience/${row.recovery!.caseId}`)}>
                          {tr ? "Detay" : "Detail"}
                        </Button>
                      ) : row.rating === 3 ? (
                        <Button variant="secondary" disabled={busy === row.reviewId} onClick={() => openManual(row)}>
                          {tr ? "Case aç" : "Open case"}
                        </Button>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-3 text-xs opacity-60">
              {tr ? "Toplam" : "Total"}: {state.data.total}
            </div>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
