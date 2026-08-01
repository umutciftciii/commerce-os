import type { ReactNode } from "react";
import { ModuleGuard } from "../../../components/module-guard";

// TODO-165A (ADR-165A) Task 24 — "Ürün Sözlükleri" (governed Product Taxonomy) rotası yalnız
// FASHION_VERTICAL modülü effective AÇIKken render edilir (mirror `size-charts/layout.tsx`).
// Kapalıysa sayfa (ve BFF veri çağrıları) hiç render edilmez → doğrudan URL bypass olmaz.
// Nihai enforcement gateway'de (capability guard); bu sunucu-tarafı ek savunma katmanıdır.
export default function Layout({ children }: { children: ReactNode }) {
  return <ModuleGuard moduleKey="FASHION_VERTICAL">{children}</ModuleGuard>;
}
