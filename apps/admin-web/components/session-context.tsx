"use client";

import { createContext, useContext } from "react";
import type { AdminUser } from "../lib/client/api";

const SessionContext = createContext<AdminUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: AdminUser;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** Oturum açmış platform admin kullanıcısını döner (shell guard altında her zaman var). */
export function useSessionUser(): AdminUser | null {
  return useContext(SessionContext);
}
