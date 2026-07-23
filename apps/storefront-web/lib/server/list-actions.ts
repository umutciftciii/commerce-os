"use server";

/**
 * TODO-159D (ADR-093) — Alışveriş listesi mutasyon Server Action'ları.
 *
 * Hepsi oturum jetonunu cookie'den okur ve gateway'in `x-customer-session` korumalı
 * `/customer/lists*` uçlarına iletir; ownership/store-scope/limit gateway'de zorlanır.
 * Sepete ekleme cookie-tabanlı olduğundan gateway yalnız CANLI otoriteyle aday/atlanan
 * hesaplar; gerçek sepet yazımı burada yapılır (fiyat/stok istemciden gelmez).
 */
import { revalidatePath } from "next/cache";
import type {
  CustomerListAddItemRequest,
  CustomerListAddItemResponse,
  CustomerListBatchAddToCartResponse,
  CustomerListMutationResponse,
} from "@commerce-os/api-client";
import { sendCustomer } from "./gateway";
import { customerBasePath } from "./customer";
import { readCustomerToken } from "./customer-cookie";
import { readCartItems, writeCartItems } from "./cart-cookie";
import { addItem } from "../cart-token";

export type ListActionResult = { ok: true } | { ok: false; code: string };

async function requireToken(): Promise<string | null> {
  return readCustomerToken();
}

function revalidateLists(): void {
  revalidatePath("/account");
  revalidatePath("/account/lists", "layout");
}

export async function createListAction(
  name: string,
): Promise<{ ok: true; listId: string } | { ok: false; code: string }> {
  const token = await requireToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<CustomerListMutationResponse>(
    "POST",
    `${customerBasePath()}/lists`,
    token,
    { name },
  );
  if (!result.ok) return { ok: false, code: result.code ?? "LIST_CREATE_FAILED" };
  revalidateLists();
  return { ok: true, listId: result.data.data.id };
}

export async function renameListAction(listId: string, name: string): Promise<ListActionResult> {
  const token = await requireToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<unknown>(
    "PATCH",
    `${customerBasePath()}/lists/${encodeURIComponent(listId)}`,
    token,
    { name },
  );
  if (!result.ok) return { ok: false, code: result.code ?? "LIST_RENAME_FAILED" };
  revalidateLists();
  return { ok: true };
}

export async function deleteListAction(listId: string): Promise<ListActionResult> {
  const token = await requireToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<unknown>(
    "DELETE",
    `${customerBasePath()}/lists/${encodeURIComponent(listId)}`,
    token,
  );
  if (!result.ok) return { ok: false, code: result.code ?? "LIST_DELETE_FAILED" };
  revalidateLists();
  return { ok: true };
}

export async function addListItemAction(
  listId: string,
  input: CustomerListAddItemRequest,
): Promise<{ ok: true; alreadyExisted: boolean } | { ok: false; code: string }> {
  const token = await requireToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<CustomerListAddItemResponse>(
    "POST",
    `${customerBasePath()}/lists/${encodeURIComponent(listId)}/items`,
    token,
    input,
  );
  if (!result.ok) return { ok: false, code: result.code ?? "LIST_ADD_ITEM_FAILED" };
  revalidateLists();
  return { ok: true, alreadyExisted: result.data.data.alreadyExisted };
}

export async function removeListItemAction(
  listId: string,
  itemId: string,
): Promise<ListActionResult> {
  const token = await requireToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<unknown>(
    "DELETE",
    `${customerBasePath()}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
    token,
  );
  if (!result.ok) return { ok: false, code: result.code ?? "LIST_REMOVE_ITEM_FAILED" };
  revalidateLists();
  return { ok: true };
}

export async function moveListItemAction(
  listId: string,
  itemId: string,
  targetListId: string,
): Promise<ListActionResult> {
  const token = await requireToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<unknown>(
    "POST",
    `${customerBasePath()}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/move`,
    token,
    { targetListId },
  );
  if (!result.ok) return { ok: false, code: result.code ?? "LIST_MOVE_ITEM_FAILED" };
  revalidateLists();
  return { ok: true };
}

export async function copyListItemAction(
  listId: string,
  itemId: string,
  targetListId: string,
): Promise<ListActionResult> {
  const token = await requireToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<unknown>(
    "POST",
    `${customerBasePath()}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/copy`,
    token,
    { targetListId },
  );
  if (!result.ok) return { ok: false, code: result.code ?? "LIST_COPY_ITEM_FAILED" };
  revalidateLists();
  return { ok: true };
}

export interface BatchAddToCartSummary {
  ok: boolean;
  code?: string;
  added: number;
  skipped: Array<{ productTitle: string; reason: "OUT_OF_STOCK" | "UNAVAILABLE" }>;
}

/**
 * Listedeki (veya verilen) öğeleri sepete ekler. Gateway CANLI otoriteyle aday/atlanan
 * hesaplar; adaylar sepet cookie'sine yazılır (stokta olmayan/pasif ATLANIR + özet döner).
 */
export async function batchAddListToCartAction(
  listId: string,
  itemIds?: string[],
): Promise<BatchAddToCartSummary> {
  const token = await requireToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED", added: 0, skipped: [] };
  const result = await sendCustomer<CustomerListBatchAddToCartResponse>(
    "POST",
    `${customerBasePath()}/lists/${encodeURIComponent(listId)}/add-to-cart`,
    token,
    itemIds && itemIds.length > 0 ? { itemIds } : {},
  );
  if (!result.ok) {
    return { ok: false, code: result.code ?? "LIST_ADD_TO_CART_FAILED", added: 0, skipped: [] };
  }
  const { candidates, skipped } = result.data.data;
  if (candidates.length > 0) {
    let items = await readCartItems();
    for (const candidate of candidates) {
      items = addItem(items, candidate.variantId, candidate.quantity);
    }
    await writeCartItems(items);
    revalidatePath("/", "layout");
    revalidatePath("/cart");
  }
  return {
    ok: true,
    added: candidates.length,
    skipped: skipped.map((s) => ({ productTitle: s.productTitle, reason: s.reason as "OUT_OF_STOCK" | "UNAVAILABLE" })),
  };
}

/** Tekli sepete ekle (liste/detay ekranından; canlı otorite sepet çözümlemede uygulanır). */
export async function addVariantToCartAction(
  variantId: string,
  quantity = 1,
): Promise<ListActionResult> {
  const trimmed = variantId.trim();
  if (!trimmed) return { ok: false, code: "INVALID_VARIANT" };
  let items = await readCartItems();
  items = addItem(items, trimmed, Math.max(1, quantity));
  await writeCartItems(items);
  revalidatePath("/", "layout");
  revalidatePath("/cart");
  return { ok: true };
}
