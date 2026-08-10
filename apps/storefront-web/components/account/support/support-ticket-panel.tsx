"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { SupportTicketStatusDto } from "@commerce-os/contracts";
import { Alert, Button, ButtonLink } from "../../ui";
import { PhotoUpload, type PhotoUploadResult } from "../../ui/photo-upload";
import { SUPPORT_ATTACHMENT_MIME_TYPES } from "../../../lib/attachment";
import { supportErrorMessage } from "../../../lib/support/labels";
import { ticketPanelMode } from "../../../lib/support/ticket";
import {
  reopenSupportTicketAction,
  sendSupportMessageAction,
  uploadSupportAttachmentAction,
} from "../../../lib/server/support-actions";

type SupportDict = StorefrontDictionary["account"]["support"];

/**
 * TODO-177 (ADR-289) Faz D — Ticket detay etkileşim paneli (istemci). Mod saf `ticketPanelMode`
 * ile seçilir; iç SLA cycle GÖSTERİLMEZ. Mesajlaşma SUNUCU-OTORİTERDİR: optimistic sahte state
 * ÜRETİLMEZ — gönderim sonrası `router.refresh()` ile server'dan taze durum (WAITING_STORE)
 * yansıtılır. Reopen yalnız RESOLVED + owner + 7 gün (backend karar verir). CLOSED reopen YOK.
 */
export function SupportTicketPanel({
  ticketNumber,
  status,
  canReopen,
  orderNumber,
  t,
}: {
  ticketNumber: string;
  status: SupportTicketStatusDto;
  canReopen: boolean;
  orderNumber: string;
  t: SupportDict;
}) {
  const router = useRouter();
  const mode = ticketPanelMode(status, canReopen);
  const [body, setBody] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [uploadKey, setUploadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newTicketHref = `/account/orders/${encodeURIComponent(orderNumber)}`;

  async function handleUpload(file: File): Promise<PhotoUploadResult> {
    const form = new FormData();
    form.append("file", file);
    const res = await uploadSupportAttachmentAction(form);
    return res.ok ? { ok: true, mediaId: res.mediaId } : { ok: false };
  }

  async function sendMessage() {
    if (busy || body.trim().length === 0) return;
    setBusy(true);
    setError(null);
    const res = await sendSupportMessageAction(ticketNumber, {
      body: body.trim(),
      attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
    });
    if (res.status === "error") {
      setError(supportErrorMessage(res.code, t));
      setBusy(false);
      return;
    }
    // Server-otoriter: optimistic ekleme YOK; formu temizle + refresh ile taze durum.
    setBody("");
    setAttachmentIds([]);
    setUploadKey((k) => k + 1);
    setBusy(false);
    router.refresh();
  }

  async function reopen() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await reopenSupportTicketAction(ticketNumber);
    if (res.status === "error") {
      setError(supportErrorMessage(res.code, t));
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-3" data-testid="support-ticket-panel">
      {mode === "reply" ? (
        <div className="space-y-2 border border-line p-4">
          <label htmlFor="support-reply" className="text-xs font-medium text-ink">
            {t.detail.messageLabel}
          </label>
          <textarea
            id="support-reply"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t.detail.messagePlaceholder}
            rows={3}
            maxLength={4000}
            className="w-full border border-line px-3 py-2 text-sm"
          />
          <div>
            <p className="mb-1 text-xs font-medium text-ink">{t.detail.attachmentAdd}</p>
            <PhotoUpload
              key={uploadKey}
              labels={t.photo}
              accept={SUPPORT_ATTACHMENT_MIME_TYPES}
              onUpload={handleUpload}
              onChange={setAttachmentIds}
            />
          </div>
          <Button
            size="sm"
            onClick={sendMessage}
            disabled={busy || body.trim().length === 0}
            data-testid="support-reply-submit"
          >
            {busy ? t.detail.sending : t.detail.sendMessage}
          </Button>
        </div>
      ) : null}

      {mode === "reopen" ? (
        <div className="space-y-2 border border-line p-4" data-testid="support-reopen">
          <p className="text-xs text-ink-muted">{t.reopen.help}</p>
          <Button size="sm" onClick={reopen} disabled={busy} data-testid="support-reopen-submit">
            {busy ? t.reopen.reopening : t.reopen.available}
          </Button>
        </div>
      ) : null}

      {mode === "expired" ? (
        <div className="space-y-2 border border-line p-4" data-testid="support-reopen-expired">
          <p className="text-xs text-ink-muted">{t.reopen.expired}</p>
          <ButtonLink href={newTicketHref} variant="secondary" size="sm">
            {t.reopen.newTicketCta}
          </ButtonLink>
        </div>
      ) : null}

      {mode === "closed" ? (
        <div className="space-y-2 border border-line p-4" data-testid="support-closed">
          <p className="text-xs text-ink-muted">{t.detail.messageClosed}</p>
          <ButtonLink href={newTicketHref} variant="secondary" size="sm">
            {t.reopen.newTicketCta}
          </ButtonLink>
        </div>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
