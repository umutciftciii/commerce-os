"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LanguageSwitcher, useLocale } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { Badge } from "./ui";
import { StoreNav } from "./store-nav";
import { StoreContextProvider } from "./store-context";
import { storeApi, type StoreContext, type StoreUser } from "../lib/client/api";

type GuardState =
  | { status: "loading" }
  | { status: "ready"; user: StoreUser; store: StoreContext }
  | { status: "unauthed" };

const ACTIVE_STORE_LABEL = { tr: "Aktif Mağaza", en: "Active Store" };
const MENU_LABEL = { tr: "Menüyü aç", en: "Open menu" };
const CLOSE_LABEL = { tr: "Menüyü kapat", en: "Close menu" };

/** commerce-os küp logosu (tasarımdaki marka işareti). */
function BrandMark() {
  return (
    <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-[0_4px_20px_rgba(99,102,241,0.45),inset_0_1px_0_rgba(255,255,255,0.25)]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    </div>
  );
}

/**
 * Oturum guard'i + mağaza bağlamı yükleyici. me() ile oturumu doğrular, mağaza
 * bağlamını çeker ve KOYU glassmorphism kabuğu seçili mağaza bilgisiyle render
 * eder. Token istemciye hiç ulaşmaz; yalnızca kullanıcı ve mağaza meta verisi
 * gösterilir. Bu dosyada yalnızca görünüm değişti; oturum/akış mantığı aynı.
 *
 * Navigasyon: lg ve üzeri sabit kenar menü; lg altında topbar'daki hamburger ile
 * açılan drawer (aynı menü içeriği) — böylece tüm route'lar mobil/tablette de
 * erişilebilir kalır. Auth/store context/logout akışı değişmedi.
 */
export function StoreAppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>({ status: "loading" });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const locale = useLocale();
  const dict = getDictionary(locale);
  const store = dict.storeAdmin;

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
      <div className="flex min-h-screen items-center justify-center">
        <span className="inline-flex items-center gap-2 text-sm text-white/50">
          <span
            aria-hidden
            className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-indigo-400"
          />
          {store.shell.checking}
        </span>
      </div>
    );
  }

  const displayName = state.user.name ?? state.user.email;
  const initials =
    displayName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  const statusLabels = store.storeStatusLabels as Record<StoreContext["status"], string>;
  const activeStoreLabel = locale === "tr" ? ACTIVE_STORE_LABEL.tr : ACTIVE_STORE_LABEL.en;
  const menuLabel = locale === "tr" ? MENU_LABEL.tr : MENU_LABEL.en;
  const closeLabel = locale === "tr" ? CLOSE_LABEL.tr : CLOSE_LABEL.en;

  async function onLogout() {
    await storeApi.logout().catch(() => {
      // Cookie sunucu tarafinda her durumda temizlenir.
    });
    router.replace("/login");
  }

  /**
   * Kenar menü içeriği (marka + aktif mağaza kartı + nav + kullanıcı/çıkış).
   * Hem masaüstü sabit menüde hem mobil drawer'da aynen kullanılır. `onNavigate`
   * drawer'da bir route'a geçilince paneli kapatmak için verilir.
   */
  const sidebarInner = (onNavigate?: () => void) => (
    <>
      <div className="shrink-0 px-[18px] pb-3.5 pt-[22px]">
        <div className="flex items-center gap-[11px]">
          <BrandMark />
          <div>
            <p className="text-sm font-bold tracking-tight text-white/95">
              commerce<span className="text-indigo-300/85">-os</span>
            </p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-400/75">
              {store.shell.brandName}
            </p>
          </div>
        </div>
      </div>

      {/* Aktif mağaza kartı */}
      <div className="mx-2.5 mb-3 shrink-0 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2.5">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-300/70">
          {activeStoreLabel}
        </p>
        <p className="truncate text-[13px] font-bold text-white/90">{state.store.name}</p>
        <p className="mt-0.5 font-mono text-[10px] text-white/30">{state.store.slug}</p>
      </div>

      <div className="mx-4 h-px shrink-0 bg-white/[0.06]" />

      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        <StoreNav onNavigate={onNavigate} />
      </div>

      {/* Kullanıcı / çıkış */}
      <div className="shrink-0 border-t border-white/[0.07] px-2.5 py-3">
        <button
          type="button"
          onClick={onLogout}
          aria-label={store.shell.logout}
          className="flex w-full items-center gap-2.5 rounded-[10px] bg-white/[0.04] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.07]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-indigo-500/70 to-fuchsia-500/60 text-[11px] font-bold text-white">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-white/80">{displayName}</span>
            {state.user.email ? (
              <span className="block truncate text-[10px] text-white/30">{state.user.email}</span>
            ) : null}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="shrink-0 text-white/25"
          >
            <path d="M17 16l4-4m0 0l-4-4m4 4H7" />
          </svg>
        </button>
      </div>
    </>
  );

  return (
    <StoreContextProvider store={state.store}>
      <div className="flex h-screen overflow-hidden">
        {/* SIDEBAR (lg+) */}
        <aside className="z-10 hidden w-[248px] shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-white/[0.045] backdrop-blur-2xl backdrop-saturate-150 lg:flex">
          {sidebarInner()}
        </aside>

        {/* MOBİL DRAWER (lg altı) */}
        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              aria-hidden
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside
              role="dialog"
              aria-modal="true"
              className="absolute left-0 top-0 flex h-full w-[248px] flex-col overflow-hidden border-r border-white/[0.07] bg-[#0a0c1a] shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
            >
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label={closeLabel}
                className="absolute right-2 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
              {sidebarInner(() => setMobileNavOpen(false))}
            </aside>
          </div>
        ) : null}

        {/* MAIN */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* TOPBAR */}
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-white/[0.03] px-5 backdrop-blur-md sm:px-7">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label={menuLabel}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-white/[0.1] bg-white/[0.06] text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white/85 lg:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-tight text-white/25">{state.store.name}</p>
              <p className="truncate text-[15px] font-semibold leading-tight tracking-tight text-white/90">
                {store.shell.topbarTitle}
              </p>
            </div>
            <LanguageSwitcher value={locale} labels={dict.common.language} />
            <Badge tone="info">{statusLabels[state.store.status]}</Badge>
          </header>

          {/* CONTENT */}
          <main className="flex-1 overflow-y-auto px-5 pb-12 pt-7 sm:px-7">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </StoreContextProvider>
  );
}
