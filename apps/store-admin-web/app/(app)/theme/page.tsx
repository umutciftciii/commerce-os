import { Badge, Button, Card, PageHeader, SectionCard } from "@commerce-os/ui";
import { ThemeIcon } from "../../../components/icons";
import { getCommonDict, getStoreAdminDict } from "../../../lib/i18n";

export default async function ThemePage() {
  const t = (await getStoreAdminDict()).theme;
  const c = await getCommonDict();

  return (
    <>
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <SectionCard title={t.cardTitle} description={t.cardDescription} icon={<ThemeIcon />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.themes.map((theme, index) => (
            <Card key={theme.name} className="overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200" />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{theme.name}</p>
                  {index === 0 ? <Badge tone="success">{c.status.active}</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{theme.detail}</p>
                <Button size="sm" variant="secondary" className="mt-3" disabled>
                  {index === 0 ? c.actions.customize : c.actions.preview}
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">{t.note}</p>
      </SectionCard>
    </>
  );
}
