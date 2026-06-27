"use server";

/**
 * F3B.3 — Hesabim mutasyon Server Action'lari (profil, sifre, iletisim tercihi,
 * adres defteri, IBAN). Hepsi oturum jetonunu cookie'den okur ve gateway'in
 * `x-customer-session` korumali uclarina iletir; ownership/store-scope gateway'de
 * zorunludur. PII (TCKN/VKN/IBAN) gateway'de maskelenir; burada loglanmaz.
 */
import { revalidatePath } from "next/cache";
import type {
  CustomerAddressInput,
  CustomerCommunicationPreference,
  CustomerProfileUpdateRequest,
} from "@commerce-os/api-client";
import { sendCustomer } from "./gateway";
import { customerBasePath } from "./customer";
import { readCustomerToken } from "./customer-cookie";

export type AccountActionResult = { ok: true } | { ok: false; code: string };

async function mutate(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<AccountActionResult> {
  const token = await readCustomerToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<unknown>(method, path, token, body);
  if (!result.ok) return { ok: false, code: result.code ?? "ACCOUNT_ACTION_FAILED" };
  revalidatePath("/account");
  return { ok: true };
}

export async function updateProfileAction(
  input: CustomerProfileUpdateRequest,
): Promise<AccountActionResult> {
  return mutate("PUT", `${customerBasePath()}/profile`, input);
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<AccountActionResult> {
  return mutate("PUT", `${customerBasePath()}/password`, input);
}

export async function updateCommunicationPreferencesAction(
  input: CustomerCommunicationPreference,
): Promise<AccountActionResult> {
  return mutate("PUT", `${customerBasePath()}/communication-preferences`, input);
}

export async function createAddressAction(
  input: CustomerAddressInput,
): Promise<AccountActionResult> {
  return mutate("POST", `${customerBasePath()}/addresses`, input);
}

export async function updateAddressAction(
  id: string,
  input: CustomerAddressInput,
): Promise<AccountActionResult> {
  return mutate("PUT", `${customerBasePath()}/addresses/${encodeURIComponent(id)}`, input);
}

export async function deleteAddressAction(id: string): Promise<AccountActionResult> {
  return mutate("DELETE", `${customerBasePath()}/addresses/${encodeURIComponent(id)}`);
}

export async function setDefaultAddressAction(id: string): Promise<AccountActionResult> {
  return mutate("POST", `${customerBasePath()}/addresses/${encodeURIComponent(id)}/default`);
}

export async function createIbanAction(input: {
  accountHolderName: string;
  iban: string;
  isDefault?: boolean;
}): Promise<AccountActionResult> {
  return mutate("POST", `${customerBasePath()}/ibans`, input);
}

export async function deleteIbanAction(id: string): Promise<AccountActionResult> {
  return mutate("DELETE", `${customerBasePath()}/ibans/${encodeURIComponent(id)}`);
}

export async function setDefaultIbanAction(id: string): Promise<AccountActionResult> {
  return mutate("POST", `${customerBasePath()}/ibans/${encodeURIComponent(id)}/default`);
}
