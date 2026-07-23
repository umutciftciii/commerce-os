/**
 * TODO-159D (ADR-093) — Hesabım > Beğendiklerim (varsayılan wishlist görünümü).
 * Sunucu bileşeni: başlık + hidrate öğe grid'i (ListItemsView client island). Öğeler
 * varsayılan wishlist'ten gelir; taşı/kopyala hedefleri diğer listelerdir.
 */
import type { CustomerListItem, CustomerListSummary } from "@commerce-os/api-client";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { ListItemsView } from "../lists/list-items-view";

export function FavoritesSection({
  defaultListId,
  items,
  otherLists,
  t,
}: {
  defaultListId: string;
  items: CustomerListItem[];
  otherLists: CustomerListSummary[];
  t: StorefrontDictionary["account"]["wishlist"];
}) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-ink">{t.favoritesTitle}</h1>
      <p className="mt-1 text-sm text-ink-subtle">{t.favoritesSubtitle}</p>
      <div className="mt-6">
        <ListItemsView listId={defaultListId} items={items} otherLists={otherLists} t={t} />
      </div>
    </div>
  );
}
