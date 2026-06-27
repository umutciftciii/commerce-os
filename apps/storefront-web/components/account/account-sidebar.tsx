import Link from "next/link";
import type { StorefrontDictionary } from "@commerce-os/i18n";

type AccountDict = StorefrontDictionary["account"];
export type AccountSection =
  | "orders"
  | "requests"
  | "profile"
  | "password"
  | "communication"
  | "iban"
  | "addresses"
  | "reviews"
  | "favorites"
  | "lists"
  | "coupons";

const PROFILE_GROUP: AccountSection[] = [
  "profile",
  "password",
  "communication",
  "iban",
  "addresses",
];

function itemClass(active: boolean): string {
  return [
    "block rounded-lg px-3 py-2 text-sm transition-colors",
    active
      ? "bg-brand-50 font-medium text-brand-700"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
  ].join(" ");
}

/**
 * Hesabim sol menusu (F3B.3). Her zaman gorunur. "Kullanici Bilgilerim" grubu alt
 * bolumleri (uyelik/sifre/iletisim/IBAN/adresler) ile birlikte listelenir; aktif
 * bolum vurgulanir.
 */
export function AccountSidebar({ t, section }: { t: AccountDict; section: AccountSection }) {
  const profileActive = PROFILE_GROUP.includes(section);
  return (
    <nav aria-label={t.sidebarTitle} className="space-y-1">
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {t.sidebarTitle}
      </p>
      <Link href="/account?section=orders" className={itemClass(section === "orders")}>
        {t.menu.orders}
      </Link>
      <Link href="/account?section=requests" className={itemClass(section === "requests")}>
        {t.menu.requests}
      </Link>

      <div className="pt-1">
        <Link
          href="/account?section=profile"
          className={[
            "block rounded-lg px-3 py-2 text-sm",
            profileActive ? "font-medium text-slate-900" : "text-slate-600 hover:text-slate-900",
          ].join(" ")}
        >
          {t.menu.profile}
        </Link>
        <div className="ml-3 mt-1 space-y-1 border-l border-slate-100 pl-2">
          <Link href="/account?section=profile" className={itemClass(section === "profile")}>
            {t.profileMenu.membership}
          </Link>
          <Link href="/account?section=password" className={itemClass(section === "password")}>
            {t.profileMenu.password}
          </Link>
          <Link
            href="/account?section=communication"
            className={itemClass(section === "communication")}
          >
            {t.profileMenu.communication}
          </Link>
          <Link href="/account?section=iban" className={itemClass(section === "iban")}>
            {t.profileMenu.iban}
          </Link>
          <Link href="/account?section=addresses" className={itemClass(section === "addresses")}>
            {t.profileMenu.addresses}
          </Link>
        </div>
      </div>

      <Link href="/account?section=reviews" className={itemClass(section === "reviews")}>
        {t.menu.reviews}
      </Link>
      <Link href="/account?section=favorites" className={itemClass(section === "favorites")}>
        {t.menu.favorites}
      </Link>
      <Link href="/account?section=lists" className={itemClass(section === "lists")}>
        {t.menu.lists}
      </Link>
      <Link href="/account?section=coupons" className={itemClass(section === "coupons")}>
        {t.menu.coupons}
      </Link>
    </nav>
  );
}
