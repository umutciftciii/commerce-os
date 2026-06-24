import { Button, Input, PageHeader, SectionCard } from "@commerce-os/ui";
import { SettingsIcon } from "../../../components/icons";
import { getCommonDict, getStoreAdminDict } from "../../../lib/i18n";

export default async function StoreSettingsPage() {
  const t = (await getStoreAdminDict()).settings;
  const c = await getCommonDict();

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
          <Input label={t.storeName} defaultValue="Demo Mağaza" disabled />
          <Input label={t.contactEmail} defaultValue="sahip@demo-magaza.dev" disabled />
        </div>
        <p className="mt-4 text-xs text-slate-400">{t.note}</p>
      </SectionCard>
    </>
  );
}
