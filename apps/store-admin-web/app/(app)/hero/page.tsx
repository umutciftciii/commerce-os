import { redirect } from "next/navigation";

/**
 * Final Polish §5 — Yinelenen "Ana Sayfa" yönetimi kaldırıldı.
 *
 * Vitrin hero/slider'ının TEK otoritesi "Ana Sayfa Deneyimi" (`/home` → HomeSection
 * `HERO_SLIDER`). Eski bağımsız `HeroSlide` modelini yöneten bu ekran ("Ana Sayfa",
 * `/hero`) artıktı: storefront onu HİÇ okumuyordu (`getHeroSlides` çağrılmıyordu).
 * İkinci yönetim yüzeyi kaldırıldı; veriler (HeroSlide tablosu) SİLİNMEDİ. Eski
 * bookmark/deep-link'ler güvenli çalışsın diye bu route kalıcı olarak `/home`'a yönlenir.
 */
export default function HeroRedirect() {
  redirect("/home");
}
