import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";

export default function CustomersPage() {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Customer profiles, contact details and order history."
        actions={<Button variant="secondary">Export</Button>}
      />
      <SectionCard title="All customers" description="Customer directory">
        <EmptyState
          title="No customers yet"
          description="Customer records, segments and lifetime value will be shown here as orders come in."
        />
      </SectionCard>
    </>
  );
}
