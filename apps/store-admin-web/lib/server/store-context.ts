import type { NextRequest, NextResponse } from "next/server";
import { createApiClient, type AdminStore } from "@commerce-os/api-client";
import { getSessionToken } from "./session";
import { errorResponse, noStoreResponse, unauthorizedResponse } from "./respond";

/**
 * store-admin-web'in uzerinde calistigi mağaza bağlami. Demo asamasinda store-user
 * auth henuz tam olmadigindan, BFF session token'i (platform admin) ile mağaza
 * listesi cekilir ve hedef mağaza server-side secilir. `storeId` istemciye
 * gonderilen bir sir degildir; ancak secim ve token tamamen server tarafinda
 * kalir (bkz. docs/DECISIONS.md — gecici BFF/store context karari).
 */
export interface StoreContext {
  id: string;
  name: string;
  slug: string;
  status: AdminStore["status"];
}

/** Demo/hedef mağaza secimi: once slug eslesmesi, yoksa listenin ilk mağazasi. */
const DEMO_STORE_SLUG = process.env.STORE_ADMIN_DEMO_STORE_SLUG ?? "demo-store";

function toContext(store: AdminStore): StoreContext {
  return { id: store.id, name: store.name, slug: store.slug, status: store.status };
}

/**
 * Verilen token ile gateway'den mağaza listesini cekip hedef mağazayi secer.
 * Mağaza yoksa null doner.
 */
export async function resolveStoreContext(token: string): Promise<StoreContext | null> {
  const result = await createApiClient().admin.stores.list(token);
  const stores = result.data;
  if (stores.length === 0) {
    return null;
  }
  const preferred = stores.find((store) => store.slug === DEMO_STORE_SLUG);
  return toContext(preferred ?? stores[0]);
}

export type RequireStoreResult =
  | { ok: true; token: string; store: StoreContext }
  | { ok: false; response: NextResponse };

/**
 * Catalog/inventory proxy route'lari icin tek giris: oturum token'i + secili
 * mağaza bağlamini cozer. Hata durumunda dogrudan dondurulecek NextResponse verir.
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
