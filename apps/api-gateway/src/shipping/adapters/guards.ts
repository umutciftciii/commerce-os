import { ShippingConfigError } from "../errors.js";
import type { ShippingActionContext } from "../types.js";

/**
 * F3C.1 — Destructive/costly operasyon guard'lari.
 *
 * Canli createOrder / createbarcode / label-purchase ancak SU UCLU saglaninca calisir:
 *   1) ilgili env flag true (DHL_ECOMMERCE_ALLOW_ORDER_CREATE / _BARCODE_CREATE /
 *      GELIVER_ALLOW_LABEL_PURCHASE)  ──┐
 *   2) providerConfig.allow* true       ├─ ikisi route'ta birlestirilip ctx.guards.* olur
 *   3) request.explicitConfirm === true ──┘
 * Aksi halde kontrollu 409 hatasi firlatilir (ic detay sizdirmadan).
 */

export function assertRecipientCreateAllowed(
  ctx: ShippingActionContext,
  explicitConfirm: boolean | undefined,
): void {
  if (!(ctx.guards.allowRecipientCreate && explicitConfirm === true)) {
    throw new ShippingConfigError(
      "RECIPIENT_CREATE_DISABLED",
      "Canli alici (Plus Command/createRecipient) olusturma kapalı. Etkinleştirmek için provider izni + ortam bayrağı + explicitConfirm gerekir.",
    );
  }
}

export function assertOrderCreateAllowed(
  ctx: ShippingActionContext,
  explicitConfirm: boolean | undefined,
): void {
  if (!(ctx.guards.allowOrderCreate && explicitConfirm === true)) {
    throw new ShippingConfigError(
      "ORDER_CREATE_DISABLED",
      "Canli sipariş oluşturma kapalı. Etkinleştirmek için provider izni + ortam bayrağı + explicitConfirm gerekir.",
    );
  }
}

export function assertBarcodeCreateAllowed(
  ctx: ShippingActionContext,
  explicitConfirm: boolean | undefined,
): void {
  if (!(ctx.guards.allowBarcodeCreate && explicitConfirm === true)) {
    throw new ShippingConfigError(
      "BARCODE_CREATE_DISABLED",
      "Canli barkod/gönderi oluşturma kapalı. Etkinleştirmek için provider izni + ortam bayrağı + explicitConfirm gerekir.",
    );
  }
}

export function assertLabelPurchaseAllowed(
  ctx: ShippingActionContext,
  explicitConfirm: boolean | undefined,
): void {
  if (!(ctx.guards.allowLabelPurchase && explicitConfirm === true)) {
    throw new ShippingConfigError(
      "LABEL_PURCHASE_DISABLED",
      "Canli etiket satın alma kapalı. Etkinleştirmek için provider izni + ortam bayrağı + explicitConfirm gerekir.",
    );
  }
}

/**
 * F3C.3 (ADR-045): canli DHL kargo iptali (cancelshipment) guard'i. Order-create ile ayni
 * operasyonel guven seviyesi gerekir: env DHL_ECOMMERCE_ALLOW_CANCEL && providerConfig
 * (allowOrderCreate kapisi route'ta ctx.guards.allowCancel'e birlesir) && explicitConfirm.
 */
export function assertCancelAllowed(
  ctx: ShippingActionContext,
  explicitConfirm: boolean | undefined,
): void {
  if (!(ctx.guards.allowCancel && explicitConfirm === true)) {
    throw new ShippingConfigError(
      "CANCEL_DISABLED",
      "Canli kargo iptali kapalı. Etkinleştirmek için provider izni + ortam bayrağı + explicitConfirm gerekir.",
    );
  }
}
