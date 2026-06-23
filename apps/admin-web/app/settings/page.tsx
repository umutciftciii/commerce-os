import { Button, Input, PageHeader, SectionCard } from "@commerce-os/ui";
import { SettingsIcon } from "../../components/icons";
import { getAdminDict, getCommonDict } from "../../lib/i18n";

export default function SettingsPage() {
  const t = getAdminDict().settings;
  const c = getCommonDict();

  return (
    <>
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <SectionCard
        title={t.cardTitle}
        description={t.cardDescription}
        icon={<SettingsIcon />}
        actions={
          <Button size="sm" disabled>
            {c.actions.save}
          </Button>
        }
      >
        <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label={t.platformName} defaultValue="commerce-os" disabled />
          <Input label={t.supportEmail} defaultValue="destek@commerce-os.dev" disabled />
        </div>
        <p className="mt-4 text-xs text-slate-400">{t.note}</p>
      </SectionCard>
    </>
  );
}
