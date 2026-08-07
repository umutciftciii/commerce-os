"use server";

import { revalidatePath } from "next/cache";
import type {
  CancellationRefundStatus,
  CustomerOrderCancelRequest,
} from "@commerce-os/contracts";
import { cancelOrder } from "./cancellations";

/**
 * TODO-174 (ADR-275/277/278) — Vitrin sipariş iptal Server Action'ı ("use server").
 *
 * İstemci modalı yalnız bu tipli aksiyonu çağırır; auth (cookie jetonu) ve uygunluk/
 * tutar kararı SUNUCUDADIR. İstemci refund tutarı GÖNDERMEZ (yalnız reasonCode/
 * reasonNote/expectedVersion). Aksiyon hata zarfını sade, serileştirilebilir duruma
 * indirger (kod string'i UI'da mesaja eşlenir). Başarıda refundStatus AYRI taşınır —
 * yanıltıcı "iade tamamlandı" gösterilmez (refundStatus otoritedir). Başarıda sipariş
 * detayı + siparişler listesi revalidate edilir.
 */
export type CancelOrderState =
  | { status: "idle" }
  | {
      status: "success";
      isPaid: boolean;
      // İptal refund'unun MASKELİ yürütme durumu (null = özet fail-open; modal nötr gösterir).
      refundStatus: CancellationRefundStatus | null;
    }
  | { status: "error"; code: string | null; httpStatus: number };

export async function cancelOrderAction(
  orderNumber: string,
  body: CustomerOrderCancelRequest,
): Promise<CancelOrderState> {
  const result = await cancelOrder(orderNumber, body);
  if (!result.ok) {
    return { status: "error", code: result.code, httpStatus: result.status };
  }
  revalidatePath(`/account/orders/${encodeURIComponent(orderNumber)}`);
  revalidatePath("/account");
  // İptal başarılı; refund AYRI durum. `cancellation` fail-open ile null olabilir →
  // sipariş cancellationSummary'sinden geri düş (aynı server-otoriter kaynak).
  const summary = result.data.cancellation ?? result.data.order.cancellationSummary;
  return {
    status: "success",
    isPaid: summary?.isPaid ?? false,
    refundStatus: summary?.refundStatus ?? null,
  };
}
