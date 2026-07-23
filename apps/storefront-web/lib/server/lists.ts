/**
 * TODO-159D (ADR-093) — Vitrin müşteri listeleri okuma katmanı (sunucu-yalnız).
 *
 * Gateway'in müşteri-scoped `/customer/lists*` uçlarını `x-customer-session` ile çağırır.
 * Öğe hidrasyonu (fiyat/stok/görsel) gateway'de CANLI otoriteden yapılır; bu modül yalnız
 * okur. Oturum yoksa boş sonuç döner (favorites/lists ekranları oturum guard'lıdır).
 */
import type {
  AdminListPagination,
  CustomerListDetail,
  CustomerListDetailResponse,
  CustomerListListResponse,
  CustomerListSummary,
} from "@commerce-os/api-client";
import { customerBasePath } from "./customer";
import { getCustomer } from "./gateway";
import { readCustomerToken } from "./customer-cookie";

/** Müşterinin tüm listeleri (varsayılan wishlist dahil; gateway lazy-create eder). */
export async function getCustomerLists(): Promise<CustomerListSummary[]> {
  const token = await readCustomerToken();
  if (!token) return [];
  const result = await getCustomer<CustomerListListResponse>(
    `${customerBasePath()}/lists`,
    token,
  );
  return result.ok ? result.data.data : [];
}

/** Varsayılan wishlist özeti (favorites ekranı için kısa yol). */
export async function getDefaultWishlist(): Promise<CustomerListSummary | null> {
  const lists = await getCustomerLists();
  return lists.find((list) => list.isDefault && list.type === "WISHLIST") ?? null;
}

export interface CustomerListDetailView {
  detail: CustomerListDetail;
  pagination: AdminListPagination;
}

/** Liste detayı (sayfalı hidrate öğeler). Bulunamaz/oturum yok → null. */
export async function getCustomerListDetail(
  listId: string,
  query: { page?: number; pageSize?: number } = {},
): Promise<CustomerListDetailView | null> {
  const token = await readCustomerToken();
  if (!token) return null;
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const qs = params.toString();
  const result = await getCustomer<CustomerListDetailResponse>(
    `${customerBasePath()}/lists/${encodeURIComponent(listId)}${qs ? `?${qs}` : ""}`,
    token,
  );
  if (!result.ok) return null;
  return { detail: result.data.data, pagination: result.data.pagination };
}
