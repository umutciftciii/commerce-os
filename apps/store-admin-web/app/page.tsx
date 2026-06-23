import Link from "next/link";
import { Button, EmptyState, PageHeader, SectionCard, StatCard } from "@commerce-os/ui";

export default function StoreDashboardPage() {
  return (
    <>
      <PageHeader
        title="Store dashboard"
        description="Today's sales, orders, stock and marketplace sync at a glance."
        actions={<Button variant="secondary">Last 30 days</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sales (today)" value="—" hint="Connect orders in Faz 2" />
        <StatCard label="Open orders" value="—" hint="Fulfilment pending" />
        <StatCard label="Low stock items" value="—" hint="Inventory pending" />
        <StatCard label="Marketplace sync" value="—" badge="Idle" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Recent orders"
          description="Latest orders across all channels"
          actions={
            <Link href="/orders">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          }
        >
          <EmptyState
            title="No orders yet"
            description="Incoming orders from your storefront and marketplaces will appear here."
          />
        </SectionCard>

        <SectionCard
          title="Inventory alerts"
          description="Items that need attention"
          actions={
            <Link href="/inventory">
              <Button variant="ghost" size="sm">
                Manage stock
              </Button>
            </Link>
          }
        >
          <EmptyState
            title="Nothing to restock"
            description="Low-stock and out-of-stock warnings will be listed here once inventory is tracked."
          />
        </SectionCard>
      </div>
    </>
  );
}
