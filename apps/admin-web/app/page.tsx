import Link from "next/link";
import { Button, EmptyState, PageHeader, SectionCard, StatCard } from "@commerce-os/ui";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Health and growth across every store running on commerce-os."
        actions={<Button variant="secondary">Export report</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active stores" value="—" hint="Provisioning lands in Faz 2" />
        <StatCard label="Plans" value="—" hint="Billing wiring pending" />
        <StatCard label="Monthly recurring" value="—" hint="Analytics pending" />
        <StatCard label="System status" value="OK" badge="Live" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Stores"
          description="Tenants provisioned on the platform"
          actions={
            <Link href="/stores">
              <Button variant="ghost" size="sm">
                Manage
              </Button>
            </Link>
          }
        >
          <EmptyState
            title="No stores yet"
            description="Onboarded tenants will be listed here with their plan and status."
            action={
              <Link href="/stores">
                <Button size="sm">Go to stores</Button>
              </Link>
            }
          />
        </SectionCard>

        <SectionCard
          title="Plans"
          description="Subscription packages offered to tenants"
          actions={
            <Link href="/plans">
              <Button variant="ghost" size="sm">
                Manage
              </Button>
            </Link>
          }
        >
          <EmptyState
            title="No plans configured"
            description="Define subscription tiers, limits and pricing once billing is wired up."
          />
        </SectionCard>

        <SectionCard
          title="System health"
          description="Gateway, worker, database and cache"
          actions={
            <Link href="/system-health">
              <Button variant="ghost" size="sm">
                View
              </Button>
            </Link>
          }
        >
          <EmptyState
            title="Live checks pending"
            description="The dashboard will surface API gateway, worker, PostgreSQL and Redis health."
            action={
              <Link href="/system-health">
                <Button size="sm" variant="secondary">
                  Open system health
                </Button>
              </Link>
            }
          />
        </SectionCard>
      </div>
    </>
  );
}
