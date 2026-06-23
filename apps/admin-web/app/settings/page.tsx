import { Button, Input, PageHeader, SectionCard } from "@commerce-os/ui";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Global configuration for the commerce-os platform."
      />
      <SectionCard
        title="General"
        description="Platform identity (read-only placeholder)"
        actions={
          <Button size="sm" disabled>
            Save
          </Button>
        }
      >
        <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Platform name" defaultValue="commerce-os" disabled />
          <Input label="Support email" defaultValue="support@commerce-os.dev" disabled />
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Editable platform settings and persistence will be wired up in a later phase.
        </p>
      </SectionCard>
    </>
  );
}
