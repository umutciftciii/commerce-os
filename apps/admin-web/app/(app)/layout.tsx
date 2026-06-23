import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminAppShell } from "../../components/admin-app-shell";
import { SESSION_COOKIE_NAME } from "../../lib/server/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  if (!cookieStore.get(SESSION_COOKIE_NAME)?.value) {
    redirect("/login");
  }

  return <AdminAppShell>{children}</AdminAppShell>;
}
