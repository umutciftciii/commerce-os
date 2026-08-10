import { formatDate, formatDateTime, type Locale, type StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerSupportTicketDetail } from "@commerce-os/contracts";
import { Badge } from "../../ui";
import { actorLabel, answerSummaryText, statusLabel, topicLabel, warrantyText } from "../../../lib/support/labels";

type SupportDict = StorefrontDictionary["account"]["support"];
type TicketAttachment = CustomerSupportTicketDetail["attachments"][number];

/**
 * TODO-177 (ADR-289) Faz D — Ticket detayının SUNUCU-render (statik) görünümü: bağlam, garanti,
 * önerilen çözüm, guided cevaplar, yazışma ve ekler. Tüm enum'lar i18n etiketine çevrilir (ham
 * enum/teknik ID GÖSTERİLMEZ). Etkileşim (yanıt/reopen) ayrı istemci paneldedir. Ekler auth-gate'li
 * BFF proxy üzerinden açılır (`attachmentHref`); iç depolama anahtarı/mimeType DTO'da yoktur.
 */
export function SupportTicketDetailView({
  ticket,
  t,
  locale,
  attachmentHref,
}: {
  ticket: CustomerSupportTicketDetail;
  t: SupportDict;
  locale: Locale;
  attachmentHref: (attachmentId: string) => string;
}) {
  const showWarranty = ticket.warranty.warrantyEndsAt !== null;
  return (
    <div className="space-y-6" data-testid="support-ticket-detail">
      {/* Bağlam */}
      <section className="space-y-2 border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-base font-semibold text-ink">
            {t.detail.ticketNumber}: {ticket.ticketNumber}
          </h1>
          <Badge tone="outline">{statusLabel(ticket.status, t)}</Badge>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Row label={t.detail.productLabel} value={`${ticket.productTitle}${ticket.variantTitle ? ` · ${ticket.variantTitle}` : ""}`} />
          <Row label={t.detail.orderLabel} value={ticket.orderNumber} />
          <Row label={t.detail.topicLabel} value={topicLabel(ticket.topic, t)} />
          <Row label={t.detail.createdAt} value={formatDate(ticket.createdAt, locale)} />
          {ticket.resolvedAt ? (
            <Row label={t.detail.resolvedAt} value={formatDate(ticket.resolvedAt, locale)} />
          ) : null}
        </dl>
      </section>

      {/* Garanti (yalnız bitiş tarihi varsa; anchorSource GÖSTERİLMEZ) */}
      {showWarranty ? (
        <section className="border border-line p-4 text-sm">
          <p className="font-medium text-ink">{t.warranty.heading}</p>
          <p className="text-ink-muted">
            {warrantyText(ticket.warranty, t, (iso) => formatDate(iso, locale))}
          </p>
        </section>
      ) : null}

      {/* Önerilen çözüm (varsa) */}
      {ticket.suggestedResolutionText ? (
        <section className="border border-line p-4 text-sm">
          <p className="font-medium text-ink">{t.detail.suggestionHeading}</p>
          <p className="whitespace-pre-line text-ink-muted">{ticket.suggestedResolutionText}</p>
        </section>
      ) : null}

      {/* Guided cevaplar */}
      {ticket.answers.length > 0 ? (
        <section className="border border-line p-4">
          <p className="mb-2 text-sm font-medium text-ink">{t.detail.answersHeading}</p>
          <ul className="space-y-1 text-sm text-ink-muted">
            {ticket.answers.map((answer) => {
              const value = answerSummaryText(answer, t);
              return (
                <li key={answer.questionKey}>
                  <span className="text-ink">{answer.questionPrompt}</span>
                  {value ? <span>: {value}</span> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Escalation ekleri (ticket-level) */}
      {ticket.attachments.length > 0 ? (
        <section className="border border-line p-4">
          <p className="mb-2 text-sm font-medium text-ink">{t.detail.attachmentsHeading}</p>
          <AttachmentList attachments={ticket.attachments} attachmentHref={attachmentHref} label={t.detail.viewAttachment} />
        </section>
      ) : null}

      {/* Yazışma */}
      <section className="border border-line p-4">
        <p className="mb-3 text-sm font-medium text-ink">{t.detail.conversationHeading}</p>
        {ticket.messages.length === 0 ? (
          <p className="text-sm text-ink-subtle">—</p>
        ) : (
          <ol className="space-y-3">
            {ticket.messages.map((message) => (
              <li key={message.id} className="border-l-2 border-line pl-3" data-testid="support-message">
                <p className="text-xs text-ink-subtle">
                  <span className="font-medium text-ink">{actorLabel(message.actorType, t)}</span>
                  {" · "}
                  {formatDateTime(message.createdAt, locale)}
                </p>
                <p className="whitespace-pre-line text-sm text-ink-muted">{message.body}</p>
                {message.attachments.length > 0 ? (
                  <div className="mt-1">
                    <AttachmentList
                      attachments={message.attachments}
                      attachmentHref={attachmentHref}
                      label={t.detail.viewAttachment}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 sm:block">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="font-medium text-ink sm:font-normal sm:text-ink-muted">{value}</dd>
    </div>
  );
}

function AttachmentList({
  attachments,
  attachmentHref,
  label,
}: {
  attachments: TicketAttachment[];
  attachmentHref: (attachmentId: string) => string;
  label: string;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <a
            href={attachmentHref(attachment.id)}
            target="_blank"
            rel="noreferrer"
            data-testid="support-attachment-link"
            className="inline-flex items-center gap-1 border border-line px-2.5 py-1 text-xs text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
          >
            {attachment.type === "PDF" ? "PDF" : "📷"} {label}
          </a>
        </li>
      ))}
    </ul>
  );
}
