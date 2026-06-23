import { Badge, Button, Card, PageHeader, SectionCard } from "@commerce-os/ui";

const themes = [
  { name: "Aurora", detail: "Clean, conversion-focused default" },
  { name: "Boutique", detail: "Editorial layout for fashion" },
  { name: "Market", detail: "Dense grid for large catalogues" },
];

export default function ThemePage() {
  return (
    <>
      <PageHeader
        title="Theme"
        description="Choose and customise the look of your public storefront."
      />
      <SectionCard title="Available themes" description="Storefront presentation">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme, index) => (
            <Card key={theme.name} className="overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200" />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{theme.name}</p>
                  {index === 0 ? <Badge tone="success">Active</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{theme.detail}</p>
                <Button size="sm" variant="secondary" className="mt-3" disabled>
                  {index === 0 ? "Customise" : "Preview"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Theme selection, live preview and customisation will connect to the storefront in a later
          phase.
        </p>
      </SectionCard>
    </>
  );
}
