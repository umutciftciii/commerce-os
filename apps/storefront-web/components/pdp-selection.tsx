"use client";

// Faz 2C-7 (ADR-078) — Variant Media Engine. PDP'de secili varyant state'ini iki kardes
// ada (BuyBox ↔ VariantGallery) arasinda PAYLASAN kucuk client provider. Onceden bu iki ada
// izoleydi (varyant secince galeri degismiyordu); state buraya "lift" edildi. Provider CLIENT'tir
// ama cocuklari (baslik blogu vb.) SUNUCU bilesenleri olarak gecirilebilir (RSC children prop'u) —
// boylece client yuzeyi minimum kalir. Baslangic degeri = varsayilan (en ucuz) varyant → SSR ilk
// render dogru grupla gelir, hidrasyon sicramasi olmaz (sunucu ve istemci ayni ilk state).

import { createContext, useContext, useState, type ReactNode } from "react";

interface PdpSelection {
  selectedVariantId: string | null;
  setSelectedVariantId: (id: string) => void;
}

const PdpSelectionContext = createContext<PdpSelection | null>(null);

export function PdpSelectionProvider({
  defaultVariantId,
  children,
}: {
  defaultVariantId: string | null;
  children: ReactNode;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(defaultVariantId);
  return (
    <PdpSelectionContext.Provider value={{ selectedVariantId, setSelectedVariantId }}>
      {children}
    </PdpSelectionContext.Provider>
  );
}

export function usePdpSelection(): PdpSelection {
  const ctx = useContext(PdpSelectionContext);
  if (!ctx) throw new Error("usePdpSelection must be used within a PdpSelectionProvider.");
  return ctx;
}
