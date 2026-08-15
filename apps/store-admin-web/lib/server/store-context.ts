import type { NextRequest, NextResponse } from "next/server";
import { createApiClient, type StoreAdminSessionResponse } from "@commerce-os/api-client";
import { getSessionToken } from "./session";
import { errorResponse, noStoreResponse, unauthorizedResponse } from "./respond";

/**
 * store-admin-web'in üzerinde çalıştığı mağaza bağlamı (Faz E1 cutover).
 *
 * SOURCE OF TRUTH: aktif mağaza, GERÇEK StoreUser oturumunun bağlı olduğu mağazadır
 * (`/auth/store/session` → `store`). BFF artık mağaza LİSTELEMEZ ve demo/ilk mağazayı
 * SEÇMEZ: her istek, oturum token'ıyla server-otoriter mağaza bağlamını çözer. Böylece
 * `STORE_ADMIN_DEMO_STORE_SLUG`, `admin.stores.list` ve "ilk mağaza" fallback'i KALDIRILDI.
 * Tenant istemci tarafından seçilemez; mağaza kimliği tamamen sunucuda kalır.
 */
export interface StoreContext {
  id: string;
  name: string;
  slug: string;
  status: StoreAdminSessionResponse["store"]["status"];
}

function toContext(store: StoreAdminSessionResponse["store"]): StoreContext {
  return { id: store.id, name: store.name, slug: store.slug, status: store.status };
}

/**
 * Verilen StoreUser oturum token'ı ile oturumun bağlı olduğu mağazayı çözer.
 * Token geçersiz/iptal/süresi-dolmuş ise gateway 401 fırlatır (çağıran yakalar).
 */
export async function resolveStoreContext(token: string): Promise<StoreContext | null> {
  const result = await createApiClient().storeAuth.session(token);
  return toContext(result.store);
}

export type RequireStoreResult =
  | { ok: true; token: string; store: StoreContext }
  | { ok: false; response: NextResponse };

/**
 * Catalog/inventory vb. proxy route'ları için tek giriş: oturum token'ı + oturumun
 * bağlı olduğu mağaza bağlamını çözer. Hata durumunda doğrudan döndürülecek
 * NextResponse verir (401 → oturum yok/geçersiz; noStore → beklenmedik boş bağlam).
 */
export async function requireStoreContext(request: NextRequest): Promise<RequireStoreResult> {
  const token = getSessionToken(request);
  if (!token) {
    return { ok: false, response: unauthorizedResponse() };
  }
  let store: StoreContext | null;
  try {
    store = await resolveStoreContext(token);
  } catch (error) {
    return { ok: false, response: errorResponse(error) };
  }
  if (!store) {
    return { ok: false, response: noStoreResponse() };
  }
  return { ok: true, token, store };
}
