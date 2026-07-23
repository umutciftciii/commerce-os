"use server";

/**
 * F3B.3 — Musteri kimlik dogrulama Server Action'lari (kayit 3 adim + giris/cikis).
 * Oturum cookie mutasyonu YALNIZCA burada yapilir. Gateway musteri uclari
 * `x-customer-session` ile cagrilir; jeton/sifre/OTP loglanmaz. Hatalar kullaniciya
 * jenerik/guvenli kod olarak doner (enumeration yaratmaz).
 */
import { revalidatePath } from "next/cache";
import type {
  CustomerOtpChallengeResponse,
  CustomerSessionResponse,
} from "@commerce-os/api-client";
import { postPublic, sendCustomer } from "./gateway";
import { customerBasePath } from "./customer";
import { clearCustomerToken, readCustomerToken, writeCustomerToken } from "./customer-cookie";
import { mergeGuestWishlistAction } from "./wishlist-actions";

export type AuthActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; code: string };

/** Kayit adim 1: identifier (email|GSM) gonder, OTP iste. */
export async function registerStartAction(
  identifier: string,
): Promise<AuthActionResult<{ channel: "EMAIL" | "SMS"; maskedDestination: string }>> {
  const result = await sendCustomer<CustomerOtpChallengeResponse>(
    "POST",
    `${customerBasePath()}/register/start`,
    null,
    { identifier },
  );
  if (!result.ok) {
    return { ok: false, code: result.code ?? "REGISTER_START_FAILED" };
  }
  return {
    ok: true,
    data: { channel: result.data.channel, maskedDestination: result.data.maskedDestination },
  };
}

/** Kayit adim 2: OTP dogrula (hesap henuz tamamlanmaz). */
export async function registerVerifyAction(
  identifier: string,
  code: string,
): Promise<AuthActionResult> {
  const result = await sendCustomer<{ verified: true }>(
    "POST",
    `${customerBasePath()}/register/verify`,
    null,
    { identifier, code },
  );
  if (!result.ok) {
    return { ok: false, code: result.code ?? "INVALID_OTP" };
  }
  return { ok: true };
}

/** Kayit adim 3: profil + sifre + onaylar -> hesap olustur ve oturum ac. */
export async function registerCompleteAction(input: {
  identifier: string;
  code: string;
  firstName: string;
  lastName: string;
  password: string;
  kvkkConsent: boolean;
  clarificationConsent: boolean;
}): Promise<AuthActionResult> {
  const result = await sendCustomer<CustomerSessionResponse>(
    "POST",
    `${customerBasePath()}/register/complete`,
    null,
    input,
  );
  if (!result.ok) {
    return { ok: false, code: result.code ?? "REGISTER_FAILED" };
  }
  await writeCustomerToken(result.data.token);
  // TODO-159D (ADR-093) — Misafir favorilerini yeni hesabın wishlist'ine idempotent merge et.
  await mergeGuestWishlistAction();
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Giris: email|GSM + sifre -> oturum. */
export async function loginAction(
  identifier: string,
  password: string,
): Promise<AuthActionResult> {
  const result = await sendCustomer<CustomerSessionResponse>(
    "POST",
    `${customerBasePath()}/login`,
    null,
    { identifier, password },
  );
  if (!result.ok) {
    return { ok: false, code: result.code ?? "INVALID_CREDENTIALS" };
  }
  await writeCustomerToken(result.data.token);
  // TODO-159D (ADR-093) — Giriş sonrası misafir favorilerini müşterinin wishlist'ine merge et.
  await mergeGuestWishlistAction();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Aktivasyon / parola belirleme (TODO-087). Admin tetikli ADMIN_ACTIVATION veya
 * ADMIN_PASSWORD_RESET token'i ile parola belirler. Oturum AÇMAZ; başarı sonrası
 * UI giriş sayfasına yönlendirir (güvenli/sade akış). Token tek seferlik; geçersiz/
 * süresi geçmiş/tüketilmiş ise gateway jenerik INVALID_TOKEN döner.
 */
export async function activateAction(token: string, password: string): Promise<AuthActionResult> {
  const result = await postPublic<{ activated: boolean }>(`${customerBasePath()}/activate`, {
    token,
    password,
  });
  if (!result.ok) {
    return { ok: false, code: result.code ?? "INVALID_TOKEN" };
  }
  return { ok: true };
}

/** Cikis: gateway oturumu iptal eder, cookie temizlenir, header durumu tazelenir. */
export async function logoutAction(): Promise<void> {
  const token = await readCustomerToken();
  if (token) {
    await sendCustomer<{ revoked: boolean }>("POST", `${customerBasePath()}/logout`, token);
  }
  await clearCustomerToken();
  revalidatePath("/", "layout");
}
