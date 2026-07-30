import { cache } from "react";
import { cookies } from "next/headers";
import { createApiClient, type StoreModulesResponse } from "@commerce-os/api-client";
import { SESSION_COOKIE_NAME } from "./session";
import { resolveStoreContext } from "./store-context";

/**
 * TODO-163 (ADR-208…ADR-214 · Faz 3) — Sunucu-tarafı capability erişimi (store-admin sayfa guard'ı).
 *
 * Seçili mağazanın effective modül matrisini SUNUCUDA çözer (httpOnly session cookie → token →
 * store context → gateway `admin.modules.list`). `cache()`'li → aynı render-pass'te birden çok
 * guard tek gateway çağrısı yapar (N+1 yok). Effective durum + source SUNUCUDA türetilir; istemci
 * override state DIŞINDA yetki gönderemez.
 *
 * Bu, kenar menü gizlemesine (client `StoreNav`) EK sunucu-tarafı savunmadır: kapalı modül
 * sayfasına DOĞRUDAN URL ile gidilse bile veri çekilmeden temiz "MODULE_DISABLED" görünümü döner.
 * NİHAİ enforcement yine gateway'dedir (kapalı modül BFF'te 403/404 verir) — bu guard bypass'ı
 * imkânsız kılan katman değil, bypass'ı ANLAMSIZ kılan (render yok + veri yok) katmandır.
 */
export const getStoreModuleMatrix = cache(
  async (): Promise<StoreModulesResponse["data"] | null> => {
    try {
      const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
      if (!token) return null;
      const store = await resolveStoreContext(token);
      if (!store) return null;
      const res = await createApiClient().admin.modules.list(store.id, token);
      return res.data;
    } catch {
      // Geçici hata (gateway/oturum) → null. Guard fail-open davranır (aşağıda): sayfa render
      // edilir ama veri çağrıları gateway'de yine 403/404 alır → modül fiilen kullanılamaz.
      return null;
    }
  },
);

/**
 * Verilen modül store için effective AÇIK mı? Bilinmeyen anahtar veya matris çözülemedi →
 * `true` (fail-open; gateway otoriter). Böylece geçici bir matris hatası MEVCUT davranışı
 * (gateway enforcement) bozmaz — regresyonsuz.
 */
export async function isStoreModuleEnabled(moduleKey: string): Promise<boolean> {
  const data = await getStoreModuleMatrix();
  if (!data) return true; // fail-open; gateway BFF hâlâ enforce eder
  const entry = data.modules.find((m) => m.key === moduleKey);
  if (!entry) return true; // eşlemesiz/bilinmeyen anahtar → göster
  return entry.effectiveEnabled;
}
