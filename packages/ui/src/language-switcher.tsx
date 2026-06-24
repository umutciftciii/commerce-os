"use client";

import { localeCookieString, supportedLocales, type Locale } from "@commerce-os/i18n";
import { cn } from "./cn";

export interface LanguageSwitcherLabels {
  /** Grup icin erisilebilir etiket (ornegin "Arayuz dili"). */
  ariaLabel: string;
  /** Turkce secenegi icin erisilebilir tam ad. */
  turkish: string;
  /** Ingilizce secenegi icin erisilebilir tam ad. */
  english: string;
}

export interface LanguageSwitcherProps {
  /** Su an aktif olan dil (sunucuda cozulmus cookie degeri). */
  value: Locale;
  /** Lokalize, erisilebilir etiketler (common.language sozlugunden). */
  labels: LanguageSwitcherLabels;
  className?: string;
}

/** Kisa kod gosterimi; tam ad erisilebilir etikete tasinir. */
const SHORT_CODE: Record<Locale, string> = { tr: "TR", en: "EN" };

/**
 * Kucuk, erisilebilir TR/EN dil secici.
 *
 * Secim `commerce_os_locale` cookie'sine yazilir ve tam sayfa yenilemesiyle
 * sunucu-render sozluk yeniden uretilir. Aktif dil `aria-pressed` ve gorsel
 * vurguyla belirtilir. Bilesen bilincli olarak next/router'a bagimli degildir;
 * her uc uygulamada (admin, store-admin, storefront) ayni sekilde calisir.
 */
export function LanguageSwitcher({ value, labels, className }: LanguageSwitcherProps) {
  function select(next: Locale) {
    if (next === value) return;
    document.cookie = localeCookieString(next);
    // Tam yenileme: sunucu kok layout'u yeni cookie'yi okur, sozlugu yeniden
    // secer ve istemci agacina aktarir. Auth/session cookie'leri korunur.
    window.location.reload();
  }

  const fullName: Record<Locale, string> = { tr: labels.turkish, en: labels.english };

  return (
    <div
      role="group"
      aria-label={labels.ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-card",
        className,
      )}
    >
      {supportedLocales.map((locale) => {
        const active = locale === value;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => select(locale)}
            aria-pressed={active}
            aria-label={fullName[locale]}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-semibold transition-colors",
              active
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            {SHORT_CODE[locale]}
          </button>
        );
      })}
    </div>
  );
}
