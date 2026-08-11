"use client";

/**
 * TODO-178 (Faz D) — Platform talebi detayı + mağaza aksiyonları. Store DTO'suna INTERNAL mesaj/not/
 * metadata GİRMEZ (gateway serializer garantisi); UI platform DTO'sunu ASLA reuse etmez. Aksiyon
 * izinleri backend-authoritative (canWithdraw/canConfirmClose/canReopen) — UI yeniden hesaplamaz.
 * Priority/atama platform-owned (salt-okunur). Reply daima STORE_VISIBLE (visibility seçilemez).
 * Her mutasyon expectedVersion taşır; VERSION_CONFLICT → taze veri + insan-okunur uyarı.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Textarea, useLocale } from "../../../../components/ui";
import type { StorePlatformRequestDetail } from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate } from "../../../../lib/client/format";
import { SurfaceCard } from "../../../components/premium";
import { PlatformRequestIcon } from "../../../../components/icons";
import {
  type Locale,
  authorLabel,
  categoryLabel,
  closeReasonLabel,
  contextKindLabel,
  priorityLabel,
  priorityTone,
  slaStateLabel,
  slaStateTone,
  statusLabel,
  statusTone,
  storeImpactLabel,
  timelineEventLabel,
} from "../../../../lib/client/platform-request-labels";

const T = {
  back: { tr: "Taleplere dön", en: "Back to requests" },
  loading: { tr: "Yükleniyor…", en: "Loading…" },
  notFound: { tr: "Talep bulunamadı.", en: "Request not found." },
  category: { tr: "Kategori", en: "Category" },
  status: { tr: "Durum", en: "Status" },
  priority: { tr: "Öncelik", en: "Priority" },
  impact: { tr: "Mağaza etkisi", en: "Store impact" },
  assignee: { tr: "İlgilenen", en: "Assignee" },
  unassigned: { tr: "Henüz atanmadı", en: "Not assigned yet" },
  created: { tr: "Oluşturuldu", en: "Created" },
  lastActivity: { tr: "Son aktivite", en: "Last activity" },
  firstSla: { tr: "İlk yanıt", en: "First response" },
  resolutionSla: { tr: "Çözüm", en: "Resolution" },
  closedReason: { tr: "Kapatılma nedeni", en: "Close reason" },
  contextTitle: { tr: "İlgili bağlam", en: "Related context" },
  detailsCard: { tr: "Talep detayı", en: "Request details" },
  conversation: { tr: "Yazışma", en: "Conversation" },
  replyLabel: { tr: "Yanıt", en: "Reply" },
  attachments: { tr: "Ekler", en: "Attachments" },
  noAttachments: { tr: "Henüz ek yok.", en: "No attachments yet." },
  addAttachment: { tr: "Dosya ekle (foto/PDF)", en: "Add file (photo/PDF)" },
  uploading: { tr: "Yükleniyor…", en: "Uploading…" },
  openAttachment: { tr: "Eki aç", en: "Open attachment" },
  history: { tr: "Talep Geçmişi", en: "Request History" },
  noHistory: { tr: "Henüz geçmiş kaydı yok.", en: "No history yet." },
  noMessages: { tr: "Henüz mesaj yok.", en: "No messages yet." },
  replyPlaceholder: { tr: "Platform ekibine yanıt yazın…", en: "Write a reply to the platform team…" },
  send: { tr: "Gönder", en: "Send" },
  sending: { tr: "Gönderiliyor…", en: "Sending…" },
  waitingCta: {
    tr: "Platform ekibi sizden bilgi bekliyor. Lütfen yanıtlayın.",
    en: "The platform team is waiting for your reply.",
  },
  withdraw: { tr: "Talebi geri çek", en: "Withdraw request" },
  confirmClose: { tr: "Çözümü onayla ve kapat", en: "Confirm resolution & close" },
  reopen: { tr: "Yeniden aç", en: "Reopen" },
  closedNote: { tr: "Bu talep kapatıldı.", en: "This request is closed." },
  conflict: {
    tr: "Talep bu sırada güncellendi; en son durum yüklendi. Lütfen tekrar deneyin.",
    en: "The request changed meanwhile; the latest state was loaded. Please try again.",
  },
} as const;

export default function PlatformRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const locale = useLocale() as Locale;
  const tr = (b: { tr: string; en: string }) => (locale === "tr" ? b.tr : b.en);

  const [detail, setDetail] = useState<StorePlatformRequestDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { request } = await storeApi.getPlatformRequest(id);
      setDetail(request);
    } catch (error) {
      setLoadError(messageForError(error, locale));
    }
  }, [id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  // VERSION_CONFLICT → taze veriyi yükle + kullanıcıya dostça uyarı (optimistic sahte state YOK).
  const onConflict = useCallback(async () => {
    setNotice(tr(T.conflict));
    await load();
  }, [load, tr]);

  const sendReply = useCallback(async () => {
    if (!detail || busy || replyBody.trim() === "") return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const { request } = await storeApi.replyPlatformRequest(id, { body: replyBody.trim() });
      setDetail(request);
      setReplyBody("");
    } catch (error) {
      if (error instanceof UiError && error.code === "VERSION_CONFLICT") await onConflict();
      else setActionError(messageForError(error, locale));
    } finally {
      setBusy(false);
    }
  }, [detail, busy, replyBody, id, locale, onConflict]);

  const onUpload = useCallback(
    async (file: File) => {
      if (!detail || uploadBusy) return;
      setUploadBusy(true);
      setUploadError(null);
      try {
        await storeApi.uploadPlatformRequestAttachment(id, file);
        await load(); // reload → yeni ek (STORE_VISIBLE) görünür
      } catch (error) {
        setUploadError(messageForError(error, locale));
      } finally {
        setUploadBusy(false);
      }
    },
    [detail, uploadBusy, id, locale, load],
  );

  const runAction = useCallback(
    async (action: "withdraw" | "confirmClose" | "reopen") => {
      if (!detail || busy) return;
      setBusy(true);
      setActionError(null);
      setNotice(null);
      try {
        const { request } = await storeApi.platformRequestAction(id, action, detail.version);
        setDetail(request);
      } catch (error) {
        if (error instanceof UiError && error.code === "VERSION_CONFLICT") await onConflict();
        else setActionError(messageForError(error, locale));
      } finally {
        setBusy(false);
      }
    },
    [detail, busy, id, locale, onConflict],
  );

  if (loadError && !detail) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/platform-requests" className="text-sm text-white/50 hover:text-white/80">
          ← {tr(T.back)}
        </Link>
        <Alert tone="error" title={tr(T.notFound)}>
          {loadError}
        </Alert>
      </div>
    );
  }
  if (!detail) {
    return <p className="text-sm text-white/50">{tr(T.loading)}</p>;
  }

  const d = detail;
  const isClosed = d.status === "CLOSED";
  const isWaitingStore = d.status === "WAITING_STORE";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/platform-requests" className="text-sm text-white/50 hover:text-white/80">
          ← {tr(T.back)}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-white/90">{d.requestNumber}</h1>
          <Badge tone={statusTone(d.status)}>{statusLabel(locale, d.status)}</Badge>
          <Badge tone={priorityTone(d.priority)}>{priorityLabel(locale, d.priority)}</Badge>
        </div>
        <p className="mt-1 text-base text-white/80">{d.subject}</p>
      </div>

      {notice ? (
        <Alert tone="warning" title={tr(T.conflict).split(";")[0]}>
          {notice}
        </Alert>
      ) : null}

      <SurfaceCard title={tr(T.detailsCard)} icon={<PlatformRequestIcon />}>
        <div className="space-y-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/75">{d.description}</p>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/[0.07] pt-4 text-sm sm:grid-cols-3">
            <Meta label={tr(T.category)}>{categoryLabel(locale, d.category)}</Meta>
            <Meta label={tr(T.priority)}>{priorityLabel(locale, d.priority)}</Meta>
            <Meta label={tr(T.impact)}>
              {d.storeImpact ? storeImpactLabel(locale, d.storeImpact) : "—"}
            </Meta>
            <Meta label={tr(T.assignee)}>
              {d.assigneeName ?? <span className="text-white/40">{tr(T.unassigned)}</span>}
            </Meta>
            <Meta label={tr(T.created)}>{formatDate(d.createdAt)}</Meta>
            <Meta label={tr(T.lastActivity)}>{formatDate(d.lastActivityAt)}</Meta>
            {d.sla ? (
              <>
                <Meta label={tr(T.firstSla)}>
                  <Badge tone={slaStateTone(d.sla.firstResponseState)}>
                    {slaStateLabel(locale, d.sla.firstResponseState)}
                  </Badge>
                </Meta>
                <Meta label={tr(T.resolutionSla)}>
                  <Badge tone={slaStateTone(d.sla.resolutionState)}>
                    {slaStateLabel(locale, d.sla.resolutionState)}
                  </Badge>
                </Meta>
              </>
            ) : null}
            {isClosed && d.closeReason ? (
              <Meta label={tr(T.closedReason)}>{closeReasonLabel(locale, d.closeReason)}</Meta>
            ) : null}
          </dl>

          {d.contextKind !== "NONE" && d.contextSnapshot ? (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                {tr(T.contextTitle)} · {contextKindLabel(locale, d.contextKind)}
              </p>
              {d.contextSnapshot.label ? (
                <p className="text-white/80">{d.contextSnapshot.label}</p>
              ) : null}
              {d.contextSnapshot.reference ? (
                <p className="text-white/50">{d.contextSnapshot.reference}</p>
              ) : null}
              {d.contextSnapshot.detail ? (
                <p className="mt-1 whitespace-pre-wrap text-white/60">{d.contextSnapshot.detail}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      <SurfaceCard title={tr(T.conversation)} icon={<PlatformRequestIcon />}>
        <div className="space-y-3">
          {d.messages.length === 0 ? (
            <p className="text-sm text-white/40">{tr(T.noMessages)}</p>
          ) : (
            <ul className="space-y-3">
              {d.messages.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-xl border p-3 ${
                    m.authorType === "STORE"
                      ? "border-indigo-400/20 bg-indigo-500/[0.08]"
                      : "border-white/[0.08] bg-white/[0.03]"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] text-white/40">
                    <span className="font-semibold text-white/60">{authorLabel(locale, m.authorType)}</span>
                    <span>{formatDate(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-white/80">{m.body}</p>
                </li>
              ))}
            </ul>
          )}

          {isWaitingStore ? (
            <Alert tone="warning" title={tr(T.waitingCta)} />
          ) : null}

          {actionError ? <p className="text-sm text-rose-300">{actionError}</p> : null}

          {isClosed ? (
            <p className="text-sm text-white/40">{tr(T.closedNote)}</p>
          ) : (
            <div className="space-y-2">
              <Textarea
                label={tr(T.replyLabel)}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={3}
                placeholder={tr(T.replyPlaceholder)}
              />
              <div className="flex justify-end">
                <Button onClick={() => void sendReply()} disabled={busy || replyBody.trim() === ""}>
                  {busy ? tr(T.sending) : tr(T.send)}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SurfaceCard>

      {/* Ekler — YALNIZ STORE_VISIBLE (INTERNAL ekler store DTO'suna hiç girmez). Foto/PDF human-readable. */}
      <SurfaceCard title={tr(T.attachments)} icon={<PlatformRequestIcon />}>
        <div className="space-y-3">
          {d.attachments.length === 0 ? (
            <p className="text-sm text-white/40">{tr(T.noAttachments)}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {d.attachments.map((att) => (
                <li key={att.id}>
                  <a
                    href={`/api/platform-requests/attachments/${att.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="platform-request-attachment-link"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-sm text-white/70 hover:text-indigo-200"
                  >
                    <span aria-hidden>{att.type === "PDF" ? "📄" : "📷"}</span>
                    {tr(T.openAttachment)}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {!isClosed ? (
            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-sm text-white/70 hover:text-white/90">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  disabled={uploadBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f);
                    e.target.value = "";
                  }}
                />
                {uploadBusy ? tr(T.uploading) : tr(T.addAttachment)}
              </label>
              {uploadError ? <p className="mt-1 text-sm text-rose-300">{uploadError}</p> : null}
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      {/* Konuşmadan AYRI güvenli audit timeline (INTERNAL içerik/not existence store'a girmez). */}
      <SurfaceCard title={tr(T.history)} icon={<PlatformRequestIcon />}>
        {d.timeline.length === 0 ? (
          <p className="text-sm text-white/40">{tr(T.noHistory)}</p>
        ) : (
          <ol className="space-y-2.5">
            {d.timeline.map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-white/80">
                      {timelineEventLabel(locale, ev.event)}
                      <span className="text-white/35"> · {authorLabel(locale, ev.actorType)}</span>
                    </span>
                    <time className="text-[11px] text-white/35">{formatDate(ev.createdAt)}</time>
                  </div>
                  <TimelineDetail ev={ev} locale={locale} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </SurfaceCard>

      {/* Store aksiyonları — YALNIZ backend'in izin verdiği (canWithdraw/canConfirmClose/canReopen). */}
      {d.canWithdraw || d.canConfirmClose || d.canReopen ? (
        <div className="flex flex-wrap justify-end gap-2">
          {d.canReopen ? (
            <Button variant="ghost" onClick={() => void runAction("reopen")} disabled={busy}>
              {tr(T.reopen)}
            </Button>
          ) : null}
          {d.canWithdraw ? (
            <Button variant="ghost" onClick={() => void runAction("withdraw")} disabled={busy}>
              {tr(T.withdraw)}
            </Button>
          ) : null}
          {d.canConfirmClose ? (
            <Button onClick={() => void runAction("confirmClose")} disabled={busy}>
              {tr(T.confirmClose)}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/35">{label}</dt>
      <dd className="mt-0.5 text-white/80">{children}</dd>
    </div>
  );
}

// Timeline event'inin insan-okunur detayı (event tipine göre). Ham enum/id kullanılmaz.
function TimelineDetail({
  ev,
  locale,
}: {
  ev: StorePlatformRequestDetail["timeline"][number];
  locale: Locale;
}) {
  let text: string | null = null;
  switch (ev.event) {
    case "STATUS_CHANGED":
      text = `${ev.fromStatus ? statusLabel(locale, ev.fromStatus) : "—"} → ${ev.toStatus ? statusLabel(locale, ev.toStatus) : "—"}`;
      break;
    case "ASSIGNED":
      text = ev.assigneeName;
      break;
    case "PRIORITY_CHANGED":
      text = `${ev.fromPriority ? priorityLabel(locale, ev.fromPriority) : "—"} → ${ev.toPriority ? priorityLabel(locale, ev.toPriority) : "—"}`;
      break;
    case "CATEGORY_CHANGED":
      text = ev.category ? categoryLabel(locale, ev.category) : null;
      break;
    case "WITHDRAWN":
    case "CLOSED":
      text = ev.closeReason ? closeReasonLabel(locale, ev.closeReason) : null;
      break;
    default:
      text = null;
  }
  return text ? <p className="text-xs text-white/50">{text}</p> : null;
}
