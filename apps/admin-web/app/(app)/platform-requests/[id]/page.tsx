"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  SectionCard,
  SkeletonRows,
  Textarea,
  useLocale,
} from "@commerce-os/ui";
import type { PlatformRequestDetail } from "@commerce-os/api-client";
import { adminApi, UiError } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { RequestContext } from "../../../../components/platform-requests/context";
import { AssigneeSelector } from "../../../../components/platform-requests/assignee-selector";
import {
  statusLabel,
  statusTone,
  priorityLabel,
  priorityTone,
  storeImpactLabel,
  closeReasonLabel,
  slaStateLabel,
  slaTone,
  authorLabel,
  nextStatuses,
  platformCloseReasons,
  PRIORITY_KEYS,
} from "../../../../components/platform-requests/labels";

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

export default function PlatformRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const locale = useLocale() as "tr" | "en";
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [detail, setDetail] = useState<PlatformRequestDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const r = await adminApi.getPlatformRequest(id);
      setDetail(r.request);
      setState({ status: "ready" });
    } catch (e) {
      setState({ status: "error", message: messageForError(e, locale) });
    }
  }, [id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tüm mutation'lar: server-authoritative + expectedVersion. 409 → taze yükle + insan mesajı.
  const runAction = useCallback(
    async (fn: () => Promise<{ request: PlatformRequestDetail }>, successMsg: string) => {
      setBusy(true);
      setActionError(null);
      setNotice(null);
      try {
        const r = await fn();
        setDetail(r.request);
        setNotice(successMsg);
      } catch (e) {
        if (e instanceof UiError && e.code === "VERSION_CONFLICT") {
          await load();
          setActionError(messageForError(e, locale));
        } else {
          setActionError(messageForError(e, locale));
        }
      } finally {
        setBusy(false);
      }
    },
    [load, locale],
  );

  // TODO-178 (Faz E) — attachment upload (foto/PDF). Visibility STORE_VISIBLE | INTERNAL (platform).
  const onUpload = useCallback(
    async (visibility: "STORE_VISIBLE" | "INTERNAL", file: File) => {
      setBusy(true);
      setActionError(null);
      setNotice(null);
      try {
        await adminApi.uploadPlatformRequestAttachment(id, visibility, file);
        await load();
      } catch (e) {
        setActionError(messageForError(e, locale));
      } finally {
        setBusy(false);
      }
    },
    [id, load, locale],
  );

  if (state.status === "loading") return <SkeletonRows rows={8} />;
  if (state.status === "error" || !detail) {
    return (
      <Alert tone="error">
        {state.status === "error" ? state.message : locale === "tr" ? "Talep bulunamadı." : "Request not found."}
        <Button variant="secondary" size="sm" onClick={() => void load()}>{locale === "tr" ? "Tekrar dene" : "Retry"}</Button>
      </Alert>
    );
  }

  const d = detail;
  const v = d.version;
  const closeReasons = platformCloseReasons(d.status);
  const transitions = nextStatuses(d.status);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${d.requestNumber} · ${d.subject}`}
        breadcrumb={<Link href="/platform-requests" className="text-sm text-brand-600">← {locale === "tr" ? "Mağaza Talepleri" : "Store Requests"}</Link>}
        actions={
          <span className="flex items-center gap-2">
            <Badge tone={priorityTone(d.priority)}>{priorityLabel(d.priority, locale)}</Badge>
            <Badge tone={statusTone(d.status)}>{statusLabel(d.status, locale)}</Badge>
          </span>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title={locale === "tr" ? "Talep" : "Request"}>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500">{locale === "tr" ? "Mağaza" : "Store"}</dt>
              <dd className="font-medium">{d.storeName}</dd>
              <dt className="text-slate-500">{locale === "tr" ? "Açan" : "Created by"}</dt>
              <dd>{d.createdByName} <span className="text-slate-400">({d.createdByEmail})</span></dd>
              <dt className="text-slate-500">{locale === "tr" ? "Güncel kategori" : "Current category"}</dt>
              <dd className="font-medium">{locale === "tr" ? d.category.labelTr : d.category.labelEn}</dd>
              {d.filedCategory.key !== d.category.key ? (
                <>
                  <dt className="text-slate-500">{locale === "tr" ? "İlk açıldığı kategori" : "Filed under"}</dt>
                  <dd className="text-slate-500">{locale === "tr" ? d.filedCategory.labelTr : d.filedCategory.labelEn} <span className="text-xs">({locale === "tr" ? "kayıt/audit" : "audit"})</span></dd>
                </>
              ) : null}
              {d.storeImpact ? (
                <>
                  <dt className="text-slate-500">{locale === "tr" ? "Mağaza etkisi" : "Store impact"}</dt>
                  <dd><Badge tone="neutral">{storeImpactLabel(d.storeImpact, locale)}</Badge> <span className="text-xs text-slate-400">({locale === "tr" ? "bilgi amaçlı" : "advisory"})</span></dd>
                </>
              ) : null}
              <dt className="text-slate-500">{locale === "tr" ? "Oluşturma" : "Created"}</dt>
              <dd className="text-slate-500">{new Date(d.createdAt).toLocaleString(locale)}</dd>
              <dt className="text-slate-500">{locale === "tr" ? "Son aktivite" : "Last activity"}</dt>
              <dd className="text-slate-500">{new Date(d.lastActivityAt).toLocaleString(locale)}</dd>
            </dl>
            <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm">{d.description}</p>
          </SectionCard>

          <SectionCard title={locale === "tr" ? "Bağlam" : "Context"}>
            <RequestContext contextKind={d.contextKind} snapshot={d.contextSnapshot} locale={locale} />
          </SectionCard>

          <SectionCard title={locale === "tr" ? "Yazışma" : "Conversation"}>
            {d.messages.length === 0 ? (
              <p className="text-sm text-slate-400">{locale === "tr" ? "Henüz mesaj yok." : "No messages yet."}</p>
            ) : (
              <ul className="space-y-2">
                {d.messages.map((m) => {
                  const internal = m.visibility === "INTERNAL";
                  return (
                    <li
                      key={m.id}
                      className={
                        internal
                          ? "rounded-md border border-amber-200 bg-amber-50 p-3"
                          : "rounded-md border border-slate-200 bg-white p-3"
                      }
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span className="font-medium">{authorLabel(m.authorType, locale)}</span>
                        {internal ? (
                          <Badge tone="warning">{locale === "tr" ? "Dahili not — mağaza görmez" : "Internal note — not shown to store"}</Badge>
                        ) : (
                          <Badge tone="info">{locale === "tr" ? "Mağazaya görünür" : "Visible to store"}</Badge>
                        )}
                        <span className="text-slate-400">{new Date(m.createdAt).toLocaleString(locale)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            {d.status !== "CLOSED" ? (
              <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
                <ReplyComposer
                  locale={locale}
                  variant="STORE_VISIBLE"
                  busy={busy}
                  onSend={(body) =>
                    runAction(
                      () => adminApi.addPlatformRequestMessage(d.requestId, { body, visibility: "STORE_VISIBLE" }),
                      locale === "tr" ? "Yanıt gönderildi." : "Reply sent.",
                    )
                  }
                />
                <ReplyComposer
                  locale={locale}
                  variant="INTERNAL"
                  busy={busy}
                  onSend={(body) =>
                    runAction(
                      () => adminApi.addPlatformRequestMessage(d.requestId, { body, visibility: "INTERNAL" }),
                      locale === "tr" ? "Dahili not eklendi." : "Internal note added.",
                    )
                  }
                />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title={locale === "tr" ? "Ekler" : "Attachments"}>
            {d.attachments.length === 0 ? (
              <p className="text-sm text-slate-400">{locale === "tr" ? "Henüz ek yok." : "No attachments yet."}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {d.attachments.map((att) => {
                  const internal = att.visibility === "INTERNAL";
                  return (
                    <li key={att.id}>
                      <a
                        href={`/api/admin/platform-requests/attachments/${att.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={internal ? "internal-attachment-link" : "visible-attachment-link"}
                        className={
                          internal
                            ? "inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm"
                            : "inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm"
                        }
                      >
                        <span aria-hidden>{att.type === "PDF" ? "📄" : "📷"}</span>
                        {locale === "tr" ? "Eki aç" : "Open"}
                        {internal ? (
                          <Badge tone="warning">{locale === "tr" ? "Dahili — mağaza görmez" : "Internal — hidden from store"}</Badge>
                        ) : (
                          <Badge tone="info">{locale === "tr" ? "Görünür ek" : "Visible file"}</Badge>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            {d.status !== "CLOSED" ? (
              <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                <AttachmentUploader
                  locale={locale}
                  variant="STORE_VISIBLE"
                  busy={busy}
                  onUpload={(file) => onUpload("STORE_VISIBLE", file)}
                />
                <AttachmentUploader
                  locale={locale}
                  variant="INTERNAL"
                  busy={busy}
                  onUpload={(file) => onUpload("INTERNAL", file)}
                />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title={locale === "tr" ? "Zaman çizelgesi" : "Timeline"}>
            <ul className="space-y-1 text-sm">
              {d.timeline.map((t) => (
                <li key={t.id} className="flex items-baseline gap-2">
                  <span className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleString(locale)}</span>
                  <span className="font-medium">{authorLabel(t.actorType, locale)}</span>
                  <span className="text-slate-600">
                    {t.toStatus ? statusLabel(t.toStatus, locale) : t.eventType.replace(/_/g, " ").toLowerCase()}
                  </span>
                  {t.note ? <span className="text-slate-400">— {t.note}</span> : null}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title={locale === "tr" ? "Atama" : "Assignment"}>
            <p className="mb-2 text-sm">
              {d.assigneeName ? (
                <span className="font-medium">{d.assigneeName}</span>
              ) : d.assigneePlatformUserId ? (
                // TD-178-6: assignee kaydı silinmiş/erişilemez → güvenli fallback (ham id gösterme).
                <span className="text-amber-600">{locale === "tr" ? "Atanmış kullanıcı bulunamadı (kayıt yok)" : "Assigned user unavailable (record missing)"}</span>
              ) : (
                <span className="text-slate-400">{locale === "tr" ? "Atanmamış" : "Unassigned"}</span>
              )}
            </p>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                runAction(
                  () => adminApi.assignPlatformRequest(d.requestId, { expectedVersion: v, assigneePlatformUserId: "me" }),
                  locale === "tr" ? "Size atandı." : "Assigned to you.",
                )
              }
            >
              {locale === "tr" ? "Kendime ata" : "Assign to me"}
            </Button>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs text-slate-500">{locale === "tr" ? "Başka kullanıcıya ata" : "Assign to another user"}</p>
              <AssigneeSelector
                locale={locale}
                disabled={busy}
                onPick={(u) =>
                  runAction(
                    () => adminApi.assignPlatformRequest(d.requestId, { expectedVersion: v, assigneePlatformUserId: u.id }),
                    locale === "tr" ? `${u.name ?? u.email} atandı.` : `Assigned to ${u.name ?? u.email}.`,
                  )
                }
              />
            </div>
          </SectionCard>

          <SectionCard title={locale === "tr" ? "Öncelik" : "Priority"}>
            <PrioritySelector
              locale={locale}
              current={d.priority}
              busy={busy}
              onApply={(priority) =>
                runAction(
                  () => adminApi.setPlatformRequestPriority(d.requestId, { expectedVersion: v, priority: priority as never }),
                  locale === "tr" ? "Öncelik güncellendi." : "Priority updated.",
                )
              }
            />
          </SectionCard>

          <SectionCard title={locale === "tr" ? "Durum" : "Status"}>
            {transitions.length === 0 && closeReasons.length === 0 ? (
              <p className="text-sm text-slate-400">{locale === "tr" ? "Bu durumda yapılabilecek geçiş yok." : "No transitions available."}</p>
            ) : (
              <div className="space-y-3">
                {transitions.length > 0 ? (
                  <StatusSelector
                    locale={locale}
                    options={transitions}
                    busy={busy}
                    onApply={(toStatus) =>
                      runAction(
                        () => adminApi.setPlatformRequestStatus(d.requestId, { expectedVersion: v, toStatus: toStatus as never }),
                        locale === "tr" ? "Durum güncellendi." : "Status updated.",
                      )
                    }
                  />
                ) : null}
                {closeReasons.length > 0 ? (
                  <CloseAction
                    locale={locale}
                    reasons={closeReasons}
                    busy={busy}
                    onClose={(closeReason) =>
                      runAction(
                        () => adminApi.setPlatformRequestStatus(d.requestId, { expectedVersion: v, toStatus: "CLOSED", closeReason: closeReason as never }),
                        locale === "tr" ? "Talep kapatıldı." : "Request closed.",
                      )
                    }
                  />
                ) : null}
              </div>
            )}
            {d.closeReason ? (
              <p className="mt-2 text-xs text-slate-500">{locale === "tr" ? "Kapatma nedeni" : "Close reason"}: {closeReasonLabel(d.closeReason, locale)}</p>
            ) : null}
          </SectionCard>

          <SectionCard title={locale === "tr" ? "SLA" : "SLA"}>
            {d.sla ? (
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-500">{locale === "tr" ? "Döngü" : "Cycle"}</dt>
                <dd>{d.sla.cycle}</dd>
                <dt className="text-slate-500">{locale === "tr" ? "İlk yanıt" : "First response"}</dt>
                <dd><Badge tone={slaTone(d.sla.firstResponseState)}>{slaStateLabel(d.sla.firstResponseState, locale)}</Badge></dd>
                <dt className="text-slate-500">{locale === "tr" ? "Çözüm" : "Resolution"}</dt>
                <dd><Badge tone={slaTone(d.sla.resolutionState)}>{slaStateLabel(d.sla.resolutionState, locale)}</Badge></dd>
              </dl>
            ) : (
              <p className="text-sm text-slate-400">{locale === "tr" ? "SLA bilgisi yok." : "No SLA data."}</p>
            )}
          </SectionCard>

          {d.status !== "CLOSED" ? (
            <SectionCard title={locale === "tr" ? "Kategori değiştir" : "Recategorize"}>
              <RecategorizeSelector
                locale={locale}
                currentKey={d.category.key}
                busy={busy}
                onApply={(categoryKey) =>
                  runAction(
                    () => adminApi.recategorizePlatformRequest(d.requestId, { expectedVersion: v, categoryKey }),
                    locale === "tr" ? "Kategori güncellendi." : "Category updated.",
                  )
                }
              />
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// TODO-178 (Faz E) — Foto/PDF ek yükleyici (STORE_VISIBLE veya INTERNAL). Internal görsel olarak amber.
function AttachmentUploader({
  locale,
  variant,
  busy,
  onUpload,
}: {
  locale: "tr" | "en";
  variant: "STORE_VISIBLE" | "INTERNAL";
  busy: boolean;
  onUpload: (file: File) => void;
}) {
  const internal = variant === "INTERNAL";
  const label = internal
    ? locale === "tr"
      ? "Dahili ek yükle (foto/PDF)"
      : "Upload internal file (photo/PDF)"
    : locale === "tr"
      ? "Görünür ek yükle (foto/PDF)"
      : "Upload visible file (photo/PDF)";
  return (
    <label
      className={
        internal
          ? "inline-flex cursor-pointer items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800"
          : "inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
      }
    >
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        disabled={busy}
        data-testid={internal ? "internal-attachment-upload" : "visible-attachment-upload"}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
      {label}
    </label>
  );
}

function ReplyComposer({
  locale,
  variant,
  busy,
  onSend,
}: {
  locale: "tr" | "en";
  variant: "STORE_VISIBLE" | "INTERNAL";
  busy: boolean;
  onSend: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  const internal = variant === "INTERNAL";
  return (
    <div
      data-testid={internal ? "internal-note-composer" : "visible-reply-composer"}
      className={internal ? "rounded-md border border-amber-200 bg-amber-50/40 p-3" : "rounded-md border border-slate-200 p-3"}
    >
      <p className="mb-1 text-sm font-medium">
        {internal ? (locale === "tr" ? "Dahili not (mağaza görmez)" : "Internal note (not shown to store)") : locale === "tr" ? "Mağazaya yanıt" : "Reply to store"}
      </p>
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          variant={internal ? "secondary" : "primary"}
          disabled={busy || body.trim().length === 0}
          onClick={() => { onSend(body.trim()); setBody(""); }}
        >
          {internal ? (locale === "tr" ? "Not ekle" : "Add note") : locale === "tr" ? "Yanıtla" : "Send reply"}
        </Button>
      </div>
    </div>
  );
}

function PrioritySelector({ locale, current, busy, onApply }: { locale: "tr" | "en"; current: string; busy: boolean; onApply: (p: string) => void }) {
  const [value, setValue] = useState(current);
  return (
    <div className="flex items-center gap-2" data-testid="priority-selector">
      <select className="rounded-md border border-slate-200 px-2 py-1.5 text-sm" value={value} onChange={(e) => setValue(e.target.value)}>
        {PRIORITY_KEYS.map((k) => (
          <option key={k} value={k}>{priorityLabel(k, locale)}</option>
        ))}
      </select>
      <Button size="sm" variant="secondary" disabled={busy || value === current} onClick={() => onApply(value)}>
        {locale === "tr" ? "Uygula" : "Apply"}
      </Button>
    </div>
  );
}

function StatusSelector({ locale, options, busy, onApply }: { locale: "tr" | "en"; options: string[]; busy: boolean; onApply: (s: string) => void }) {
  const [value, setValue] = useState(options[0]);
  return (
    <div className="flex items-center gap-2" data-testid="status-selector">
      <select className="rounded-md border border-slate-200 px-2 py-1.5 text-sm" value={value} onChange={(e) => setValue(e.target.value)}>
        {options.map((k) => (
          <option key={k} value={k}>{statusLabel(k, locale)}</option>
        ))}
      </select>
      <Button size="sm" disabled={busy} onClick={() => onApply(value)}>{locale === "tr" ? "Geçir" : "Move"}</Button>
    </div>
  );
}

function CloseAction({ locale, reasons, busy, onClose }: { locale: "tr" | "en"; reasons: string[]; busy: boolean; onClose: (r: string) => void }) {
  const [value, setValue] = useState(reasons[0]);
  return (
    <div className="flex items-center gap-2 border-t border-slate-100 pt-3" data-testid="close-action">
      <select className="rounded-md border border-slate-200 px-2 py-1.5 text-sm" value={value} onChange={(e) => setValue(e.target.value)}>
        {reasons.map((k) => (
          <option key={k} value={k}>{closeReasonLabel(k, locale)}</option>
        ))}
      </select>
      <Button size="sm" variant="danger" disabled={busy} onClick={() => onClose(value)}>{locale === "tr" ? "Kapat" : "Close"}</Button>
    </div>
  );
}

function RecategorizeSelector({ locale, currentKey, busy, onApply }: { locale: "tr" | "en"; currentKey: string; busy: boolean; onApply: (key: string) => void }) {
  const [cats, setCats] = useState<Array<{ key: string; labelTr: string; labelEn: string; active: boolean }>>([]);
  const [value, setValue] = useState(currentKey);
  useEffect(() => {
    void adminApi.listPlatformRequestCategories().then((r) => setCats(r.items)).catch(() => setCats([]));
  }, []);
  return (
    <div className="flex items-center gap-2" data-testid="recategorize-selector">
      <select className="rounded-md border border-slate-200 px-2 py-1.5 text-sm" value={value} onChange={(e) => setValue(e.target.value)}>
        {cats.filter((c) => c.active || c.key === currentKey).map((c) => (
          <option key={c.key} value={c.key}>{locale === "tr" ? c.labelTr : c.labelEn}</option>
        ))}
      </select>
      <Button size="sm" variant="secondary" disabled={busy || value === currentKey} onClick={() => onApply(value)}>
        {locale === "tr" ? "Taşı" : "Move"}
      </Button>
    </div>
  );
}
