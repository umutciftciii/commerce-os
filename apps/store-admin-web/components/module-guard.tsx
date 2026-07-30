import type { ReactNode } from "react";
import { EmptyState, PageHeader } from "./ui";
import { isStoreModuleEnabled } from "../lib/server/module-access";

/**
 * TODO-163 (ADR-208…ADR-214 · Faz 3) — Store-admin sunucu-tarafı sayfa guard'ı.
 *
 * Korumalı bir modül rotasının `layout.tsx`'inden sarmalayıcı olarak kullanılır. Modül effective
 * KAPALIysa `children` (sayfanın client bileşeni + onun BFF veri çağrıları) HİÇ render edilmez →
 * doğrudan URL ile de veri sızmaz; temiz "MODULE_DISABLED" görünümü döner. Kenar menü gizlemesine
 * EK sunucu-tarafı savunma katmanıdır (client redirect DEĞİL). NİHAİ enforcement gateway'dedir.
 *
 * Async server component: `isStoreModuleEnabled` matrisi `cache()`'li çözer → aynı render-pass'te
 * tek gateway çağrısı. Matris hatası → fail-open (render; gateway yine 403/404 verir).
 */
export async function ModuleGuard({
  moduleKey,
  children,
}: {
  moduleKey: string;
  children: ReactNode;
}) {
  const enabled = await isStoreModuleEnabled(moduleKey);
  if (enabled) return <>{children}</>;
  return (
    <>
      <PageHeader
        eyebrow="Modül"
        title="Bu modül kapalı"
        description="Bu bölüm mağazanız için şu anda kullanılamıyor."
      />
      <EmptyState
        tag="MODULE_DISABLED"
        title="Modül kullanılamıyor"
        description="Bu modül planınızda veya mağaza ayarlarınızda kapalı. Etkinleştirmek için platform yöneticinizle iletişime geçin."
      />
    </>
  );
}
