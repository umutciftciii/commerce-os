"use client";

import { localeCookieString, supportedLocales, type Locale } from "@commerce-os/i18n";
import type { LanguageSwitcherLabels } from "@commerce-os/ui";
import { cn } from "@commerce-os/ui";

/**
 * Vitrine-ozel, NOTR dil secici (ADIM 1 palet revizyonu).
 *
 * Paylasilan @commerce-os/ui LanguageSwitcher aktif dili marka menekşesiyle
 * (bg-brand-600) vurgular; minimal palet hedefinde aksan yalniz tek CTA'ya
 * ayrildigi icin header'da onun yerine bu ink-tabanli, keskin toggle kullanilir.
 * Cookie/yenileme davranisi paylasilan bilesenle AYNIDIR (localeCookieString +
 * tam sayfa reload); yalnizca gorunum notrdur. Paylasilan kit'e DOKUNULMAZ.
 */
const SHORT: Record<Locale, string> = { tr: "TR", en: "EN" };

export function LangToggle({
  value,
  labels,
  className,
}: {
  value: Locale;
  labels: LanguageSwitcherLabels;
  className?: string;
}) {
  function select(next: Locale) {
    if (next === value) return;
    document.cookie = localeCookieString(next);
    window.location.reload();
  }

  const fullName: Record<Locale, string> = { tr: labels.turkish, en: labels.english };

  return (
    <div
      role="group"
      aria-label={labels.ariaLabel}
      className={cn("inline-flex items-center gap-2 text-xs font-medium", className)}
    >
      {supportedLocales.map((locale, index) => {
        const active = locale === value;
        return (
          <span key={locale} className="inline-flex items-center gap-2">
            {index > 0 ? <span className="text-line-strong" aria-hidden>/</span> : null}
            <button
              type="button"
              onClick={() => select(locale)}
              aria-pressed={active}
              aria-label={fullName[locale]}
              className={cn(
                "tracking-wideish transition-colors",
                active ? "text-ink underline underline-offset-4" : "text-ink-subtle hover:text-ink",
              )}
            >
              {SHORT[locale]}
            </button>
          </span>
        );
      })}
    </div>
  );
}
