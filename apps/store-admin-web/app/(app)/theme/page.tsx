import { PageHeader } from "../../../components/ui";
import { ThemeStudio } from "./theme-studio";

/**
 * TODO-158B (ADR-087) — Theme Studio: mağazanın görsel kimliğini (Design Token'lar)
 * koddan ayrı yöneten modül. Preset seç → düzenle → canlı önizle → yayınla akışı.
 * Vitrin yalnız PUBLISHED temayı kullanır (public /theme ucu).
 */
export default function ThemePage() {
  return (
    <>
      <PageHeader
        eyebrow="Görünüm"
        title="Tema Stüdyosu"
        description="Marka renkleri, tipografi, köşe ve gölge token'larını yönetin. Değişiklikler taslakta tutulur; yayınladığınızda vitrine yansır."
      />
      <ThemeStudio />
    </>
  );
}
