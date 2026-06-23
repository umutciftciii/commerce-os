import Link from "next/link";
import { Button, EmptyState, PageHeader, SectionCard, StatCard } from "@commerce-os/ui";
import { InventoryIcon, OrderIcon } from "../components/icons";
import { getCommonDict, getStoreAdminDict } from "../lib/i18n";

export default function StoreDashboardPage() {
  const t = getStoreAdminDict().dashboard;
  const c = getCommonDict();

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button variant="secondary">{t.rangeLabel}</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.stats.sales} value="—" hint={t.stats.salesHint} />
        <StatCard label={t.stats.openOrders} value="—" hint={t.stats.openOrdersHint} />
        <StatCard label={t.stats.lowStock} value="—" hint={t.stats.lowStockHint} />
        <StatCard
          label={t.stats.marketplaceSync}
          value="—"
          badge={c.status.idle}
          badgeTone="warning"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title={t.ordersCard.title}
          description={t.ordersCard.description}
          icon={<OrderIcon />}
          actions={
            <Link href="/orders">
              <Button variant="ghost" size="sm">
                {c.actions.viewAll}
              </Button>
            </Link>
          }
        >
          <EmptyState
            tag={t.ordersCard.emptyTag}
            title={t.ordersCard.emptyTitle}
            description={t.ordersCard.emptyDescription}
          />
        </SectionCard>

        <SectionCard
          title={t.inventoryCard.title}
          description={t.inventoryCard.description}
          icon={<InventoryIcon />}
          actions={
            <Link href="/inventory">
              <Button variant="ghost" size="sm">
                {c.actions.manage}
              </Button>
            </Link>
          }
        >
          <EmptyState
            tag={t.inventoryCard.emptyTag}
            title={t.inventoryCard.emptyTitle}
            description={t.inventoryCard.emptyDescription}
          />
        </SectionCard>
      </div>
    </>
  );
}
