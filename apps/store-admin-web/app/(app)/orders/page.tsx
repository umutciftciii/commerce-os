import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";
import { OrderIcon } from "../../../components/icons";
import { getCommonDict, getStoreAdminDict } from "../../../lib/i18n";

export default function OrdersPage() {
  const t = getStoreAdminDict().orders;
  const c = getCommonDict();

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button variant="secondary">{c.actions.export}</Button>}
      />
      <SectionCard title={t.cardTitle} description={t.cardDescription} icon={<OrderIcon />}>
        <EmptyState tag={t.emptyTag} title={t.emptyTitle} description={t.emptyDescription} />
      </SectionCard>
    </>
  );
}
