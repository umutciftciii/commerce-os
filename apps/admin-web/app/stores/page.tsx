import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";

export default function StoresPage() {
  return (
    <>
      <PageHeader
        title="Stores"
        description="Provision, suspend and inspect every tenant store on the platform."
        actions={<Button>New store</Button>}
      />
      <SectionCard title="All stores" description="Tenant directory">
        <EmptyState
          title="No stores onboarded yet"
          description="Store provisioning, plan assignment and tenant lifecycle controls will appear here in a later phase."
          action={<Button size="sm">Create the first store</Button>}
        />
      </SectionCard>
    </>
  );
}
