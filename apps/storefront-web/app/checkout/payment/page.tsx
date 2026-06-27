import Link from "next/link";
import { Button, Container, EmptyState } from "@commerce-os/ui";
import { getStorefrontDict } from "../../../lib/i18n";
import { getOrderPaymentState } from "../../../lib/server/cart";
import { PaymentTester } from "../../../components/payment-tester";

export const dynamic = "force-dynamic";

/**
 * F3B.2 — Public test ödeme sayfası. Yalnızca orderId YETMEZ: kısa ömürlü `token`
 * gerekir. Token gateway'de doğrulanır (hash + TTL + store/order/attempt eşleşmesi
 * + order ödenebilir + attempt TEST/MOCK). Secret/credential client'a asla gelmez.
 */
export default async function CheckoutPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; token?: string }>;
}) {
  const t = (await getStorefrontDict()).payment;
  const { orderId, token } = await searchParams;

  if (!orderId || !token) {
    return <InvalidPayment t={t} />;
  }

  const outcome = await getOrderPaymentState(orderId, token);
  if (!outcome.ok) {
    return <InvalidPayment t={t} />;
  }

  return (
    <Container className="py-12">
      <PaymentTester state={outcome.data} orderId={orderId} token={token} t={t} />
    </Container>
  );
}

function InvalidPayment({
  t,
}: {
  t: Awaited<ReturnType<typeof getStorefrontDict>>["payment"];
}) {
  return (
    <Container className="py-12">
      <EmptyState
        title={t.invalidTitle}
        description={t.invalidDescription}
        action={
          <Link href="/products">
            <Button>{t.backToStore}</Button>
          </Link>
        }
      />
    </Container>
  );
}
