"use client";

import { createContext, useContext, type ReactNode } from "react";
import { defaultLocale, type Locale } from "@commerce-os/i18n";

/**
 * Aktif arayuz dilini istemci agacina tasiyan baglam.
 *
 * Sunucu kok layout'u cookie'den locale'i cozer ve `LocaleProvider` ile saglar.
 * Istemci bilesenleri `useLocale()` ile aktif dili okur ve `getDictionary(locale)`
 * cagirir. Saglayici yoksa guvenli sekilde varsayilan dile (Turkce) duser; bu
 * sayede saglayicisiz render edilen birim testleri Turkce kalir.
 */
const LocaleContext = createContext<Locale>(defaultLocale);

export interface LocaleProviderProps {
  locale: Locale;
  children: ReactNode;
}

export function LocaleProvider({ locale, children }: LocaleProviderProps) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Aktif arayuz dilini dondurur (saglayici yoksa varsayilan: Turkce). */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}
