"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerAccount } from "@commerce-os/api-client";
import { logoutAction } from "../../lib/server/auth-actions";

type AccountDict = StorefrontDictionary["account"];

const MENU_SECTIONS = [
  "orders",
  "requests",
  "profile",
  "reviews",
  "favorites",
  "lists",
  "coupons",
] as const;

/**
 * Header hesap kontrolu (F3B.3). Oturum yoksa Giris/Uye Ol; varsa "Hesabim"
 * dropdown'i. Item tiklaninca /account?section=... acilir. Cikis oturumu iptal
 * eder ve header durumunu tazeler.
 */
export function AccountMenu({
  customer,
  t,
}: {
  customer: CustomerAccount | null;
  t: AccountDict;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!customer) {
    return (
      <span className="flex items-center gap-4">
        <Link href="/auth/login" className="transition-colors hover:text-slate-900">
          {t.login}
        </Link>
        <Link
          href="/auth/register"
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-white transition-colors hover:bg-brand-700"
        >
          {t.register}
        </Link>
      </span>
    );
  }

  function logout() {
    startTransition(async () => {
      await logoutAction();
      setOpen(false);
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 transition-colors hover:text-slate-900"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t.cta}
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
        >
          <p className="px-4 py-1 text-xs text-slate-400">
            {t.greeting}
            {customer.firstName ? `, ${customer.firstName}` : ""}
          </p>
          {MENU_SECTIONS.map((section) => (
            <Link
              key={section}
              href={`/account?section=${section}`}
              role="menuitem"
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              {t.menu[section]}
            </Link>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            onClick={logout}
            disabled={pending}
          >
            {t.menu.logout}
          </button>
        </div>
      ) : null}
    </div>
  );
}
