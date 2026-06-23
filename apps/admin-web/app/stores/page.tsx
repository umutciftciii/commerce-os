import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";
import { StoreIcon } from "../../components/icons";
import { getAdminDict } from "../../lib/i18n";

export default function StoresPage() {
  const t = getAdminDict().stores;

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button>{t.newStore}</Button>}
      />
      <SectionCard title={t.cardTitle} description={t.cardDescription} icon={<StoreIcon />}>
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
