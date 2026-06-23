import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";

export default function ProductsPage() {
  return (
    <>
      <PageHeader
        title="Products"
        description="Catalogue, variants, pricing and media for your store."
        actions={<Button>Add product</Button>}
      />
      <SectionCard title="Catalogue" description="All products">
        <EmptyState
          title="Your catalogue is empty"
          description="Product creation, variants, pricing and media management will live here in the commerce phase."
          action={<Button size="sm">Add your first product</Button>}
        />
      </SectionCard>
    </>
  );
}
