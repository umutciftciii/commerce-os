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
import { formatDate } from "../../../lib/client/format";
import type { ExperienceKpiDto, ExperienceListResponse, ExperienceListRow } from "@commerce-os/api-client";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const RECOVERY_TONE: Record<string, Tone> = {
  OPEN: "warning",
  ASSIGNED: "info",
  CONTACT_ATTEMPTED: "info",
  CUSTOMER_REACHED: "info",
  ACTION_REQUIRED: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
  UNREACHABLE: "danger",
  NO_ACTION_REQUIRED: "neutral",
};

function recoveryLabel(status: string, tr: boolean): string {
  const map: Record<string, [string, string]> = {
    OPEN: ["Açık", "Open"],
    ASSIGNED: ["Atandı", "Assigned"],
    CONTACT_ATTEMPTED: ["İletişim denendi", "Contact attempted"],
    CUSTOMER_REACHED: ["Müşteriye ulaşıldı", "Customer reached"],
    ACTION_REQUIRED: ["Aksiyon gerekli", "Action required"],
    RESOLVED: ["Çözüldü", "Resolved"],
    CLOSED: ["Kapatıldı", "Closed"],
    UNREACHABLE: ["Ulaşılamadı", "Unreachable"],
    NO_ACTION_REQUIRED: ["Aksiyon gerekmez", "No action"],
  };
  const v = map[status];
  return v ? (tr ? v[0] : v[1]) : status;
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
        </div>
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
              ...Object.keys(RECOVERY_TONE).map((s) => ({ value: s, label: recoveryLabel(s, tr) })),
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
                  <th className="p-3">SLA</th>
                  <th className="p-3">{tr ? "İşlem" : "Action"}</th>
                </tr>
              </thead>
              <tbody>
                {state.data.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center opacity-60">
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
                        <Badge tone={RECOVERY_TONE[row.recovery.status] ?? "neutral"}>
                          {recoveryLabel(row.recovery.status, tr)}
                        </Badge>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.recovery?.overdue ? (
                        <Badge tone="danger">{tr ? "Gecikti" : "Overdue"}</Badge>
                      ) : row.recovery ? (
                        <span className="opacity-70 text-xs">{formatDate(row.recovery.dueAt)}</span>
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
