import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "@commerce-os/i18n";
import { getStorefrontDict } from "../../../../lib/i18n";
import { getCurrentCustomer } from "../../../../lib/server/customer";
import { getCustomerLists, getCustomerListDetail } from "../../../../lib/server/lists";
import { ListItemsView } from "../../../../components/account/lists/list-items-view";
import { ButtonLink, Container, Heading } from "../../../../components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

/**
 * TODO-159D (ADR-093) — Liste detayı (dedicated route). Oturum zorunlu; yoksa
 * /auth/login?next=... Gateway YALNIZ müşterinin KENDİ listesini döner (başka müşteri/
 * yok → null → notFound() → 404). Öğeler CANLI hidrasyonla; sayfalama ADR-089 (25/50/100).
 */
export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const customer = await getCurrentCustomer();
  const { listId } = await params;
  if (!customer) {
    redirect(`/auth/login?next=/account/lists/${encodeURIComponent(listId)}`);
  }
  const dict = (await getStorefrontDict()).account;
  const t = dict.wishlist;
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = PAGE_SIZE_OPTIONS.includes(Number(query.pageSize)) ? Number(query.pageSize) : 25;

  const [view, lists] = await Promise.all([
    getCustomerListDetail(listId, { page, pageSize }),
    getCustomerLists(),
  ]);
  if (!view) {
    notFound();
  }
  const { detail, pagination } = view;
  const otherLists = lists.filter((list) => list.id !== detail.id);
  const listTitle = detail.isDefault ? t.favoritesTitle : detail.name;

  return (
    <Container className="py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <ButtonLink href="/account?section=lists" variant="link" className="text-sm">
          ← {t.backToLists}
        </ButtonLink>

        <header className="space-y-1">
          <Heading as="h1">{listTitle}</Heading>
          <p className="text-sm text-ink-muted">
            {format(t.itemCount, { count: pagination.totalItems })}
          </p>
        </header>

        <ListItemsView listId={detail.id} items={detail.items} otherLists={otherLists} t={t} />

        {pagination.totalPages > 1 ? (
          <nav className="flex items-center justify-between border-t border-line pt-4 text-sm" aria-label="pagination">
            {page > 1 ? (
              <Link
                href={`/account/lists/${detail.id}?page=${page - 1}&pageSize=${pageSize}`}
                className="text-ink hover:underline"
                rel="prev"
              >
                ←
              </Link>
            ) : (
              <span aria-hidden />
            )}
            <span className="text-ink-subtle">
              {page} / {pagination.totalPages}
            </span>
            {page < pagination.totalPages ? (
              <Link
                href={`/account/lists/${detail.id}?page=${page + 1}&pageSize=${pageSize}`}
                className="text-ink hover:underline"
                rel="next"
              >
                →
              </Link>
            ) : (
              <span aria-hidden />
            )}
          </nav>
        ) : null}
      </div>
    </Container>
  );
}
