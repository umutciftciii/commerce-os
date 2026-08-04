"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getDictionary } from "@commerce-os/i18n";
import { useLocale } from "@commerce-os/ui";
import { SessionGuard } from "./session-guard";
import { safeNextPath } from "../../lib/next-path";
import {
  extendSessionAction,
  logoutAction,
  sessionTimingAction,
} from "../../lib/server/auth-actions";

// ADR-271 — Kanal/anahtar adı session cookie adından KASITLI olarak ayrıdır
// (`_sync` soneki); localStorage fallback'i yalnız mesaj tipi taşır, ASLA token.
const SESSION_CHANNEL = "commerce_os_customer_session_sync";

/**
 * ADR-271 — Storefront (müşteri) oturum muhafızı. Yalnızca oturum açmış müşteride
 * mount edilir (layout server tarafında `customer` varlığına göre karar verir).
 * Server Action'ları (extend/logout/timing) generic SessionGuard'a bağlar; bitişte
 * güvenli login yönlendirmesi (expired mesajı + same-origin next). Sunucu otoriter.
 */
export function StorefrontSessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = getDictionary(locale).storefront.auth;

  const onEnded = useCallback(
    (reason: "expired" | "logout") => {
      if (reason === "logout") {
        router.push("/");
        router.refresh();
        return;
      }
      const next = safeNextPath(pathname ?? "/account", "/account");
      const params = new URLSearchParams({ reason: "expired" });
      if (next !== "/account") params.set("next", next);
      router.push(`/auth/login?${params.toString()}`);
      router.refresh();
    },
    [pathname, router],
  );

  return (
    <SessionGuard
      channelName={SESSION_CHANNEL}
      messages={{
        warningTitle: t.session.warningTitle,
        warningBody: t.session.warningBody,
        countdownLabel: t.session.countdownLabel,
        extend: t.session.extend,
        extendBusy: t.session.extendBusy,
        logout: t.session.logout,
        extendError: t.session.extendError,
        closeLabel: t.session.closeLabel,
      }}
      refreshTiming={() => sessionTimingAction()}
      extendSession={async () => {
        const result = await extendSessionAction();
        if (!result.ok) throw new Error(result.code);
        return result.data.timing;
      }}
      logout={() => logoutAction()}
      onEnded={onEnded}
    />
  );
}
