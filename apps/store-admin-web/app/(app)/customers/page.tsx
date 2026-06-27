import { Button, EmptyState, PageHeader, SectionCard } from "../../../components/ui";
import { CustomerIcon } from "../../../components/icons";
import { getCommonDict, getStoreAdminDict } from "../../../lib/i18n";

export default async function CustomersPage() {
  const t = (await getStoreAdminDict()).customers;
  const c = await getCommonDict();

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button variant="secondary">{c.actions.export}</Button>}
      />
      <SectionCard title={t.cardTitle} description={t.cardDescription} icon={<CustomerIcon />}>
        <EmptyState tag={t.emptyTag} title={t.emptyTitle} description={t.emptyDescription} />
      </SectionCard>
    </>
  );
}
