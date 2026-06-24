"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Badge, Button, Spinner, Topbar, UserChip } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { StoreNav } from "./store-nav";
import { StoreContextProvider } from "./store-context";
import { storeApi, type StoreContext, type StoreUser } from "../lib/client/api";

type GuardState =
  | { status: "loading" }
  | { status: "ready"; user: StoreUser; store: StoreContext }
  | { status: "unauthed" };

/**
 * Oturum guard'i + mağaza bağlamı yükleyici. me() ile oturumu doğrular, mağaza
 * bağlamını çeker ve kabuğu seçili mağaza bilgisiyle render eder. Token istemciye
 * hiç ulaşmaz; yalnızca kullanıcı ve mağaza meta verisi gösterilir.
 */
export function StoreAppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>({ status: "loading" });

  const store = getDictionary().storeAdmin;

  useEffect(() => {
    let active = true;
    Promise.all([storeApi.me(), storeApi.storeContext()])
      .then(([me, ctx]) => {
        if (active) setState({ status: "ready", user: me.user, store: ctx.store });
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

  if (state.status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label={store.shell.checking} />
      </div>
    );
  }

  const displayName = state.user.name ?? state.user.email;
  const statusLabels = store.storeStatusLabels as Record<StoreContext["status"], string>;

  async function onLogout() {
    await storeApi.logout().catch(() => {
      // Cookie sunucu tarafinda her durumda temizlenir.
    });
    router.replace("/login");
  }

  return (
    <StoreContextProvider store={state.store}>
      <AppShell
        brand={{ name: state.store.name, subtitle: store.shell.brandSubtitle }}
        nav={<StoreNav />}
        topbar={
          <Topbar title={store.shell.topbarTitle}>
            <Badge tone="info">{statusLabels[state.store.status]}</Badge>
            <UserChip name={displayName} role={store.shell.userRole} />
            <Button variant="ghost" size="sm" onClick={onLogout}>
              {store.shell.logout}
            </Button>
          </Topbar>
        }
        footer={<span>{store.shell.footer}</span>}
      >
        {children}
      </AppShell>
    </StoreContextProvider>
  );
}
