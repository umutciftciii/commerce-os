import { Button, EmptyState, PageHeader, SectionCard } from "@commerce-os/ui";
import { ProductIcon } from "../../components/icons";
import { getStoreAdminDict } from "../../lib/i18n";

export default function ProductsPage() {
  const t = getStoreAdminDict().products;

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button>{t.addProduct}</Button>}
      />
      <SectionCard title={t.cardTitle} description={t.cardDescription} icon={<ProductIcon />}>
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
