import Link from "next/link";
import { Button, Container, EmptyState } from "@commerce-os/ui";
import { getRequestLocale, getStorefrontDict } from "../../../lib/i18n";
import { resolvePayToken } from "../../../lib/server/pay";
import { PayPanel } from "../../../components/pay-panel";

export const dynamic = "force-dynamic";

/**
 * TODO-159F — Müşteri ödeme sayfası (/pay/:token). Token OPAQUE'tir; sipariş ID'si
 * taşımaz. Gateway token'ı hash + TTL + store/order eşleşmesiyle doğrular. Admin/
 * internal alanlar, maliyet/kâr, başka müşteri bilgisi GÖSTERİLMEZ.
 */
export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dict = await getStorefrontDict();
  const d = dict.payment.payLink;
  const locale = await getRequestLocale();

  const outcome = await resolvePayToken(token);

  if (!outcome.ok) {
    // Süresi dolmuş / geçersiz → generic güvenli hata (order enumeration YOK).
    const expired = outcome.status === 410;
    return (
      <PayMessage
        title={expired ? d.expiredTitle : d.invalidTitle}
        description={expired ? d.expiredDescription : d.invalidDescription}
        backLabel={dict.payment.backToStore}
      />
    );
  }

  const state = outcome.data;

  // Zaten ödendi → yeniden ödeme başlatılamaz.
  if (state.paymentStatus === "PAID" || state.paymentStatus === "AUTHORIZED") {
    return (
      <PayMessage
        title={d.alreadyPaidTitle}
        description={d.alreadyPaidDescription}
        backLabel={dict.payment.backToStore}
      />
    );
  }

  // Ödenebilir değil (terminal/expired) veya gerçek provider (bu fazda tamamlanamaz).
  if (!state.payable) {
    return (
      <PayMessage
        title={d.expiredTitle}
        description={d.expiredDescription}
        backLabel={dict.payment.backToStore}
      />
    );
  }
  if (!state.sandbox) {
    return (
      <PayMessage
        title={d.unavailableTitle}
        description={d.unavailableDescription}
        backLabel={dict.payment.backToStore}
      />
    );
  }

  return (
    <Container className="py-12">
      <PayPanel token={token} state={state} d={d} locale={locale} />
    </Container>
  );
}

function PayMessage({
  title,
  description,
  backLabel,
}: {
  title: string;
  description: string;
  backLabel: string;
}) {
  return (
    <Container className="py-12">
      <EmptyState
        title={title}
        description={description}
        action={
          <Link href="/products">
            <Button>{backLabel}</Button>
          </Link>
        }
      />
    </Container>
  );
}
