import { redirect } from "next/navigation";
import { Container, EmptyState } from "@commerce-os/ui";
import type { Locale } from "@commerce-os/i18n";
import { getRequestLocale, getStorefrontDict } from "../../lib/i18n";
import { resolveOrdersTab } from "../../lib/orders";
import {
  getCurrentCustomer,
  getCustomerCommunicationPreferences,
  listCustomerAddresses,
  listCustomerIbans,
  listCustomerOrders,
} from "../../lib/server/customer";
import {
  AccountSidebar,
  type AccountSection,
} from "../../components/account/account-sidebar";
import { OrdersSection } from "../../components/account/sections/orders-section";
import { ProfileForm } from "../../components/account/sections/profile-form";
import { PasswordForm } from "../../components/account/sections/password-form";
import { CommunicationForm } from "../../components/account/sections/communication-form";
import { IbanManager } from "../../components/account/sections/iban-manager";
import { AddressManager } from "../../components/account/sections/address-manager";

export const dynamic = "force-dynamic";

const SECTIONS: AccountSection[] = [
  "orders",
  "requests",
  "profile",
  "password",
  "communication",
  "iban",
  "addresses",
  "reviews",
  "favorites",
  "lists",
  "coupons",
];

function resolveSection(value: string | undefined): AccountSection {
  return value && (SECTIONS as string[]).includes(value) ? (value as AccountSection) : "orders";
}

/**
 * Hesabim sayfasi (F3B.3). Oturum zorunlu (yoksa /auth/login?next=/account). Sol
 * sidebar her zaman gorunur; aktif bolum ?section ile secilir. Gercek moduller:
 * Siparislerim (yalniz kendi siparisleri), Uyelik/Sifre/Iletisim/IBAN/Adresler.
 * Diger bolumler (Soru&Talepler, Degerlendirmeler, Begendiklerim, Listeler,
 * Kuponlar) bu fazda dogal dilli empty-state'tir (sonraki fazlar).
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; tab?: string; q?: string }>;
}) {
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/auth/login?next=/account");
  }
  const t = (await getStorefrontDict()).account;
  const locale = await getRequestLocale();
  const params = await searchParams;
  const section = resolveSection(params.section);

  return (
    <Container className="py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <AccountSidebar t={t} section={section} />
        </aside>
        <section>
          {await renderSection(section, t, locale, {
            tab: params.tab,
            q: params.q,
          })}
        </section>
      </div>
    </Container>
  );
}

async function renderSection(
  section: AccountSection,
  t: Awaited<ReturnType<typeof getStorefrontDict>>["account"],
  locale: Locale,
  ordersParams: { tab?: string; q?: string },
) {
  switch (section) {
    case "orders": {
      const orders = await listCustomerOrders();
      return (
        <OrdersSection
          t={t}
          orders={orders}
          locale={locale}
          tab={resolveOrdersTab(ordersParams.tab)}
          query={(ordersParams.q ?? "").trim()}
        />
      );
    }
    case "profile": {
      const customer = await getCurrentCustomer();
      return customer ? <ProfileForm t={t} customer={customer} /> : null;
    }
    case "password":
      return <PasswordForm t={t} />;
    case "communication": {
      const prefs = await getCustomerCommunicationPreferences();
      return <CommunicationForm t={t} initial={prefs} />;
    }
    case "iban": {
      const ibans = await listCustomerIbans();
      return <IbanManager t={t} ibans={ibans} />;
    }
    case "addresses": {
      const addresses = await listCustomerAddresses();
      return <AddressManager t={t} addresses={addresses} />;
    }
    case "requests":
      return <Placeholder title={t.menu.requests} description={t.placeholders.requests} />;
    case "reviews":
      return <Placeholder title={t.menu.reviews} description={t.placeholders.reviews} />;
    case "favorites":
      return <Placeholder title={t.menu.favorites} description={t.placeholders.favorites} />;
    case "lists":
      return <Placeholder title={t.menu.lists} description={t.placeholders.lists} />;
    case "coupons":
      return <Placeholder title={t.menu.coupons} description={t.placeholders.coupons} />;
    default:
      return null;
  }
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">{title}</h1>
      <EmptyState title={title} description={description} />
    </div>
  );
}
