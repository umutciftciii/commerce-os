import { resolveApiGatewayUrl } from "@commerce-os/api-client";
import { Badge, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";
import { HealthIcon } from "../../components/icons";
import { getAdminDict, getCommonDict } from "../../lib/i18n";

export default function SystemHealthPage() {
  const t = getAdminDict().systemHealth;
  const c = getCommonDict();
  const gatewayUrl = resolveApiGatewayUrl();

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        breadcrumb={t.breadcrumb}
      />

      <SectionCard
        title={t.cardTitle}
        description={`${t.cardDescriptionPrefix} ${gatewayUrl}`}
        icon={<HealthIcon />}
        actions={<Badge tone="warning">{c.status.notWired}</Badge>}
      >
        <ul className="divide-y divide-slate-100">
          {t.components.map((component) => (
            <li key={component.name} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{component.name}</p>
                <p className="text-xs text-slate-500">{component.detail}</p>
              </div>
              <Badge tone="neutral">{c.status.pending}</Badge>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="mt-6">
        <EmptyState tag={t.emptyTag} title={t.emptyTitle} description={t.emptyDescription} />
      </div>
    </>
  );
}
