import { resolveApiGatewayUrl } from "@commerce-os/api-client";
import { Badge, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";

const components = [
  { name: "API gateway", detail: "Fastify HTTP gateway" },
  { name: "Worker", detail: "BullMQ background jobs" },
  { name: "PostgreSQL", detail: "Primary datastore" },
  { name: "Redis", detail: "Queue & cache" },
];

export default function SystemHealthPage() {
  const gatewayUrl = resolveApiGatewayUrl();

  return (
    <>
      <PageHeader
        title="System health"
        description="Live status of the platform runtime components."
        breadcrumb="Platform · Operations"
      />

      <SectionCard
        title="Runtime components"
        description={`Health probes will call the gateway at ${gatewayUrl}`}
        actions={<Badge tone="warning">Not wired</Badge>}
      >
        <ul className="divide-y divide-slate-100">
          {components.map((component) => (
            <li key={component.name} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{component.name}</p>
                <p className="text-xs text-slate-500">{component.detail}</p>
              </div>
              <Badge tone="neutral">Pending</Badge>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="mt-6">
        <EmptyState
          title="Live probes not connected yet"
          description="This page will poll the gateway internal health endpoints (DB & Redis) and surface worker queue depth. The API client placeholder already resolves the gateway URL from API_GATEWAY_URL."
        />
      </div>
    </>
  );
}
