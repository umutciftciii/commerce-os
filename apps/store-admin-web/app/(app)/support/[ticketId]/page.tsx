"use client";

/**
 * TODO-177 (ADR-289) Faz E — Store Admin destek talebi detay + operasyon. Server-authoritative:
 * her aksiyon `expectedVersion` optimistic guard gönderir; VERSION_CONFLICT'te taze sürüm yeniden
 * yüklenir (optimistic sahte state YOK). Store admin REOPEN YAPMAZ (müşteri davranışı). SLA yalnız
 * live cycle. Ham enum/id UI'a çıkmaz (ticket-labels). Ekler auth-gate'li BFF proxy ile görüntülenir.
 */
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  Textarea,
  useLocale,
} from "../../../../components/ui";
import { SurfaceCard } from "../../../components/premium";
import { UiError, storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate } from "../../../../lib/client/format";
import {
  slaStateBadge,
  supportActorLabel,
  supportAnswerValue,
  supportStatusLabel,
  supportStatusTone,
  supportTopicLabel,
} from "../../../../lib/client/ticket-labels";
import type { AdminSupportTicketDetail, AssignableUser } from "@commerce-os/api-client";

export default function SupportTicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = use(params);
  const locale = useLocale();
  const tr = locale === "tr";
  const [detail, setDetail] = useState<AdminSupportTicketDetail | null>(null);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [assignModal, setAssignModal] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");

  const load = useCallback(async () => {
    try {
      const { ticket } = await storeApi.getSupportTicket(ticketId);
      setDetail(ticket);
    } catch (error) {
      setErr(messageForError(error, locale));
    }
  }, [ticketId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void storeApi
      .listSupportAssignableUsers()
      .then((res) => !cancelled && setAssignees(res))
      .catch(() => !cancelled && setAssignees([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const runAction = useCallback(
    async (input: { action: "ASSIGN"; assigneePlatformUserId: string } | { action: "SET_STATUS"; toStatus: "RESOLVED" | "CLOSED" }) => {
      if (!detail || busy) return;
      setBusy(true);
      setErr(null);
      try {
        const { ticket } = await storeApi.supportAction(ticketId, { ...input, expectedVersion: detail.version });
        setDetail(ticket);
        setAssignModal(false);
        setAssignUserId("");
      } catch (error) {
        // VERSION_CONFLICT: başka biri değiştirmiş → taze sürümü yükle, dostça mesaj göster.
        if (error instanceof UiError && error.code === "VERSION_CONFLICT") {
          await load();
        }
        setErr(messageForError(error, locale));
      } finally {
        setBusy(false);
      }
    },
    [detail, busy, ticketId, locale, load],
  );

  const submitReply = useCallback(async () => {
    if (!detail || busy || reply.trim().length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const { ticket } = await storeApi.supportReply(ticketId, { body: reply.trim() });
      setDetail(ticket);
      setReply("");
    } catch (error) {
      setErr(messageForError(error, locale));
    } finally {
      setBusy(false);
    }
  }, [detail, busy, reply, ticketId, locale]);

  if (!detail) {
    return (
      <>
        <PageHeader eyebrow={tr ? "Destek" : "Support"} title={tr ? "Destek talebi" : "Support request"} />
        {err ? <Alert tone="error">{err}</Alert> : <SkeletonRows rows={6} />}
      </>
    );
  }

  const closed = detail.status === "CLOSED";
  const resolved = detail.status === "RESOLVED";
  const fr = slaStateBadge(detail.sla.firstResponseState, tr);
  const res = slaStateBadge(detail.sla.resolutionState, tr);
  const attachmentHref = (attachmentId: string) =>
    `/api/support/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachmentId)}`;

  return (
    <>
      <PageHeader
        eyebrow={tr ? "Destek" : "Support"}
        title={`${tr ? "Talep" : "Request"} ${detail.ticketNumber}`}
        actions={
          <Link
            href="/support"
            className="inline-flex h-9 items-center rounded-lg border border-white/10 px-4 text-sm text-white/80 hover:bg-white/[0.06]"
          >
            {tr ? "Tüm talepler" : "All requests"}
          </Link>
        }
      />

      {err ? <Alert tone="error">{err}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SurfaceCard title={tr ? "Özet" : "Overview"}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={supportStatusTone(detail.status)}>{supportStatusLabel(detail.status, tr)}</Badge>
              <Badge tone={fr.tone}>{tr ? "İlk yanıt" : "First response"}: {fr.label}</Badge>
              <Badge tone={res.tone}>{tr ? "Çözüm" : "Resolution"}: {res.label}</Badge>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row label={tr ? "Müşteri" : "Customer"} value={detail.customerName ?? detail.customerEmail} />
              <Row label={tr ? "E-posta" : "Email"} value={detail.customerEmail} />
              <Row label={tr ? "Ürün" : "Product"} value={`${detail.productTitle}${detail.variantTitle ? ` · ${detail.variantTitle}` : ""}`} />
              <Row label={tr ? "Sipariş" : "Order"} value={detail.orderNumber} />
              <Row label={tr ? "Konu" : "Topic"} value={supportTopicLabel(detail.topic, tr)} />
              <Row label={tr ? "Oluşturuldu" : "Created"} value={formatDate(detail.createdAt)} />
              {detail.resolvedAt ? <Row label={tr ? "Çözüldü" : "Resolved"} value={formatDate(detail.resolvedAt)} /> : null}
            </dl>
            {detail.warranty.warrantyEndsAt ? (
              <p className="mt-3 text-sm text-white/60">
                {tr ? "Garanti" : "Warranty"}:{" "}
                {detail.warranty.inWarranty === false
                  ? `${tr ? "doldu" : "expired"} (${formatDate(detail.warranty.warrantyEndsAt)})`
                  : `${tr ? "geçerli" : "valid"} — ${formatDate(detail.warranty.warrantyEndsAt)}`}
              </p>
            ) : null}
          </SurfaceCard>

          {detail.answers.length > 0 ? (
            <SurfaceCard title={tr ? "Guided yanıtlar" : "Guided answers"}>
              <ul className="space-y-1 text-sm text-white/70">
                {detail.answers.map((a) => {
                  const v = supportAnswerValue(a, tr);
                  return (
                    <li key={a.questionKey}>
                      <span className="text-white/90">{a.questionPrompt}</span>
                      {v ? <span>: {v}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </SurfaceCard>
          ) : null}

          {detail.suggestedResolutionText ? (
            <SurfaceCard title={tr ? "Önerilen çözüm" : "Suggested solution"}>
              <p className="whitespace-pre-line text-sm text-white/70">{detail.suggestedResolutionText}</p>
            </SurfaceCard>
          ) : null}

          <SurfaceCard title={tr ? "Yazışma" : "Conversation"}>
            {detail.messages.length === 0 ? (
              <p className="text-sm text-white/30">—</p>
            ) : (
              <ol className="space-y-3">
                {detail.messages.map((m) => (
                  <li key={m.id} className="border-l-2 border-white/10 pl-3">
                    <p className="text-xs text-white/40">
                      <span className="font-medium text-white/80">{supportActorLabel(m.actorType, tr)}</span>
                      {" · "}
                      {formatDate(m.createdAt)}
                    </p>
                    <p className="whitespace-pre-line text-sm text-white/70">{m.body}</p>
                    {m.attachments.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {m.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={attachmentHref(att.id)}
                            data-testid="ticket-attachment-link"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/[0.06]"
                          >
                            {att.type === "PDF" ? "PDF" : "📷"} {tr ? "Eki aç" : "Open attachment"}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}

            {detail.attachments.length > 0 ? (
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-white/60">{tr ? "Talep ekleri" : "Request attachments"}</p>
                <div className="flex flex-wrap gap-2">
                  {detail.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={attachmentHref(att.id)}
                            data-testid="ticket-attachment-link"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/[0.06]"
                    >
                      {att.type === "PDF" ? "PDF" : "📷"} {tr ? "Eki aç" : "Open attachment"}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {closed ? (
              <Alert tone="info" className="mt-4">
                {tr ? "Bu talep kapatıldı; yanıt eklenemez." : "This request is closed; no replies can be added."}
              </Alert>
            ) : (
              <div className="mt-4 space-y-2">
                <Textarea
                  id="support-reply"
                  label={tr ? "Yanıtınız" : "Your reply"}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  disabled={busy}
                />
                <Button onClick={() => void submitReply()} disabled={busy || reply.trim().length === 0} data-testid="ticket-reply-submit">
                  {busy ? (tr ? "Gönderiliyor…" : "Sending…") : tr ? "Yanıtla" : "Reply"}
                </Button>
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard title={tr ? "Zaman çizelgesi" : "Timeline"}>
            <ol className="space-y-2">
              {detail.timeline.map((ev) => (
                <li key={ev.id} className="border-l-2 border-white/10 pl-3 text-sm">
                  <span className="text-white/80">{supportStatusLabel(ev.toStatus, tr)}</span>
                  {ev.note ? <span className="text-white/50"> · {ev.note}</span> : null}
                  <span className="ml-2 text-xs text-white/30">{formatDate(ev.createdAt)}</span>
                </li>
              ))}
            </ol>
          </SurfaceCard>
        </div>

        <aside className="space-y-6">
          <SurfaceCard title={tr ? "Atama" : "Assignment"}>
            <p className="text-sm text-white/70">
              {detail.assigneeName ?? <span className="text-white/30">{tr ? "Atanmadı" : "Unassigned"}</span>}
            </p>
            {!closed ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void runAction({ action: "ASSIGN", assigneePlatformUserId: "me" })} disabled={busy} data-testid="ticket-assign-me">
                  {tr ? "Kendime ata" : "Assign to me"}
                </Button>
                <Button variant="secondary" onClick={() => setAssignModal(true)} disabled={busy || assignees.length === 0} data-testid="ticket-assign-user">
                  {tr ? "Kullanıcıya ata" : "Assign user"}
                </Button>
              </div>
            ) : null}
          </SurfaceCard>

          <SurfaceCard title={tr ? "Durum" : "Status"}>
            <div className="flex flex-wrap gap-2">
              {!closed && !resolved ? (
                <Button onClick={() => void runAction({ action: "SET_STATUS", toStatus: "RESOLVED" })} disabled={busy} data-testid="ticket-status-resolve">
                  {tr ? "Çözüldü olarak işaretle" : "Mark resolved"}
                </Button>
              ) : null}
              {!closed ? (
                <Button variant="secondary" onClick={() => void runAction({ action: "SET_STATUS", toStatus: "CLOSED" })} disabled={busy} data-testid="ticket-status-close">
                  {tr ? "Kapat" : "Close"}
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-white/30">
              {tr
                ? "Yeniden açma yalnız müşteri tarafından yapılır."
                : "Reopening is available to the customer only."}
            </p>
          </SurfaceCard>

          <SurfaceCard title="SLA">
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-white/50">{tr ? "İlk yanıt" : "First response"}</dt>
                <dd><Badge tone={fr.tone}>{fr.label}</Badge></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-white/50">{tr ? "Çözüm" : "Resolution"}</dt>
                <dd><Badge tone={res.tone}>{res.label}</Badge></dd>
              </div>
              <Row label={tr ? "İlk yanıt hedefi" : "First response due"} value={formatDate(detail.sla.firstResponseDueAt)} />
              <Row label={tr ? "Çözüm hedefi" : "Resolution due"} value={formatDate(detail.sla.resolutionDueAt)} />
            </dl>
          </SurfaceCard>
        </aside>
      </div>

      {assignModal ? (
        <Modal
          open
          onClose={() => setAssignModal(false)}
          title={tr ? "Kullanıcıya ata" : "Assign user"}
          closeLabel={tr ? "Kapat" : "Close"}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAssignModal(false)} disabled={busy}>
                {tr ? "Vazgeç" : "Cancel"}
              </Button>
              <Button
                onClick={() => void runAction({ action: "ASSIGN", assigneePlatformUserId: assignUserId })}
                disabled={busy || assignUserId.length === 0} data-testid="ticket-assign-submit"
              >
                {tr ? "Ata" : "Assign"}
              </Button>
            </>
          }
        >
          <Select
            id="assign-user"
            label={tr ? "Kullanıcı" : "User"}
            value={assignUserId}
            onChange={(e) => setAssignUserId(e.target.value)}
            options={[
              { value: "", label: tr ? "Seçin…" : "Select…" },
              ...assignees.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
            ]}
          />
        </Modal>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-white/50">{label}</dt>
      <dd className="text-white/80">{value}</dd>
    </div>
  );
}
