import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StoreAppShell } from "../../components/store-app-shell";
import { SESSION_COOKIE_NAME } from "../../lib/server/session";

/** Oturum cookie'si yoksa login'e yönlendirir; varsa mağaza kabuğunu render eder. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  if (!cookieStore.get(SESSION_COOKIE_NAME)?.value) {
    redirect("/login");
  }

  return <StoreAppShell>{children}</StoreAppShell>;
}
