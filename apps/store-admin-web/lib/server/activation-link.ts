import type { StoreAdminCredentialSetup } from "@commerce-os/api-client";

/**
 * TODO-087 — Admin tetikli aktivasyon/parola-sifirlama kurulum jetonunu, müşteriye
 * verilecek TEK SEFERLİK linke çevirir. Raw token gateway'den yalnız bu yanıtla
 * gelir ve admin UI'da bir kez gösterilir; DB/log/event'e yazılmaz. STOREFRONT_BASE_URL
 * (yalnız sunucu env'i) tanımlıysa tam URL, değilse göreli yol döner.
 */
export interface ActivationLink {
  link: string;
  purpose: StoreAdminCredentialSetup["purpose"];
  expiresAt: string;
}

export function buildActivationLink(setup: StoreAdminCredentialSetup): ActivationLink {
  const base = (process.env.STOREFRONT_BASE_URL ?? "").replace(/\/+$/, "");
  const path = `/auth/activate?token=${encodeURIComponent(setup.token)}`;
  return { link: base ? `${base}${path}` : path, purpose: setup.purpose, expiresAt: setup.expiresAt };
}
