import { redirect } from "next/navigation";
import { Container, EmptyState } from "@commerce-os/ui";
import { format } from "@commerce-os/i18n";
import { getStorefrontDict } from "../../lib/i18n";
import { formatMinor } from "../../lib/money";
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
  searchParams: Promise<{ section?: string }>;
}) {
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/auth/login?next=/account");
  }
  const t = (await getStorefrontDict()).account;
  const section = resolveSection((await searchParams).section);

  return (
    <Container className="py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <AccountSidebar t={t} section={section} />
        </aside>
        <section>{await renderSection(section, t)}</section>
      </div>
    </Container>
  );
}

async function renderSection(
  section: AccountSection,
  t: Awaited<ReturnType<typeof getStorefrontDict>>["account"],
) {
  switch (section) {
    case "orders": {
      const orders = await listCustomerOrders();
      return <OrdersList t={t} orders={orders} />;
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

function OrdersList({
  t,
  orders,
}: {
  t: Awaited<ReturnType<typeof getStorefrontDict>>["account"];
  orders: Awaited<ReturnType<typeof listCustomerOrders>>;
}) {
  const o = t.orders;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{o.title}</h1>
      {orders.length === 0 ? (
        <EmptyState title={o.title} description={o.empty} />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.orderNumber} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {o.orderNumber}: {order.orderNumber}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(order.createdAt).toLocaleDateString()} ·{" "}
                    {format(o.items, { count: order.itemCount })}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-slate-900">
                    {formatMinor(order.totalMinor, order.currency)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {o.statusValues[order.status]} · {o.paymentValues[order.paymentStatus]}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {order.lines.map((line) => `${line.title} ×${line.quantity}`).join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
