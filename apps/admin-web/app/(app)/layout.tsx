"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, Spinner, Topbar, UserChip } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { AdminNav } from "../../components/admin-nav";
import { SessionProvider } from "../../components/session-context";
import { adminApi, type AdminUser } from "../../lib/client/api";

type GuardState =
  | { status: "loading" }
  | { status: "authed"; user: AdminUser }
  | { status: "unauthed" };

/**
 * Oturum açmış yönetim kabuğu. Mount'ta /api/auth/me ile oturumu doğrular:
 * yüklenirken tam ekran spinner, oturum yoksa /login'e yönlendirir, varsa
 * AppShell + canlı kullanıcı + çıkış aksiyonunu render eder ve kullanıcıyı
 * alt sayfalara context ile aktarır.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>({ status: "loading" });

  const admin = getDictionary().admin;

  useEffect(() => {
    let active = true;
    adminApi
      .me()
      .then((me) => {
        if (active) setState({ status: "authed", user: me.user });
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
      // Cookie sunucu tarafında her durumda temizlenir.
    });
    router.replace("/login");
  }

  return (
    <SessionProvider user={user}>
      <AppShell
        brand={{ name: admin.shell.brandName, subtitle: admin.shell.brandSubtitle }}
        nav={<AdminNav />}
        topbar={
          <Topbar title={admin.shell.topbarTitle}>
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
