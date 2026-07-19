"use client";

import { getDictionary, localeCookieName, resolveLocaleFromCookieValue } from "@commerce-os/i18n";
import { Button } from "../../components/ui/button";
import { Container, EmptyState } from "../../components/ui";

/**
 * TODO-156B (brief §15) — PLP/arama route error boundary. Internal hata mesajı GÖSTERİLMEZ (yalnız kullanıcı
 * dostu metin + "Tekrar dene"). Katalog/PDP erişilebilir kalır (boundary yalnız /products segmentini sarar).
 * Locale client'ta cookie'den çözülür (RSC olmadığı için). `error` prop'u UI'a sızdırılmaz (gözlemlenebilirlik
 * platform hata izlemesine bırakıldı — konsol log yok).
 */
function readLocale(): "tr" | "en" {
  if (typeof document === "undefined") return "tr";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${localeCookieName}=`));
  return resolveLocaleFromCookieValue(match?.split("=")[1]);
}

export default function ProductsError({ reset }: { error: Error; reset: () => void }) {
  const s = getDictionary(readLocale()).storefront.search;

  return (
    <Container className="py-16 lg:py-20">
      <EmptyState
        title={s.errorTitle}
        description={s.errorDescription}
        action={
          <Button variant="secondary" onClick={() => reset()}>
            {s.errorRetry}
          </Button>
        }
      />
    </Container>
  );
}
