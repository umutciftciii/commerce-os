import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";
import { InventoryIcon } from "../../components/icons";
import { getStoreAdminDict } from "../../lib/i18n";

export default function InventoryPage() {
  const t = getStoreAdminDict().inventory;

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button variant="secondary">{t.adjustStock}</Button>}
      />
      <SectionCard title={t.cardTitle} description={t.cardDescription} icon={<InventoryIcon />}>
        <EmptyState tag={t.emptyTag} title={t.emptyTitle} description={t.emptyDescription} />
      </SectionCard>
    </>
  );
}
