import type { ReactNode } from "react";
import { ModuleGuard } from "../../../components/module-guard";

// TODO-165A (ADR-165A) Task 15/16 — Marka (Brand) rotası CATALOG çekirdek/always-on
// modülüne bağlıdır (bkz. `lib/store-modules.ts` HREF_MODULE). `isStoreModuleEnabled`
// çekirdek modülde her zaman `true` döner; bu guard yalnız TEK OTORİTE'yi (nav gizleme
// ile aynı harita) korumak için `size-charts/layout.tsx` deseniyle eklendi — pratikte
// rota her zaman render edilir.
export default function Layout({ children }: { children: ReactNode }) {
  return <ModuleGuard moduleKey="CATALOG">{children}</ModuleGuard>;
}
