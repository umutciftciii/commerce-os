import Link from "next/link";
import { Button, EmptyState, PageHeader, SectionCard, StatCard } from "@commerce-os/ui";
import { HealthIcon, PlanIcon, StoreIcon } from "../components/icons";
import { getAdminDict, getCommonDict } from "../lib/i18n";

export default function DashboardPage() {
  const t = getAdminDict().dashboard;
  const c = getCommonDict();

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button variant="secondary">{t.exportReport}</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.stats.activeStores} value="—" hint={t.stats.activeStoresHint} />
        <StatCard label={t.stats.plans} value="—" hint={t.stats.plansHint} />
        <StatCard label={t.stats.mrr} value="—" hint={t.stats.mrrHint} />
        <StatCard
          label={t.stats.systemStatus}
          value={c.status.healthy}
          badge={c.status.live}
          badgeTone="success"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title={t.storesCard.title}
          description={t.storesCard.description}
          icon={<StoreIcon />}
          actions={
            <Link href="/stores">
              <Button variant="ghost" size="sm">
                {c.actions.manage}
              </Button>
            </Link>
          }
        >
          <EmptyState
            tag={t.storesCard.emptyTag}
            title={t.storesCard.emptyTitle}
            description={t.storesCard.emptyDescription}
            action={
              <Link href="/stores">
                <Button size="sm">{t.storesCard.emptyAction}</Button>
              </Link>
            }
          />
        </SectionCard>

        <SectionCard
          title={t.plansCard.title}
          description={t.plansCard.description}
          icon={<PlanIcon />}
          actions={
            <Link href="/plans">
              <Button variant="ghost" size="sm">
                {c.actions.manage}
              </Button>
            </Link>
          }
        >
          <EmptyState
            tag={t.plansCard.emptyTag}
            title={t.plansCard.emptyTitle}
            description={t.plansCard.emptyDescription}
          />
        </SectionCard>

        <SectionCard
          title={t.healthCard.title}
          description={t.healthCard.description}
          icon={<HealthIcon />}
          actions={
            <Link href="/system-health">
              <Button variant="ghost" size="sm">
                {c.actions.view}
              </Button>
            </Link>
          }
        >
          <EmptyState
            tag={t.healthCard.emptyTag}
            title={t.healthCard.emptyTitle}
            description={t.healthCard.emptyDescription}
            action={
              <Link href="/system-health">
                <Button size="sm" variant="secondary">
                  {t.healthCard.emptyAction}
                </Button>
              </Link>
            }
          />
        </SectionCard>
      </div>
    </>
  );
}
