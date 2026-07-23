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
import { CouponsSection } from "../../components/account/sections/coupons-section";
import { FavoritesSection } from "../../components/account/sections/favorites-section";
import { ListsSection } from "../../components/account/sections/lists-section";
import { ReviewsSection } from "../../components/account/sections/reviews-section";
import { getCouponCenter } from "../../lib/server/coupons";
import { getCustomerLists, getCustomerListDetail } from "../../lib/server/lists";
import { getMyReviews } from "../../lib/server/reviews";
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
  const dict = await getStorefrontDict();
  const t = dict.account;
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
          {await renderSection(section, dict, locale, {
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
  dict: Awaited<ReturnType<typeof getStorefrontDict>>,
  locale: Locale,
  ordersParams: { tab?: string; q?: string },
) {
  const t = dict.account;
  switch (section) {
    case "orders": {
      // TODO-159E hotfix — Sipariş kartındaki "Ürün yorumu yaz" aksiyonu için sunucu-otoriter
      // uygunluk (eligible) + mevcut yorumlar aynı sayfada çözülür (yeni uç YOK).
      const [orders, reviewData] = await Promise.all([listCustomerOrders(), getMyReviews()]);
      return (
        <OrdersSection
          t={t}
          orders={orders}
          locale={locale}
          tab={resolveOrdersTab(ordersParams.tab)}
          query={(ordersParams.q ?? "").trim()}
          reviewsT={dict.reviews}
          eligible={reviewData?.eligible ?? []}
          reviews={reviewData?.reviews ?? []}
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
    case "reviews": {
      const data = await getMyReviews();
      return (
        <ReviewsSection
          t={t}
          reviews={data?.reviews ?? []}
          eligible={data?.eligible ?? []}
          locale={locale}
        />
      );
    }
    case "favorites": {
      // TODO-159D (ADR-093) — Beğendiklerim = varsayılan wishlist (gateway lazy-create eder).
      const lists = await getCustomerLists();
      const defaultList = lists.find((list) => list.isDefault && list.type === "WISHLIST");
      if (!defaultList) {
        return <FavoritesSection defaultListId="" items={[]} otherLists={[]} t={t.wishlist} />;
      }
      const detail = await getCustomerListDetail(defaultList.id, { pageSize: 100 });
      const otherLists = lists.filter((list) => list.id !== defaultList.id);
      return (
        <FavoritesSection
          defaultListId={defaultList.id}
          items={detail?.detail.items ?? []}
          otherLists={otherLists}
          t={t.wishlist}
        />
      );
    }
    case "lists": {
      const lists = await getCustomerLists();
      return <ListsSection lists={lists} t={t.wishlist} />;
    }
    case "coupons": {
      const center = await getCouponCenter();
      return <CouponsSection coupons={center.coupons} t={t.coupons} />;
    }
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
