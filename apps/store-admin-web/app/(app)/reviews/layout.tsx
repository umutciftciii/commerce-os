import type { ReactNode } from "react";
import { ModuleGuard } from "../../../components/module-guard";

// TODO-163 (ADR-214 · Faz 3 · TD-155) — Sunucu-tarafı direct-URL guard. Modül effective KAPALIysa
// bu rotanın sayfaları (ve BFF veri çağrıları) render edilmez → doğrudan URL ile bypass olmaz.
export default function Layout({ children }: { children: ReactNode }) {
  return <ModuleGuard moduleKey="REVIEWS">{children}</ModuleGuard>;
}
