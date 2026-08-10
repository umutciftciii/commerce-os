import { ButtonLink } from "../../ui";

/**
 * TODO-177 (ADR-289) Faz D — Order-line "Ürün desteği al" CTA'sı (order detayında her satır).
 * Ana giriş noktası; bağlam (order + orderLineId) query ile guided başlangıcına taşınır.
 * Backend orderLineId+storeId+customerId'yi yeniden doğrular (client metadata güvenilmez).
 * Faz 1: yalnız satın alınmış order-line bağlamı (PDP genel destek CTA'sı YOK).
 */
export function SupportLineCta({
  orderNumber,
  orderLineId,
  label,
}: {
  orderNumber: string;
  orderLineId: string;
  label: string;
}) {
  const href = `/account/support/new?order=${encodeURIComponent(orderNumber)}&line=${encodeURIComponent(orderLineId)}`;
  return (
    <ButtonLink href={href} variant="link" size="sm" data-testid="support-line-cta">
      {label}
    </ButtonLink>
  );
}
