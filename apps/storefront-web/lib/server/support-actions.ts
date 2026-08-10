"use server";

import { revalidatePath } from "next/cache";
import type {
  SupportMessageCreateRequest,
  SupportResolveRequest,
  SupportResolveResponse,
  SupportTicketCreateRequest,
} from "@commerce-os/contracts";
import {
  createSupportTicket,
  reopenSupportTicket,
  resolveSupport,
  sendSupportMessage,
  uploadSupportAttachment,
} from "./support";

/**
 * TODO-177 (ADR-289) Faz D — Vitrin Ürün Desteği Server Action'ları ("use server").
 *
 * İstemci sihirbazı/detay ekranı yalnız bu tipli aksiyonları çağırır; auth (cookie
 * jetonu), context re-validation (orderLineId+storeId+customerId), question graph, SLA
 * ve reopen penceresi SUNUCUDADIR. Aksiyonlar hata zarfını sade, serileştirilebilir
 * duruma indirger (kod string'i UI'da mesaja eşlenir; PII/secret/internal detay taşımaz).
 * Başarıda ilgili yolları revalidate eder.
 */

/** Guided bağlam çözümü (topic seçildikten sonra grafı getir). */
export type ResolveSupportState =
  | { status: "ok"; data: SupportResolveResponse }
  | { status: "error"; code: string | null; httpStatus: number };

export async function resolveSupportAction(
  body: SupportResolveRequest,
): Promise<ResolveSupportState> {
  const result = await resolveSupport(body);
  if (!result.ok) {
    return { status: "error", code: result.code, httpStatus: result.status };
  }
  return { status: "ok", data: result.data };
}

/** Destek talebi oluşturma. Başarıda ticketNumber döner → istemci detaya yönlendirir. */
export type CreateSupportTicketState =
  | { status: "idle" }
  | { status: "success"; ticketNumber: string }
  | { status: "error"; code: string | null; httpStatus: number };

export async function createSupportTicketAction(
  body: SupportTicketCreateRequest,
): Promise<CreateSupportTicketState> {
  const result = await createSupportTicket(body);
  if (!result.ok) {
    return { status: "error", code: result.code, httpStatus: result.status };
  }
  revalidatePath("/account/support");
  return { status: "success", ticketNumber: result.data.ticket.ticketNumber };
}

/** Talep detayı üzerinde mesaj/yeniden-açma aksiyonlarının ortak sonucu. */
export type SupportTicketActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string | null; httpStatus: number };

/** Müşteri yanıtı gönder (server ticket'ı WAITING_STORE'a taşır). */
export async function sendSupportMessageAction(
  ticketNumber: string,
  body: SupportMessageCreateRequest,
): Promise<SupportTicketActionState> {
  const result = await sendSupportMessage(ticketNumber, body);
  if (!result.ok) return { status: "error", code: result.code, httpStatus: result.status };
  revalidatePath(`/account/support/${encodeURIComponent(ticketNumber)}`);
  revalidatePath("/account/support");
  return { status: "success" };
}

/** RESOLVED talebi yeniden aç (yalnız owner + 7 gün; taze SLA döngüsü sunucuda). */
export async function reopenSupportTicketAction(
  ticketNumber: string,
): Promise<SupportTicketActionState> {
  const result = await reopenSupportTicket(ticketNumber);
  if (!result.ok) return { status: "error", code: result.code, httpStatus: result.status };
  revalidatePath(`/account/support/${encodeURIComponent(ticketNumber)}`);
  revalidatePath("/account/support");
  return { status: "success" };
}

/** Destek eki yükleme (client PhotoUpload → { mediaId }). Boş/geçersiz → { ok:false }. */
export type UploadSupportAttachmentState = { ok: true; mediaId: string } | { ok: false };

export async function uploadSupportAttachmentAction(
  formData: FormData,
): Promise<UploadSupportAttachmentState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false };
  const result = await uploadSupportAttachment(file);
  return result.ok ? { ok: true, mediaId: result.data.mediaId } : { ok: false };
}
