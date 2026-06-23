import { Badge, Button, Card, PageHeader, SectionCard } from "@commerce-os/ui";

const channels = [
  { name: "Trendyol", detail: "Marketplace listing & order sync" },
  { name: "Hepsiburada", detail: "Marketplace listing & order sync" },
];

export default function MarketplacePage() {
  return (
    <>
      <PageHeader
        title="Marketplace"
        description="Connect external marketplaces and keep listings and orders in sync."
      />
      <SectionCard title="Channels" description="Available integrations">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {channels.map((channel) => (
            <Card key={channel.name} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{channel.name}</p>
                  <Badge tone="neutral">Not connected</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{channel.detail}</p>
              </div>
              <Button size="sm" variant="secondary" disabled>
                Connect
              </Button>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">
          OAuth/credential flows and product/order synchronisation will be implemented in the
          integration phase.
        </p>
      </SectionCard>
    </>
  );
}
