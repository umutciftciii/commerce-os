import { Badge, Button, Card, PageHeader, SectionCard } from "@commerce-os/ui";
import { MarketplaceIcon } from "../../../components/icons";
import { getCommonDict, getStoreAdminDict } from "../../../lib/i18n";

export default async function MarketplacePage() {
  const t = (await getStoreAdminDict()).marketplace;
  const c = await getCommonDict();

  return (
    <>
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <SectionCard title={t.cardTitle} description={t.cardDescription} icon={<MarketplaceIcon />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {t.channels.map((channel) => (
            <Card key={channel.name} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{channel.name}</p>
                  <Badge tone="neutral">{c.status.notConnected}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{channel.detail}</p>
              </div>
              <Button size="sm" variant="secondary" disabled>
                {c.actions.connect}
              </Button>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">{t.note}</p>
      </SectionCard>
    </>
  );
}
