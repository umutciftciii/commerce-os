import { redirect } from "next/navigation";

/**
 * Final Polish §8 — Platform Admin "Ayarlar" ekranı İNERT placeholder'dı (tüm alanlar
 * disabled, sabit örnek veri; gerçek bir ayar işlevi yoktu). Kullanıcıya aktif bir özellik
 * gibi gösterilmemesi için nav'dan kaldırıldı ve bu route dashboard'a yönlendirilir (eski
 * bookmark/deep-link güvenli çalışır). Gerçek platform ayarları geldiğinde bu route yeniden
 * aktifleştirilebilir.
 */
export default function SettingsRedirect() {
  redirect("/");
}
