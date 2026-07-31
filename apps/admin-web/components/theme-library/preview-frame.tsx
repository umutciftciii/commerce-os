"use client";

import { useEffect, useRef, useState } from "react";

/**
 * TODO-164B Dilim 2 (ADR-242) — Full-screen çok-sayfa, çok-viewport storefront önizleme.
 * Gerçek storefront component'leri + gerçek demo projection (müşteri verisi KULLANILMAZ).
 * draft/published (before/after) toggle; sayfa + viewport değiştirme; preview token
 * store+theme+version scoped ve production cache'inden izole (middleware kısa TTL cookie).
 */

const VIEWPORTS = [
  { id: "375", label: "375 (mobil)", width: 375 },
  { id: "768", label: "768 (tablet)", width: 768 },
  { id: "1024", label: "1024 (dizüstü)", width: 1024 },
  { id: "1440", label: "1440 (masaüstü)", width: 1440 },
] as const;

const PAGES = [
  { id: "home", label: "Ana Sayfa", path: "/" },
  { id: "plp", label: "PLP", path: "/products" },
  { id: "pdp", label: "PDP", path: "/products" },
  { id: "cart", label: "Sepet", path: "/cart" },
  { id: "checkout", label: "Ödeme", path: "/checkout" },
  { id: "account", label: "Hesabım", path: "/account" },
] as const;

export type PreviewMode = "draft" | "published";

export function PreviewFrame({
  storefrontBaseUrl,
  fetchToken,
  draftAvailable,
  publishedAvailable,
}: {
  storefrontBaseUrl: string | null;
  /** Belirli moda göre imzalı preview token'ı çeker (draft = güncel, published = yayın sürümü). */
  fetchToken: (mode: PreviewMode) => Promise<string | null>;
  draftAvailable: boolean;
  publishedAvailable: boolean;
}) {
  const [viewport, setViewport] = useState<string>("1440");
  const [page, setPage] = useState<string>("home");
  const [mode, setMode] = useState<PreviewMode>("draft");
  const [customPath, setCustomPath] = useState<string>("");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchToken(mode)
      .then((t) => {
        if (!cancelled) setToken(t);
      })
      .catch(() => {
        if (!cancelled) setError("Önizleme token'ı alınamadı.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, fetchToken]);

  const activePath = customPath.trim() || PAGES.find((p) => p.id === page)?.path || "/";
  const width = VIEWPORTS.find((v) => v.id === viewport)?.width ?? 1440;
  const src =
    storefrontBaseUrl && token
      ? `${storefrontBaseUrl}${activePath}${activePath.includes("?") ? "&" : "?"}themePreview=${encodeURIComponent(token)}`
      : null;

  return (
    <div className="space-y-3">
      {/* Kontroller */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Önizleme sürümü" className="flex gap-1 rounded-md border border-slate-200 p-0.5">
          <button
            type="button"
            aria-pressed={mode === "published"}
            disabled={!publishedAvailable}
            onClick={() => setMode("published")}
            className={`rounded px-2.5 py-1 text-xs disabled:opacity-40 ${mode === "published" ? "bg-slate-800 text-white" : "text-slate-600"}`}
          >
            Yayın (önce)
          </button>
          <button
            type="button"
            aria-pressed={mode === "draft"}
            disabled={!draftAvailable}
            onClick={() => setMode("draft")}
            className={`rounded px-2.5 py-1 text-xs disabled:opacity-40 ${mode === "draft" ? "bg-indigo-600 text-white" : "text-slate-600"}`}
          >
            Taslak (sonra)
          </button>
        </div>

        <div role="group" aria-label="Sayfa" className="flex flex-wrap gap-1">
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={page === p.id && !customPath}
              onClick={() => {
                setPage(p.id);
                setCustomPath("");
              }}
              className={`rounded border px-2 py-1 text-xs ${page === p.id && !customPath ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-600"}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1 text-xs text-slate-500">
          Yol:
          <input
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="/products/urun-adi"
            className="w-40 rounded border border-slate-300 px-2 py-1 text-xs"
            aria-label="Özel önizleme yolu"
          />
        </label>

        <div role="group" aria-label="Ekran genişliği" className="ml-auto flex gap-1">
          {VIEWPORTS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={viewport === v.id}
              onClick={() => setViewport(v.id)}
              className={`rounded border px-2 py-1 text-xs ${viewport === v.id ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-600"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Çerçeve */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
        {!storefrontBaseUrl ? (
          <p className="p-6 text-sm text-slate-500">
            Storefront adresi tanımlı değil (NEXT_PUBLIC_STOREFRONT_URL). Önizleme kullanılamıyor.
          </p>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : loading || !src ? (
          <p className="p-6 text-sm text-slate-500">Önizleme hazırlanıyor…</p>
        ) : (
          <div className="mx-auto" style={{ width: Math.min(width, 1440) }}>
            <iframe
              ref={frameRef}
              key={`${src}-${viewport}`}
              src={src}
              title={`Storefront önizleme — ${mode === "draft" ? "taslak" : "yayın"}`}
              className="h-[640px] w-full rounded-md border border-slate-300 bg-white"
              style={{ width }}
            />
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        Önizleme gerçek demo verisini kullanır; müşteri verisi gösterilmez. Token kısa ömürlüdür ve production
        önbelleğinden bağımsızdır. PDP için PLP&apos;den bir ürüne tıklayın ya da yol alanına ürün adresini girin.
      </p>
    </div>
  );
}
