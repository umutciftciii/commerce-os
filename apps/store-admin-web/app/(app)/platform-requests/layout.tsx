import type { ReactNode } from "react";
import { ModuleGuard } from "../../../components/module-guard";

// TODO-178 (Faz D) — Sunucu-tarafı direct-URL guard. Modül (PLATFORM_REQUESTS) effective KAPALIysa
// bu rotanın sayfaları (ve BFF veri çağrıları) render edilmez → doğrudan URL ile bypass olmaz.
// Kenar menü gizlemesine EK savunma katmanı; nihai enforcement gateway'de.
export default function Layout({ children }: { children: ReactNode }) {
  return <ModuleGuard moduleKey="PLATFORM_REQUESTS">{children}</ModuleGuard>;
}
