/**
 * Form alani erisilebilirlik baglama cekirdegi (C1) — saf, hook'suz, RSC-guvenli.
 *
 * Bir kontrolun id'sinden yardim/hata metni id'lerini turetir ve kontrole
 * baglanacak `aria-invalid` / `aria-describedby` / `aria-required` niteliklerini
 * dondurur. Ekran okuyucu, alana odaklaninca hata/yardim metnini birlikte okur.
 *
 * Hata ve yardim metni birbirini dislar (hata oncelikli); ikisi de gerektiginde
 * describedby'a bosluklu id listesi verilebilir.
 */

export interface FieldAriaAttributes {
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
}

export interface FieldAriaResult {
  control: FieldAriaAttributes;
  errorId?: string;
  hintId?: string;
}

export function fieldAria(
  id: string | undefined,
  opts: { error?: string | null; hint?: string | null; required?: boolean } = {},
): FieldAriaResult {
  const hasError = Boolean(opts.error);
  const hasHint = Boolean(opts.hint) && !hasError;
  const errorId = hasError && id ? `${id}-error` : undefined;
  const hintId = hasHint && id ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return {
    control: {
      "aria-invalid": hasError ? true : undefined,
      "aria-describedby": describedBy,
      "aria-required": opts.required ? true : undefined,
    },
    errorId,
    hintId,
  };
}
