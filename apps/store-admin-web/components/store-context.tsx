"use client";

import { createContext, useContext } from "react";
import type { StoreContext as StoreContextValue } from "../lib/client/api";

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreContextProvider({
  store,
  children,
}: {
  store: StoreContextValue;
  children: React.ReactNode;
}) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** Seçili mağaza bağlamını döner (shell guard altında her zaman vardır). */
export function useStoreContext(): StoreContextValue | null {
  return useContext(StoreContext);
}
