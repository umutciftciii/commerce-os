/**
 * F3C.1 Shipping provider foundation — kontrollu hata tipi.
 *
 * Route katmani bunu guvenli, lokalize HTTP yanitlarina esler (ic detay/secret
 * sizdirmaz). `code` makine-okunur (ornegin CONFIG_MISSING, CONFIG_INCOMPLETE,
 * ORDER_CREATE_DISABLED, BARCODE_CREATE_DISABLED, LABEL_PURCHASE_DISABLED).
 */
export class ShippingConfigError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "ShippingConfigError";
  }
}
