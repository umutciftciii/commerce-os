import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";

export default function InventoryPage() {
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock levels, warehouses and movements across locations."
        actions={<Button variant="secondary">Adjust stock</Button>}
      />
      <SectionCard title="Stock by location" description="Warehouses & quantities">
        <EmptyState
          title="No stock tracked yet"
          description="Warehouse setup, stock counts and movement history will appear here once inventory is enabled."
        />
      </SectionCard>
    </>
  );
}
