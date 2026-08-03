"use server";

import { revalidatePath } from "next/cache";
import type { CustomerReturnCreateRequest } from "@commerce-os/contracts";
import {
  cancelReturn,
  createReturn,
  submitReturnTracking,
  uploadReturnAttachment,
} from "./returns";

/**
 * TODO-169 (ADR-269) — Vitrin iade Server Action'ları ("use server").
 *
 * İstemci sihirbazı/detay ekranı yalnız bu tipli aksiyonları çağırır; auth (cookie
 * jetonu) ve uygunluk/tutar kararı SUNUCUDADIR. Aksiyonlar hata zarfını sade,
 * serileştirilebilir duruma indirger (kod string'i UI'da mesaja eşlenir; PII/secret
 * taşımaz). Başarıda ilgili yolları revalidate eder.
 */

/** İade fotoğrafı yükleme (client PhotoUpload → { mediaId }). */
export type UploadAttachmentState = { ok: true; mediaId: string } | { ok: false };

export async function uploadAttachmentAction(formData: FormData): Promise<UploadAttachmentState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false };
  const result = await uploadReturnAttachment(file);
  return result.ok ? { ok: true, mediaId: result.data.mediaId } : { ok: false };
}

/** İade talebi oluşturma. Başarıda referans (returnNumber) döner → istemci detaya yönlendirir. */
export type CreateReturnState =
  | { status: "idle" }
  | { status: "success"; returnNumber: string }
  | { status: "error"; code: string | null; httpStatus: number };

export async function createReturnAction(
  body: CustomerReturnCreateRequest,
): Promise<CreateReturnState> {
  const result = await createReturn(body);
  if (!result.ok) {
    return { status: "error", code: result.code, httpStatus: result.status };
  }
  revalidatePath("/account/returns");
  revalidatePath(`/account/orders/${encodeURIComponent(body.orderNumber)}`);
  return { status: "success", returnNumber: result.data.return.returnNumber };
}

/** İade kargo takip no gönderimi (AWAITING_SHIPMENT → RETURN_SHIPPED). */
export type ReturnActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string | null; httpStatus: number };

export async function submitTrackingAction(
  returnNumber: string,
  carrier: string,
  trackingNumber: string,
): Promise<ReturnActionState> {
  const result = await submitReturnTracking(returnNumber, {
    carrier: carrier.trim(),
    trackingNumber: trackingNumber.trim(),
  });
  if (!result.ok) return { status: "error", code: result.code, httpStatus: result.status };
  revalidatePath(`/account/returns/${encodeURIComponent(returnNumber)}`);
  revalidatePath("/account/returns");
  return { status: "success" };
}

/** İade talebini iptal et (yalnız onay öncesi; server state-machine karar verir). */
export async function cancelReturnAction(returnNumber: string): Promise<ReturnActionState> {
  const result = await cancelReturn(returnNumber);
  if (!result.ok) return { status: "error", code: result.code, httpStatus: result.status };
  revalidatePath(`/account/returns/${encodeURIComponent(returnNumber)}`);
  revalidatePath("/account/returns");
  return { status: "success" };
}
