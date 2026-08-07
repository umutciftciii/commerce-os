/**
 * TODO-174A (ADR-279) — Sipariş deneyimi değerlendirmesi (sunucu-yalnız okuma).
 *
 * ProductReview'DAN AYRIK: bu değerlendirme ürün puanına yansımaz. Uygunluk SUNUCU-otoriterdir
 * (iptal edilmiş + teslim EDİLMEMİŞ + müşteriye ait); bu modül yalnız çağırır ve tipli sonuç döner.
 */
import type { OrderExperienceEligibility } from "@commerce-os/contracts";
import { customerBasePath } from "./customer";
import { getCustomer } from "./gateway";
import { readCustomerToken } from "./customer-cookie";

/**
 * Deneyim-değerlendirmesine uygun (iptal + teslim-edilmemiş) siparişler + zaten değerlendirilmiş
 * olanların rating'i. Oturum yok/hata → boş liste (sipariş kartında CTA gösterilmez).
 */
export async function listOrderExperience(): Promise<OrderExperienceEligibility[]> {
  const token = await readCustomerToken();
  if (!token) return [];
  const result = await getCustomer<{ data: OrderExperienceEligibility[] }>(
    `${customerBasePath()}/order-experience`,
    token,
  );
  return result.ok ? result.data.data : [];
}
