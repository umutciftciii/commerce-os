/**
 * F3B.3 — Vitrin musteri hesabi okuma katmani (sunucu-yalniz). Gateway'in musteri
 * uclarini `x-customer-session` ile cagirir (bkz. gateway.ts). Mutasyonlar (kayit/
 * giris/cikis/profil/adres/iban) Server Action dosyalarindadir; bu modul okuma
 * yardimcilarini ve ortak path/tip koprusunu saglar. PII (TCKN/VKN/IBAN) gateway
 * tarafinda zaten maskelenmis doner.
 */
import type {
  CustomerAccount,
  CustomerAddress,
  CustomerCommunicationPreference,
  CustomerIban,
  CustomerOrderDetail,
  CustomerOrderSummary,
} from "@commerce-os/api-client";
import { demoStoreSlug } from "./env";
import { getCustomer } from "./gateway";
import { readCustomerToken } from "./customer-cookie";

/** Musteri uclari taban yolu (store slug sunucuda cozulur; istemciden alinmaz). */
export function customerBasePath(): string {
  return `/public/stores/${encodeURIComponent(demoStoreSlug())}/customer`;
}

/** Oturum acmis musteriyi dondurur; oturum yok/gecersizse null. */
export async function getCurrentCustomer(): Promise<CustomerAccount | null> {
  const token = await readCustomerToken();
  if (!token) return null;
  const result = await getCustomer<{ customer: CustomerAccount; session: { expiresAt: string } }>(
    `${customerBasePath()}/me`,
    token,
  );
  return result.ok ? result.data.customer : null;
}

export async function listCustomerAddresses(): Promise<CustomerAddress[]> {
  const token = await readCustomerToken();
  if (!token) return [];
  const result = await getCustomer<{ data: CustomerAddress[] }>(
    `${customerBasePath()}/addresses`,
    token,
  );
  return result.ok ? result.data.data : [];
}

export async function listCustomerIbans(): Promise<CustomerIban[]> {
  const token = await readCustomerToken();
  if (!token) return [];
  const result = await getCustomer<{ data: CustomerIban[] }>(`${customerBasePath()}/ibans`, token);
  return result.ok ? result.data.data : [];
}

export async function getCustomerCommunicationPreferences(): Promise<CustomerCommunicationPreference> {
  const token = await readCustomerToken();
  const fallback: CustomerCommunicationPreference = {
    smsEnabled: false,
    emailEnabled: true,
    phoneEnabled: false,
  };
  if (!token) return fallback;
  const result = await getCustomer<CustomerCommunicationPreference>(
    `${customerBasePath()}/communication-preferences`,
    token,
  );
  return result.ok ? result.data : fallback;
}

export async function listCustomerOrders(): Promise<CustomerOrderSummary[]> {
  const token = await readCustomerToken();
  if (!token) return [];
  const result = await getCustomer<{ data: CustomerOrderSummary[] }>(
    `${customerBasePath()}/orders`,
    token,
  );
  return result.ok ? result.data.data : [];
}

/**
 * TODO-079 — Tek sipariş detayı (yalnız kendi siparişi). Başka müşterinin
 * siparişi veya yoksa gateway 404 döner → burada null. Çağıran (detail route)
 * null'da notFound() ile 404 sayfası gösterir.
 */
export async function getCustomerOrderDetail(
  orderNumber: string,
): Promise<CustomerOrderDetail | null> {
  const token = await readCustomerToken();
  if (!token) return null;
  const result = await getCustomer<{ order: CustomerOrderDetail }>(
    `${customerBasePath()}/orders/${encodeURIComponent(orderNumber)}`,
    token,
  );
  return result.ok ? result.data.order : null;
}
