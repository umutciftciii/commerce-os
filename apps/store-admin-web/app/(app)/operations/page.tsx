"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Modal,
  PageHeader,
  SectionCard,
  SkeletonRows,
  StatCard,
  useLocale,
} from "../../../components/ui";
import { DashboardIcon, PaymentIcon } from "../../../components/icons";
import { formatDateTime } from "@commerce-os/i18n";
import type {
  CommercialAutomationStatusResponse,
  RetentionRunResponse,
  SettlementSchedulerRunResponse,
} from "@commerce-os/api-client";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

/**
 * TODO-161A.1 — Ticari Otomasyon Operasyon Paneli.
 *
 * Settlement scheduler + attribution retention arka plan işlerinin son çalışma
 * durumunu görünür kılar ve platform-admin'in bunları elle tetiklemesini sağlar.
 * Yıkıcı olan tek işlem retention APPLY'dir (dryRun:false) → onay diyaloğu arkasında.
 * Tüm veri BFF proxy üzerinden gelir; storeId istemciye sızmaz.
 */

type StatusData = CommercialAutomationStatusResponse["data"];
type JobRun = StatusData["settlementScheduler"];

// Aksiyon sonrası özet — başarı/uyarı Alert'inde gösterilir.
type ActionResult =
  | { kind: "settlement"; dryRun: boolean; data: SettlementSchedulerRunResponse["data"] }
  | { kind: "retention"; dryRun: boolean; data: RetentionRunResponse["data"] };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: StatusData };

// Hangi buton dönüyor (spinner + tüm butonları kilitleme).
type Pending = null | "settlement-dry" | "settlement-run" | "retention-dry" | "retention-apply";

// İki dilli yerel etiketler (paylaşılan i18n paketine dokunulmaz; Türkçe birincil).
// Kullanıcı-dostu iş dili: ham teknik terim (settlement scheduler / attribution retention /
// dry-run / apply / DRAFT) YOK. "Mutabakat" terimi uygulamanın geri kalanıyla tutarlıdır.
const L: Record<string, { tr: string; en: string }> = {
  eyebrow: { tr: "Sistem", en: "System" },
  title: { tr: "Operasyon", en: "Operations" },
  description: {
    tr: "Otomatik mutabakat oluşturma ve eski takip verilerinin temizliği. Silme işlemleri kalıcıdır.",
    en: "Automatic settlement drafts and cleanup of old tracking data. Deletions are permanent.",
  },
  statusCardTitle: { tr: "Son Çalışma Durumu", en: "Last Run Status" },
  statusCardDesc: {
    tr: "Otomatik işlerin en son ne zaman ve nasıl çalıştığı.",
    en: "When and how the automatic jobs last ran.",
  },
  settlementScheduler: { tr: "Otomatik Mutabakat", en: "Automatic Settlement" },
  attributionRetention: { tr: "Takip Verisi Temizliği", en: "Tracking Data Cleanup" },
  retentionConfig: { tr: "Saklama Süresi", en: "Retention Period" },
  neverRun: { tr: "Henüz çalışmadı", en: "Not run yet" },
  lastAt: { tr: "Son çalışma", en: "Last run" },
  createdDrafts: { tr: "Oluşturulan taslak mutabakat", en: "Draft settlements created" },
  candidateDrafts: { tr: "Oluşturulacak (önizleme)", en: "Would create" },
  erroredAgreements: { tr: "Hatalı anlaşma", en: "Failed agreements" },
  totalCandidates: { tr: "Silinecek kayıt", en: "Records to delete" },
  totalDeleted: { tr: "Silinen kayıt", en: "Records deleted" },
  sponsoredDays: { tr: "Sponsorlu olay kaydı", en: "Sponsored event records" },
  influencerDays: { tr: "Influencer tıklama kaydı", en: "Influencer click records" },
  maxDeletePerRun: { tr: "Tek seferde en fazla", en: "Max per run" },
  daysShort: { tr: "gün", en: "days" },
  actionsCardTitle: { tr: "Elle Çalıştır", en: "Run Manually" },
  actionsCardDesc: {
    tr: "İşleri şimdi elle başlatın. Önizleme yalnızca rapor verir; silme kalıcıdır.",
    en: "Start jobs now. Preview only reports; deletion is permanent.",
  },
  settlementDryRun: { tr: "Önizle", en: "Preview" },
  settlementRun: { tr: "Taslak Mutabakat Oluştur", en: "Create draft settlements" },
  retentionDryRun: { tr: "Önizle", en: "Preview" },
  retentionApply: { tr: "Eski Kayıtları Sil", en: "Delete old records" },
  settlementHint: {
    tr: "Kapanan dönemler için taslak mutabakat oluşturur. Tutarları kesinleştirmez, hiçbir şeyi silmez.",
    en: "Creates draft settlements for closed periods. Does not finalize amounts or delete anything.",
  },
  retentionHint: {
    tr: "Önizleme hiçbir şeyi silmez, yalnızca kaç kaydın sileneceğini gösterir. Silme; saklama süresi dolmuş eski takip kayıtlarını kalıcı olarak kaldırır, sipariş ve ödeme kayıtlarına dokunmaz.",
    en: "Preview deletes nothing — it only shows how many records would go. Delete permanently removes old tracking records past their retention period; orders and payments are never touched.",
  },
  confirmTitle: { tr: "Eski kayıtlar silinsin mi?", en: "Delete old records?" },
  confirmDesc: {
    tr: "Bu işlem geri alınamaz. Silinecek kapsam aşağıda.",
    en: "This cannot be undone. The scope is shown below.",
  },
  scope: { tr: "Kapsam", en: "Scope" },
  thisStore: { tr: "Bu mağaza", en: "This store" },
  confirmWarning: {
    tr: "Saklama süresi dolmuş sponsorlu olay ve influencer tıklama kayıtları KALICI olarak silinecek. Sipariş, ödeme ve mutabakat kayıtları etkilenmez.",
    en: "Sponsored event and influencer click records past their retention period will be PERMANENTLY deleted. Orders, payments and settlements are not affected.",
  },
  confirmApply: { tr: "Evet, sil", en: "Yes, delete" },
  cancel: { tr: "Vazgeç", en: "Cancel" },
  close: { tr: "Kapat", en: "Close" },
  retry: { tr: "Tekrar dene", en: "Retry" },
  loadError: { tr: "Durum yüklenemedi", en: "Couldn't load status" },
  running: { tr: "Çalışıyor…", en: "Running…" },
  resultSettlementDry: { tr: "Önizleme tamamlandı", en: "Preview complete" },
  resultSettlementRun: { tr: "Taslak mutabakatlar oluşturuldu", en: "Draft settlements created" },
  resultRetentionDry: { tr: "Önizleme tamamlandı", en: "Preview complete" },
  resultRetentionApply: { tr: "Eski kayıtlar silindi", en: "Old records deleted" },
  scanned: { tr: "İncelenen anlaşma", en: "Agreements checked" },
  // Ham durum/sonuç kodları yerine okunur etiketler.
  stCompleted: { tr: "Tamamlandı", en: "Completed" },
  stFailed: { tr: "Hata", en: "Failed" },
  stRunning: { tr: "Çalışıyor", en: "Running" },
  stPartial: { tr: "Kısmen başarılı", en: "Partial success" },
  stSkippedLocked: { tr: "Atlandı (zaten çalışıyor)", en: "Skipped (already running)" },
  stDryRun: { tr: "Önizleme", en: "Preview" },
};

// report alanı kontrat tarafında `unknown`; güvenli sayısal okuma.
function reportNum(report: unknown, key: string): number | null {
  if (report && typeof report === "object" && key in report) {
    const value = (report as Record<string, unknown>)[key];
    return typeof value === "number" ? value : null;
  }
  return null;
}

function reportStr(report: unknown, key: string): string | null {
  if (report && typeof report === "object" && key in report) {
    const value = (report as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
  }
  return null;
}

// Ham durum/sonuç kodunu (report.outcome önce; yoksa status) okunur etiket + tona çevirir.
function describeRun(
  job: NonNullable<JobRun>,
  l: (key: keyof typeof L) => string,
): { label: string; tone: "success" | "warning" | "info" | "neutral" } {
  const code = (reportStr(job.report, "outcome") ?? job.status ?? "").toUpperCase();
  switch (code) {
    case "COMPLETED":
      return { label: l("stCompleted"), tone: "success" };
    case "FAILED":
      return { label: l("stFailed"), tone: "warning" };
    case "PARTIAL_SUCCESS":
      return { label: l("stPartial"), tone: "warning" };
    case "SKIPPED_LOCKED":
      return { label: l("stSkippedLocked"), tone: "info" };
    case "DRY_RUN":
      return { label: l("stDryRun"), tone: "info" };
    case "PROCESSING":
    case "STARTED":
    case "RUNNING":
      return { label: l("stRunning"), tone: "info" };
    default:
      return { label: "—", tone: "neutral" };
  }
}

export default function OperationsPage() {
  const locale = useLocale();
  const l = (key: keyof typeof L) => (locale === "tr" ? L[key].tr : L[key].en);

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [storeName, setStoreName] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await storeApi.getCommercialAutomationStatus();
      setState({ status: "ready", data: response.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  // Modal kapsamı için mağaza adı; kritik değil, sessizce başarısız olabilir.
  useEffect(() => {
    let active = true;
    storeApi
      .storeContext()
      .then((ctx) => {
        if (active) setStoreName(ctx.store.name);
      })
      .catch(() => {
        /* kapsam etiketi mağaza adı olmadan da çalışır */
      });
    return () => {
      active = false;
    };
  }, []);

  async function runSettlement(dryRun: boolean) {
    setPending(dryRun ? "settlement-dry" : "settlement-run");
    setActionError(null);
    setResult(null);
    try {
      const response = await storeApi.runSettlementScheduler({ dryRun });
      setResult({ kind: "settlement", dryRun, data: response.data });
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setPending(null);
    }
  }

  async function runRetention(dryRun: boolean) {
    setPending(dryRun ? "retention-dry" : "retention-apply");
    setActionError(null);
    setResult(null);
    try {
      const response = await storeApi.runRetention({ dryRun });
      setResult({ kind: "retention", dryRun, data: response.data });
      await load();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setPending(null);
    }
  }

  function confirmRetentionApply() {
    setConfirmOpen(false);
    void runRetention(false);
  }

  const busy = pending !== null;

  return (
    <>
      <PageHeader eyebrow={l("eyebrow")} title={l("title")} description={l("description")} />

      {/* Aksiyon sonucu / hata */}
      {actionError ? (
        <Alert tone="error" title={l("loadError")} className="mb-4">
          {actionError}
        </Alert>
      ) : null}
      {result ? <ResultAlert result={result} l={l} className="mb-4" /> : null}

      <div className="space-y-6">
        {/* ── Görünürlük ── */}
        <SectionCard title={l("statusCardTitle")} description={l("statusCardDesc")} icon={<DashboardIcon />}>
          {state.status === "loading" ? <SkeletonRows rows={3} /> : null}

          {state.status === "error" ? (
            <Alert
              tone="error"
              title={l("loadError")}
              action={
                <Button variant="secondary" size="sm" onClick={() => void load()}>
                  {l("retry")}
                </Button>
              }
            >
              {state.message}
            </Alert>
          ) : null}

          {state.status === "ready" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <JobStatCard
                label={l("settlementScheduler")}
                job={state.data.settlementScheduler}
                l={l}
                lines={(job) => [
                  `${l("createdDrafts")}: ${reportNum(job.report, "createdDrafts") ?? 0}`,
                  `${l("candidateDrafts")}: ${reportNum(job.report, "candidateDrafts") ?? 0}`,
                  `${l("erroredAgreements")}: ${reportNum(job.report, "erroredAgreements") ?? 0}`,
                ]}
                locale={locale}
              />
              <JobStatCard
                label={l("attributionRetention")}
                job={state.data.attributionRetention}
                l={l}
                lines={(job) => [
                  `${l("totalCandidates")}: ${reportNum(job.report, "totalCandidates") ?? 0}`,
                  `${l("totalDeleted")}: ${reportNum(job.report, "totalDeleted") ?? 0}`,
                ]}
                locale={locale}
              />
              <StatCard
                label={l("retentionConfig")}
                value={`${state.data.retentionConfig.sponsoredEventRetentionDays} / ${state.data.retentionConfig.influencerClickRetentionDays} ${l("daysShort")}`}
                hint={`${l("sponsoredDays")} · ${l("influencerDays")} · ${l("maxDeletePerRun")}: ${state.data.retentionConfig.maxDeletePerRun.toLocaleString(locale)}`}
                icon={<PaymentIcon />}
              />
            </div>
          ) : null}
        </SectionCard>

        {/* ── Manuel işlemler ── */}
        <SectionCard title={l("actionsCardTitle")} description={l("actionsCardDesc")} icon={<PaymentIcon />}>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">
                {l("settlementScheduler")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void runSettlement(true)} disabled={busy}>
                  {pending === "settlement-dry" ? l("running") : l("settlementDryRun")}
                </Button>
                <Button onClick={() => void runSettlement(false)} disabled={busy}>
                  {pending === "settlement-run" ? l("running") : l("settlementRun")}
                </Button>
              </div>
              <p className="mt-2 text-xs text-white/30">{l("settlementHint")}</p>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">
                {l("attributionRetention")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void runRetention(true)} disabled={busy}>
                  {pending === "retention-dry" ? l("running") : l("retentionDryRun")}
                </Button>
                <Button variant="danger" onClick={() => setConfirmOpen(true)} disabled={busy}>
                  {pending === "retention-apply" ? l("running") : l("retentionApply")}
                </Button>
              </div>
              <p className="mt-2 text-xs text-white/30">{l("retentionHint")}</p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Retention APPLY onay diyaloğu (yıkıcı) ── */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={l("confirmTitle")}
        description={l("confirmDesc")}
        closeLabel={l("close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {l("cancel")}
            </Button>
            <Button variant="danger" onClick={confirmRetentionApply}>
              {l("confirmApply")}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35">{l("scope")}</p>
            <p className="mt-1 text-white/80">{storeName ?? l("thisStore")}</p>
          </div>
          {state.status === "ready" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35">
                  {l("sponsoredDays")}
                </p>
                <p className="mt-1 text-white/80">{state.data.retentionConfig.sponsoredEventRetentionDays}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35">
                  {l("influencerDays")}
                </p>
                <p className="mt-1 text-white/80">{state.data.retentionConfig.influencerClickRetentionDays}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35">
                  {l("maxDeletePerRun")}
                </p>
                <p className="mt-1 text-white/80">{state.data.retentionConfig.maxDeletePerRun}</p>
              </div>
            </div>
          ) : null}
          <Alert tone="warning">{l("confirmWarning")}</Alert>
        </div>
      </Modal>
    </>
  );
}

/** Bir arka plan işinin son çalışma StatCard'ı (status rozeti + tarih + rapor satırları). */
function JobStatCard({
  label,
  job,
  l,
  lines,
  locale,
}: {
  label: string;
  job: JobRun;
  l: (key: keyof typeof L) => string;
  lines: (job: NonNullable<JobRun>) => string[];
  locale: "tr" | "en";
}) {
  if (!job) {
    return <StatCard label={label} value="—" hint={l("neverRun")} icon={<DashboardIcon />} />;
  }
  const run = describeRun(job, l);
  const detail = [`${l("lastAt")}: ${formatDateTime(job.at, locale)}`, ...lines(job)].join(" · ");
  return (
    <StatCard
      label={label}
      value={<span className="text-[20px]">{run.label}</span>}
      hint={detail}
      badge={run.label}
      badgeTone={run.tone}
      icon={<DashboardIcon />}
    />
  );
}

/** Aksiyon sonrası özet Alert'i (settlement / retention). */
function ResultAlert({
  result,
  l,
  className,
}: {
  result: ActionResult;
  l: (key: keyof typeof L) => string;
  className?: string;
}) {
  if (result.kind === "settlement") {
    const title = result.dryRun ? l("resultSettlementDry") : l("resultSettlementRun");
    return (
      <Alert tone={result.data.erroredAgreements > 0 ? "warning" : "success"} title={title} className={className}>
        {`${l("scanned")}: ${result.data.scannedAgreements} · ${l("createdDrafts")}: ${result.data.createdDrafts} · ${l("candidateDrafts")}: ${result.data.candidateDrafts} · ${l("erroredAgreements")}: ${result.data.erroredAgreements}`}
      </Alert>
    );
  }
  const title = result.dryRun ? l("resultRetentionDry") : l("resultRetentionApply");
  return (
    <Alert tone={result.dryRun ? "info" : "success"} title={title} className={className}>
      {`${l("totalCandidates")}: ${result.data.totalCandidates} · ${l("totalDeleted")}: ${result.data.totalDeleted}`}
    </Alert>
  );
}
