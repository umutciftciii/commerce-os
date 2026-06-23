import { Button, Input, PageHeader, SectionCard } from "@commerce-os/ui";

export default function StoreSettingsPage() {
  return (
    <>
      <PageHeader title="Store settings" description="Configuration for this store." />
      <SectionCard
        title="General"
        description="Store identity (read-only placeholder)"
        actions={
          <Button size="sm" disabled>
            Save
          </Button>
        }
      >
        <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Store name" defaultValue="Demo Store" disabled />
          <Input label="Contact email" defaultValue="owner@demo-store.dev" disabled />
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Editable store settings and persistence will be wired up in a later phase.
        </p>
      </SectionCard>
    </>
  );
}
