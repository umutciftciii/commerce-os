"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, LanguageSwitcher, Spinner, Topbar, UserChip, useLocale } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import type { SessionTiming } from "@commerce-os/api-client";
import { AdminNav } from "./admin-nav";
import { SessionProvider } from "./session-context";
import { SessionGuard } from "./session-guard";
import { adminApi, type AdminUser } from "../lib/client/api";
import { SESSION_CHANNEL, postSessionMessage } from "../lib/client/session-sync";
import { safeInternalPath } from "../lib/safe-path";

type GuardState =
  | { status: "loading" }
  | { status: "authed"; user: AdminUser; timing?: SessionTiming }
  | { status: "unauthed" };

export function AdminAppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GuardState>({ status: "loading" });

  const locale = useLocale();
  const dict = getDictionary(locale);
  const admin = dict.admin;

  useEffect(() => {
    let active = true;
    adminApi
      .me()
      .then((me) => {
        if (active) setState({ status: "authed", user: me.user, timing: me.session.timing });
      })
      .catch(() => {
        if (!active) return;
        setState({ status: "unauthed" });
        router.replace("/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

  // ADR-271 — oturum bitişinde (idle/absolute/expired) veya çıkışta güvenli login
  // yönlendirmesi: same-origin returnTo + expired reason (mesaj login'de gösterilir).
  const onSessionEnded = useCallback(
    (reason: "expired" | "logout") => {
      const returnTo = safeInternalPath(pathname ?? "/", "/");
      const params = new URLSearchParams();
      if (reason === "expired") {
        params.set("reason", "expired");
        if (returnTo !== "/") params.set("returnTo", returnTo);
      }
      const qs = params.toString();
      router.replace(qs ? `/login?${qs}` : "/login");
    },
    [pathname, router],
  );

  if (state.status !== "authed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label={admin.auth.checking} />
      </div>
    );
  }

  const user = state.user;
  const roles = admin.shell.roles as Record<string, string>;
  const roleLabel = roles[user.role] ?? admin.shell.userRole;
  const displayName = user.name ?? user.email;

  async function onLogout() {
    await adminApi.logout().catch(() => {
      // Cookie sunucu tarafinda her durumda temizlenir.
    });
    // ADR-271 — diğer sekmeleri de çıkar (çok sekme senkronu).
    postSessionMessage({ type: "logout" });
    router.replace("/login");
  }

  const sessionMessages = {
    warningTitle: admin.session.warningTitle,
    warningBody: admin.session.warningBody,
    countdownLabel: admin.session.countdownLabel,
    extend: admin.session.extend,
    extendBusy: admin.session.extendBusy,
    logout: admin.session.logout,
    extendError: admin.session.extendError,
    closeLabel: admin.session.closeLabel,
  };

  return (
    <SessionProvider user={user}>
      <SessionGuard
        channelName={SESSION_CHANNEL}
        initialTiming={state.status === "authed" ? state.timing : undefined}
        messages={sessionMessages}
        refreshTiming={() => adminApi.me().then((me) => me.session.timing ?? null).catch(() => null)}
        extendSession={() => adminApi.extendSession().then((r) => r.timing)}
        logout={() => adminApi.logout().then(() => undefined)}
        onEnded={onSessionEnded}
      />
      <AppShell
        brand={{ name: admin.shell.brandName, subtitle: admin.shell.brandSubtitle }}
        nav={<AdminNav />}
        topbar={
          <Topbar title={admin.shell.topbarTitle}>
            <LanguageSwitcher value={locale} labels={dict.common.language} />
            <UserChip name={displayName} role={roleLabel} />
            <Button variant="ghost" size="sm" onClick={onLogout}>
              {admin.shell.logout}
            </Button>
          </Topbar>
        }
        footer={<span>{admin.shell.footer}</span>}
      >
        {children}
      </AppShell>
    </SessionProvider>
  );
}
