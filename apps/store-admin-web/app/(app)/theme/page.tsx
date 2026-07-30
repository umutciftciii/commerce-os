import { PageHeader } from "../../../components/ui";
import { ThemeStudio } from "./theme-studio";

/**
 * TODO-164B (ADR-232) — "Marka ve Görünüm" (Store Admin Brand Customizer). Mağaza
 * yalnız marka renkleri, izinli yazı tipleri, hazır düzen ve görselleri düzenler;
 * teknik slot/token/versiyon/uyumluluk alanları GÖSTERİLMEZ (Platform Admin Theme
 * Designer'a taşındı). Değişiklikler taslakta tutulur; yayınlandığında vitrine yansır.
 */
export default function ThemePage() {
  return (
    <>
      <PageHeader
        eyebrow="Görünüm"
        title="Marka ve Görünüm"
        description="Marka renklerinizi, yazı tipinizi ve hazır düzeninizi seçin; önizleyip yayınlayın."
      />
      <ThemeStudio />
    </>
  );
}
