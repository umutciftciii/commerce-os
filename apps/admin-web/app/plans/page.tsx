import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";

export default function PlansPage() {
  return (
    <>
      <PageHeader
        title="Plans"
        description="Subscription tiers, usage limits and pricing offered to tenants."
        actions={<Button>New plan</Button>}
      />
      <SectionCard title="Subscription plans" description="Packages & limits">
        <EmptyState
          title="No plans configured yet"
          description="Define tiers, entitlements and pricing here once the billing module is connected."
          action={<Button size="sm">Define a plan</Button>}
        />
      </SectionCard>
    </>
  );
}
