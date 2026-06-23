import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Track, fulfil and refund orders from every sales channel."
        actions={<Button variant="secondary">Export</Button>}
      />
      <SectionCard title="All orders" description="Storefront & marketplace orders">
        <EmptyState
          title="No orders yet"
          description="Order details, fulfilment status and payment state will be managed here."
        />
      </SectionCard>
    </>
  );
}
