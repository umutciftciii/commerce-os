"use client";

/**
 * TODO-174B (ADR-283) / TODO-174B.2 — Recovery case detay + operasyon. Append-only activity timeline;
 * internal note yalnız burada (admin, storefront'a sızmaz). "Alışveriş bakiyesi tanımla" = idempotent
 * goodwill (recoveryCaseId'e bağlı). Ham enum UI'a çıkmaz — tüm etiketler recovery-labels modülünden.
 */
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { formatDate, formatMinor } from "../../../../lib/client/format";
import { creditReasonOptions, tlToMinor } from "../../../../lib/client/credit-format";
import {
  activityTypeLabel,
  cancelReasonLabel,
  orderStatusLabel,
  outcomeLabel,
  paymentStatusLabel,
  priorityLabel,
  recoveryStatusLabel,
  recoveryStatusTone,
  resolutionLabel,
  slaState,
} from "../../../../lib/client/recovery-labels";
import type { AssignableUser, RecoveryCaseDetailDto } from "@commerce-os/api-client";

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
  return `k-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export default function RecoveryCaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = use(params);
  const locale = useLocale();
  const tr = locale === "tr";
  const router = useRouter();
  const [detail, setDetail] = useState<RecoveryCaseDetailDto | null>(null);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcomeModal, setOutcomeModal] = useState<null | "ISSUE_HEARD" | "RESOLVE">(null);
  const [outcome, setOutcome] = useState("");
  const [resolutionType, setResolutionType] = useState("");
  const [note, setNote] = useState("");
  const [assignModal, setAssignModal] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");
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

  // "Kullanıcıya ata" dropdown'u — fail-open (yüklenemezse yalnız "Kendime ata" kalır).
  useEffect(() => {
    let cancelled = false;
    void storeApi
      .listAssignableUsers()
      .then((res) => !cancelled && setAssignees(res))
      .catch(() => !cancelled && setAssignees([]));
    return () => {
      cancelled = true;
    };
  }, []);

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
        setAssignModal(false);
        setAssignUserId("");
        setNoteModal(false);
        setNoteText("");
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
        <PageHeader title="Recovery" />
        {err ? <Alert tone="error">{err}</Alert> : <SkeletonRows rows={6} />}
      </div>
    );
  }

  const closed = detail.status === "CLOSED";
  const sla = slaState(detail, Date.now(), tr);
  const goodwillMinor = Number(detail.goodwillCreditMinor);
  const assigneeDisplay = detail.assigneeName ?? detail.assigneeEmail ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Recovery · ${detail.order.orderNumber}`}
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
          {/* Özet */}
          <SurfaceCard>
            <div className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={recoveryStatusTone(detail.status)}>{recoveryStatusLabel(detail.status, tr)}</Badge>
                <Badge tone={sla.tone}>{sla.label}</Badge>
                <span className="text-lg font-semibold text-amber-300">{"★".repeat(detail.review.rating)}</span>
                <span className="text-xs opacity-60">
                  {tr ? "Öncelik" : "Priority"}: {priorityLabel(detail.priority, tr)}
                </span>
              </div>
              <div className="text-sm opacity-80">
                {tr ? "Atanan" : "Assignee"}: {assigneeDisplay ?? (tr ? "— (atanmadı)" : "— (unassigned)")}
              </div>
              <div className="text-sm opacity-70">
                {tr ? "Yorum" : "Comment"}: {detail.review.comment ?? "—"}
              </div>
              <div className="text-xs opacity-50">
                {tr ? "Değerlendirme tarihi" : "Reviewed"}: {formatDate(detail.review.createdAt)}
              </div>
            </div>
          </SurfaceCard>

          {/* Operasyon aksiyonları */}
          {!closed && (
            <SurfaceCard>
              <div className="flex flex-wrap gap-2 p-4">
                <Button variant="secondary" disabled={busy} onClick={() => runAction("ASSIGN", { assigneePlatformUserId: "me" })}>
                  {tr ? "Kendime ata" : "Assign to me"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => { setAssignUserId(""); setAssignModal(true); }}>
                  {tr ? "Kullanıcıya ata" : "Assign to user"}
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
                <Button variant="secondary" disabled={busy} onClick={() => { setNoteText(""); setNoteModal(true); }}>
                  {tr ? "Not ekle" : "Add note"}
                </Button>
                <Button variant="primary" disabled={busy} onClick={() => setCreditModal(true)}>
                  {tr ? "Alışveriş bakiyesi tanımla" : "Grant credit"}
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

          {/* Activity timeline */}
          <SurfaceCard>
            <div className="p-4">
              <h3 className="mb-3 font-semibold">{tr ? "Geçmiş" : "Activity"}</h3>
              <ol className="space-y-2">
                {detail.activities.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 border-l-2 border-white/10 pl-3 text-sm">
                    <div>
                      <span className="font-medium">{activityTypeLabel(a.type, tr)}</span>
                      {a.outcome ? <span className="opacity-70"> · {outcomeLabel(a.outcome, tr)}</span> : null}
                      {a.note ? <div className="opacity-60">{a.note}</div> : null}
                    </div>
                    <span className="whitespace-nowrap text-xs opacity-50">{formatDate(a.createdAt)}</span>
                  </li>
                ))}
                {detail.activities.length === 0 && <li className="text-sm opacity-60">{tr ? "Henüz kayıt yok." : "No activity."}</li>}
              </ol>
            </div>
          </SurfaceCard>
        </div>

        <aside className="space-y-4">
          {/* Müşteri */}
          <SurfaceCard>
            <div className="space-y-1 p-4 text-sm">
              <div className="font-semibold">{tr ? "Müşteri" : "Customer"}</div>
              <div className="opacity-80">{detail.customer.name}</div>
              <div className="opacity-60">{detail.customer.email}</div>
              {detail.customer.phone && <div className="opacity-60">{detail.customer.phone}</div>}
              <Link href={`/customers/${detail.customer.id}`} className="inline-block pt-1 text-xs text-sky-300 hover:underline">
                {tr ? "Müşteri detayı →" : "Customer detail →"}
              </Link>
            </div>
          </SurfaceCard>

          {/* Sipariş + ödeme/iade özeti */}
          <SurfaceCard>
            <div className="space-y-1 p-4 text-sm">
              <div className="font-semibold">{tr ? "Sipariş" : "Order"}</div>
              <div className="opacity-80">{detail.order.orderNumber}</div>
              <div className="opacity-60">
                <Badge tone="neutral">{orderStatusLabel(detail.order.status, tr)}</Badge>{" "}
                <Badge tone="info">{paymentStatusLabel(detail.order.paymentStatus, tr)}</Badge>
              </div>
              <div className="opacity-70">
                {tr ? "Tutar" : "Total"}: {formatMinor(detail.order.totalMinor, detail.order.currency)}
              </div>
              {Number(detail.order.shoppingCreditUsedMinor) > 0 && (
                <div className="opacity-60">
                  {tr ? "Kullanılan bakiye" : "Credit used"}:{" "}
                  {formatMinor(Number(detail.order.shoppingCreditUsedMinor), detail.order.currency)}
                </div>
              )}
              {detail.order.cancelReasonCode && (
                <div className="opacity-60">
                  {tr ? "İptal nedeni" : "Cancel reason"}: {cancelReasonLabel(detail.order.cancelReasonCode, tr)}
                </div>
              )}
              <Link href={`/orders/${detail.order.id}`} className="inline-block pt-1 text-xs text-sky-300 hover:underline">
                {tr ? "Sipariş detayı →" : "Order detail →"}
              </Link>
            </div>
          </SurfaceCard>

          {/* Recovery zaman çizelgesi + goodwill */}
          <SurfaceCard>
            <div className="space-y-1 p-4 text-sm">
              <div className="font-semibold">{tr ? "Zaman çizelgesi" : "Timeline"}</div>
              <TimeRow label={tr ? "Açıldı" : "Opened"} value={formatDate(detail.openedAt)} />
              <TimeRow label={tr ? "İlk temas" : "First contact"} value={detail.firstContactAt ? formatDate(detail.firstContactAt) : "—"} />
              <TimeRow label={tr ? "Son tarih (SLA)" : "Due (SLA)"} value={formatDate(detail.dueAt)} />
              <TimeRow label={tr ? "Çözüldü" : "Resolved"} value={detail.resolvedAt ? formatDate(detail.resolvedAt) : "—"} />
              <TimeRow label={tr ? "Kapatıldı" : "Closed"} value={detail.closedAt ? formatDate(detail.closedAt) : "—"} />
              {goodwillMinor > 0 && (
                <div className="pt-2">
                  <div className="font-semibold text-emerald-300">{tr ? "Tanımlanan bakiye" : "Goodwill credit"}</div>
                  <div className="text-emerald-300">{formatMinor(goodwillMinor, detail.order.currency)}</div>
                </div>
              )}
              {detail.resolutionType && (
                <div className="pt-2">
                  <div className="font-semibold">{tr ? "Çözüm" : "Resolution"}</div>
                  <div className="opacity-70">{resolutionLabel(detail.resolutionType, tr)}</div>
                  {detail.resolutionNote && <div className="opacity-60">{detail.resolutionNote}</div>}
                </div>
              )}
            </div>
          </SurfaceCard>
        </aside>
      </div>

      {/* Sorun dinlendi / Çözüldü — structured outcome/resolution + not */}
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
                options={[{ value: "", label: tr ? "Seçin" : "Select" }, ...OUTCOMES.map((o) => ({ value: o, label: outcomeLabel(o, tr) }))]}
              />
            )}
            {outcomeModal === "RESOLVE" && (
              <Select
                label={tr ? "Çözüm türü" : "Resolution"}
                value={resolutionType}
                onChange={(e) => setResolutionType(e.target.value)}
                options={[{ value: "", label: tr ? "Seçin" : "Select" }, ...RESOLUTIONS.map((r) => ({ value: r, label: resolutionLabel(r, tr) }))]}
              />
            )}
            <Textarea
              label={outcome === "OTHER" ? (tr ? "Not (zorunlu)" : "Note (required)") : tr ? "Not" : "Note"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tr ? "Dahili not (müşteriye görünmez)" : "Internal note"}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOutcomeModal(null)}>{tr ? "Vazgeç" : "Cancel"}</Button>
              <Button
                variant="primary"
                disabled={
                  busy ||
                  (outcomeModal === "RESOLVE" && !resolutionType) ||
                  (outcomeModal === "ISSUE_HEARD" && outcome === "OTHER" && !note.trim())
                }
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

      {/* Kullanıcıya ata */}
      {assignModal && (
        <Modal open onClose={() => setAssignModal(false)} closeLabel={tr ? "Kapat" : "Close"} title={tr ? "Kullanıcıya ata" : "Assign to user"}>
          <div className="space-y-3">
            {assignees.length === 0 ? (
              <Alert tone="info">{tr ? "Bu mağazada atanabilir kullanıcı bulunamadı." : "No assignable users for this store."}</Alert>
            ) : (
              <Select
                label={tr ? "Kullanıcı" : "User"}
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                options={[{ value: "", label: tr ? "Seçin" : "Select" }, ...assignees.map((u) => ({ value: u.id, label: `${u.name} · ${u.role}` }))]}
              />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAssignModal(false)}>{tr ? "Vazgeç" : "Cancel"}</Button>
              <Button variant="primary" disabled={busy || !assignUserId} onClick={() => runAction("ASSIGN", { assigneePlatformUserId: assignUserId })}>
                {tr ? "Ata" : "Assign"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bağımsız dahili not */}
      {noteModal && (
        <Modal open onClose={() => setNoteModal(false)} closeLabel={tr ? "Kapat" : "Close"} title={tr ? "Dahili not ekle" : "Add internal note"}>
          <div className="space-y-3">
            <Textarea
              label={tr ? "Not (müşteriye görünmez)" : "Note (internal)"}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setNoteModal(false)}>{tr ? "Vazgeç" : "Cancel"}</Button>
              <Button variant="primary" disabled={busy || !noteText.trim()} onClick={() => runAction("NOTE", { note: noteText.trim() })}>
                {tr ? "Kaydet" : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Alışveriş bakiyesi */}
      {creditModal && (
        <Modal open onClose={() => setCreditModal(false)} closeLabel={tr ? "Kapat" : "Close"} title={tr ? "Alışveriş bakiyesi tanımla" : "Grant shopping credit"}>
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

function TimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="opacity-50">{label}</span>
      <span className="opacity-80">{value}</span>
    </div>
  );
}
