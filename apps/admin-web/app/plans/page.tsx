import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";
import { PlanIcon } from "../../components/icons";
import { getAdminDict } from "../../lib/i18n";

export default function PlansPage() {
  const t = getAdminDict().plans;

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button>{t.newPlan}</Button>}
      />
      <SectionCard title={t.cardTitle} description={t.cardDescription} icon={<PlanIcon />}>
        <EmptyState
          tag={t.emptyTag}
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={<Button size="sm">{t.emptyAction}</Button>}
        />
      </SectionCard>
    </>
  );
}
