"use client";

/**
 * TODO-174B (ADR-283) — Recovery case detay + lifecycle. Append-only activity timeline; internal note
 * yalnız burada (admin). "Müşteriye alışveriş bakiyesi tanımla" = idempotent goodwill (recoveryCaseId'e bağlı).
 */
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  Textarea,
  useLocale,
} from "../../../../components/ui";
import { SurfaceCard } from "../../../components/premium";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate } from "../../../../lib/client/format";
import { creditReasonOptions, tlToMinor } from "../../../../lib/client/credit-format";
import type { RecoveryCaseDetailDto } from "@commerce-os/api-client";

const OUTCOMES = [
  "ISSUE_RESOLVED",
  "APOLOGY_ACCEPTED",
  "REFUND_QUESTION",
  "DELIVERY_COMPLAINT",
  "PRICE_COMPLAINT",
  "PRODUCT_EXPECTATION_MISMATCH",
  "CUSTOMER_UNREACHABLE",
  "CUSTOMER_DECLINED",
  "OTHER",
];
const RESOLUTIONS = ["GOODWILL_CREDIT", "APOLOGY", "REFUND_FOLLOWUP", "NO_ACTION", "OTHER"];
const EXPIRY_DAYS = [30, 60, 120, 180];

function randomKey(): string {
  // Modal-open başına idempotency anahtarı (çift-submit koruması). Math.random yerine zaman+alan yok →
  // basit benzersizlik: reviewId + performance yok; crypto varsa kullan.
  return `k-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export default function RecoveryCaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = use(params);
  const locale = useLocale();
  const tr = locale === "tr";
  const router = useRouter();
  const [detail, setDetail] = useState<RecoveryCaseDetailDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcomeModal, setOutcomeModal] = useState<null | "ISSUE_HEARD" | "RESOLVE">(null);
  const [outcome, setOutcome] = useState("");
  const [resolutionType, setResolutionType] = useState("");
  const [note, setNote] = useState("");
  const [creditModal, setCreditModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditExpiry, setCreditExpiry] = useState(60);
  const [creditReason, setCreditReason] = useState(() => creditReasonOptions(locale === "tr")[0]!.value);
  const [creditKey, setCreditKey] = useState(randomKey());

  const load = useCallback(async () => {
    try {
      setDetail(await storeApi.getRecoveryCase(caseId));
    } catch (error) {
      setErr(messageForError(error, locale));
    }
  }, [caseId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      if (!detail) return;
      setBusy(true);
      setErr(null);
      try {
        const updated = await storeApi.recoveryAction(caseId, {
          action: action as never,
          expectedVersion: detail.version,
          ...extra,
        });
        setDetail(updated);
        setOutcomeModal(null);
        setOutcome("");
        setResolutionType("");
        setNote("");
      } catch (error) {
        setErr(messageForError(error, locale));
      } finally {
        setBusy(false);
      }
    },
    [caseId, detail, locale],
  );

  const submitCredit = useCallback(async () => {
    const amountMinor = tlToMinor(creditAmount);
    if (!amountMinor) {
      setErr(tr ? "Geçerli bir tutar girin (₺)." : "Enter a valid amount (₺).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await storeApi.issueCustomerCredit(detail!.customer.id, {
        amountMinor,
        expiryDays: creditExpiry as never,
        reason: creditReason,
        recoveryCaseId: caseId,
        idempotencyKey: creditKey,
      });
      setCreditModal(false);
      setCreditAmount("");
      setCreditKey(randomKey());
      await load();
    } catch (error) {
      setErr(messageForError(error, locale));
    } finally {
      setBusy(false);
    }
  }, [detail, creditAmount, creditExpiry, creditReason, creditKey, caseId, load, locale, tr]);

  if (!detail) {
    return (
      <div className="space-y-4">
        <PageHeader title={tr ? "Recovery" : "Recovery"} />
        {err ? <Alert tone="error">{err}</Alert> : <SkeletonRows rows={6} />}
      </div>
    );
  }

  const closed = detail.status === "CLOSED";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${tr ? "Recovery" : "Recovery"} · ${detail.order.orderNumber}`}
        description={tr ? "Sipariş deneyimi geri kazanım kaydı." : "Order experience recovery case."}
        actions={
          <Button variant="secondary" onClick={() => router.push("/order-experience")}>
            {tr ? "Listeye dön" : "Back"}
          </Button>
        }
      />

      {err && <Alert tone="error">{err}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SurfaceCard>
            <div className="space-y-2 p-4">
              <div className="flex items-center gap-3">
                <Badge tone={detail.overdue ? "danger" : "info"}>{detail.status}</Badge>
                <span className="text-lg font-semibold">{"★".repeat(detail.review.rating)}</span>
                <span className="opacity-70">{detail.priority}</span>
                {detail.overdue && <Badge tone="danger">{tr ? "SLA gecikti" : "Overdue"}</Badge>}
              </div>
              <div className="opacity-80">{detail.customer.name} · {detail.customer.email}</div>
              <div className="opacity-70 text-sm">
                {tr ? "Yorum" : "Comment"}: {detail.review.comment ?? "—"}
              </div>
              <div className="text-xs opacity-60">
                {tr ? "Son tarih" : "Due"}: {formatDate(detail.dueAt)}
                {detail.assigneePlatformUserId ? ` · ${tr ? "Atanan" : "Assignee"}: ${detail.assigneePlatformUserId}` : ""}
              </div>
            </div>
          </SurfaceCard>

          {!closed && (
            <SurfaceCard>
              <div className="flex flex-wrap gap-2 p-4">
                <Button variant="secondary" disabled={busy} onClick={() => runAction("ASSIGN", { assigneePlatformUserId: "me" })}>
                  {tr ? "Kendime ata" : "Assign to me"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => runAction("CONTACT_CALL")}>
                  {tr ? "Arandı" : "Called"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => runAction("CONTACT_EMAIL")}>
                  {tr ? "E-posta gönderildi" : "Emailed"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => runAction("UNREACHABLE", { outcome: "CUSTOMER_UNREACHABLE" })}>
                  {tr ? "Ulaşılamadı" : "Unreachable"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setOutcomeModal("ISSUE_HEARD")}>
                  {tr ? "Sorun dinlendi" : "Issue heard"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => runAction("ACTION_REQUIRED")}>
                  {tr ? "Aksiyon gerekli" : "Action required"}
                </Button>
                <Button variant="primary" disabled={busy} onClick={() => setCreditModal(true)}>
                  {tr ? "Bakiye tanımla" : "Grant credit"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setOutcomeModal("RESOLVE")}>
                  {tr ? "Çözüldü" : "Resolve"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => runAction("CLOSE")}>
                  {tr ? "Kapat" : "Close"}
                </Button>
              </div>
            </SurfaceCard>
          )}

          <SurfaceCard>
            <div className="p-4">
              <h3 className="mb-3 font-semibold">{tr ? "Geçmiş" : "Activity"}</h3>
              <ol className="space-y-2">
                {detail.activities.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 border-l-2 border-white/10 pl-3 text-sm">
                    <div>
                      <span className="font-medium">{a.type}</span>
                      {a.outcome ? <span className="opacity-70"> · {a.outcome}</span> : null}
                      {a.note ? <div className="opacity-60">{a.note}</div> : null}
                    </div>
                    <span className="whitespace-nowrap text-xs opacity-50">{formatDate(a.createdAt)}</span>
                  </li>
                ))}
                {detail.activities.length === 0 && <li className="opacity-60 text-sm">{tr ? "Henüz kayıt yok." : "No activity."}</li>}
              </ol>
            </div>
          </SurfaceCard>
        </div>

        <aside className="space-y-4">
          <SurfaceCard>
            <div className="space-y-1 p-4 text-sm">
              <div className="font-semibold">{tr ? "Sipariş" : "Order"}</div>
              <div className="opacity-70">{detail.order.orderNumber} · {detail.order.status}</div>
              {detail.order.cancelReasonCode && <div className="opacity-60">{detail.order.cancelReasonCode}</div>}
              {detail.resolutionType && (
                <div className="pt-2">
                  <div className="font-semibold">{tr ? "Çözüm" : "Resolution"}</div>
                  <div className="opacity-70">{detail.resolutionType}</div>
                  {detail.resolutionNote && <div className="opacity-60">{detail.resolutionNote}</div>}
                </div>
              )}
            </div>
          </SurfaceCard>
        </aside>
      </div>

      {outcomeModal && (
        <Modal
          open
          onClose={() => setOutcomeModal(null)}
          closeLabel={tr ? "Kapat" : "Close"}
          title={outcomeModal === "RESOLVE" ? (tr ? "Çözüldü olarak işaretle" : "Resolve case") : tr ? "Sorun dinlendi" : "Issue heard"}
        >
          <div className="space-y-3">
            {outcomeModal === "ISSUE_HEARD" && (
              <Select
                label={tr ? "Sonuç" : "Outcome"}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                options={[{ value: "", label: tr ? "Seçin" : "Select" }, ...OUTCOMES.map((o) => ({ value: o, label: o }))]}
              />
            )}
            {outcomeModal === "RESOLVE" && (
              <Select
                label={tr ? "Çözüm türü" : "Resolution"}
                value={resolutionType}
                onChange={(e) => setResolutionType(e.target.value)}
                options={[{ value: "", label: tr ? "Seçin" : "Select" }, ...RESOLUTIONS.map((r) => ({ value: r, label: r }))]}
              />
            )}
            <Textarea
              label={tr ? "Not" : "Note"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tr ? "Dahili not (müşteriye görünmez)" : "Internal note"}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOutcomeModal(null)}>{tr ? "Vazgeç" : "Cancel"}</Button>
              <Button
                variant="primary"
                disabled={busy || (outcomeModal === "RESOLVE" && !resolutionType)}
                onClick={() =>
                  runAction(outcomeModal, {
                    outcome: outcome || undefined,
                    resolutionType: resolutionType || undefined,
                    note: note || undefined,
                  })
                }
              >
                {tr ? "Kaydet" : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {creditModal && (
        <Modal
          open
          onClose={() => setCreditModal(false)}
          closeLabel={tr ? "Kapat" : "Close"}
          title={tr ? "Alışveriş bakiyesi tanımla" : "Grant shopping credit"}
        >
          <div className="space-y-3">
            <Input
              label={tr ? "Tutar (₺)" : "Amount (₺)"}
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder={tr ? "250,00" : "250.00"}
            />
            <Select
              label={tr ? "Son kullanım" : "Expiry"}
              value={String(creditExpiry)}
              onChange={(e) => setCreditExpiry(Number(e.target.value))}
              options={EXPIRY_DAYS.map((d) => ({ value: String(d), label: `${d} ${tr ? "gün" : "days"}` }))}
            />
            <Select
              label={tr ? "Neden" : "Reason"}
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
              options={creditReasonOptions(tr)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreditModal(false)}>{tr ? "Vazgeç" : "Cancel"}</Button>
              <Button variant="primary" disabled={busy || !creditAmount} onClick={submitCredit}>
                {tr ? "Bakiye ekle" : "Add credit"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
