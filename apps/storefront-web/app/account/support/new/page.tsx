import { redirect } from "next/navigation";
import type { SupportTopicDto } from "@commerce-os/contracts";
import { getRequestLocale, getStorefrontDict } from "../../../../lib/i18n";
import { getCurrentCustomer, getCustomerOrderDetail } from "../../../../lib/server/customer";
import { SupportGuidedWizard } from "../../../../components/account/support/guided-wizard";
import { Alert, ButtonLink, Container, Heading } from "../../../../components/ui";

export const dynamic = "force-dynamic";

/** Konu sırası platform-owned; ham enum GÖSTERİLMEZ (etiketler i18n'den). */
const TOPICS: SupportTopicDto[] = [
  "PRODUCT_NOT_WORKING",
  "DAMAGED_OR_MISSING",
  "SETUP_USAGE",
  "WARRANTY_SERVICE",
  "PRODUCT_INFO",
  "INVOICE_DOCUMENT",
  "OTHER",
];

/**
 * TODO-177 (ADR-289) Faz D — Ürün desteği başlangıcı (order-line bağlamlı). Bağlam order
 * detayından SUNUCUDA türetilir (müşteri ürün/sipariş/varyant TEKRAR SEÇMEZ). Order/line
 * bulunamazsa dead-end yerine anlaşılır uyarı + siparişe dönüş (backend zaten her çağrıda
 * orderLineId+customerId doğrular). Oturum yoksa /auth/login?next=...
 */
export default async function NewSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; line?: string }>;
}) {
  const { order: orderNumber, line: orderLineId } = await searchParams;
  const nextPath = `/account/support/new${orderNumber ? `?order=${encodeURIComponent(orderNumber)}${orderLineId ? `&line=${encodeURIComponent(orderLineId)}` : ""}` : ""}`;
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }

  const dict = await getStorefrontDict();
  const t = dict.account.support;
  const locale = await getRequestLocale();

  const order = orderNumber ? await getCustomerOrderDetail(orderNumber) : null;
  const line = order && orderLineId ? order.lines.find((l) => l.orderLineId === orderLineId) : undefined;

  return (
    <Container className="py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <ButtonLink href="/account/support" variant="link" className="text-sm">
          ← {t.detail.backToList}
        </ButtonLink>
        <Heading as="h1">{t.new.title}</Heading>

        {order && line ? (
          <SupportGuidedWizard
            context={{
              orderNumber: order.orderNumber,
              orderLineId: line.orderLineId,
              productTitle: line.title,
              variantTitle: line.variantTitle,
            }}
            topics={TOPICS}
            t={t}
            locale={locale}
          />
        ) : (
          <div className="space-y-4">
            <Alert tone="warning">{t.new.invalidContext}</Alert>
            <ButtonLink href="/account?section=orders" variant="secondary" size="sm">
              {t.new.backToOrder}
            </ButtonLink>
          </div>
        )}
      </div>
    </Container>
  );
}
