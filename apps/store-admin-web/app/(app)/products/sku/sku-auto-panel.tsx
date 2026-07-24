"use client";

// TODO-160A (ADR-109…113) — "Otomatik SKU" bölümü (deterministik varyant SKU governance).
//
// Kullanıcı önizler → sunucudan deterministik öneri gelir (yalnız-okuma; hiçbir varyant yazılmaz).
// Tablo her varyantın mevcut → önerilen SKU'sunu, değişim/çakışma/korumalı (MANUAL) durumunu gösterir.
// "Yeniden Üret" yalnız değişen non-protected SKU'ları yazar (server-authoritative, tek transaction,
// AuditLog). Manuel/imported SKU'lar `onlyAutoSource` (varsayılan) açıkken KORUNUR; "force" ile ezilir.
// Yalnız kaydedilmiş ürün + eksen varsa görünür (product-form `visible` ile kontrol eder).

import { useCallback, useState } from "react";
import { Alert, Badge, Button, Spinner } from "../../../../components/ui";
import { storeApi } from "../../../../lib/client/api";
import type { SkuPreviewResponse, SkuPreviewRow } from "@commerce-os/api-client";

const ISSUE_LABELS: Record<string, string> = {
  SKU_EMPTY: "Boş",
  SKU_INVALID_CHARS: "Geçersiz karakter",
  SKU_TOO_LONG: "Çok uzun",
  SKU_OPAQUE: "Opak (eski sistem)",
  BARCODE_EQUALS_SKU: "Barkod = SKU",
};

const SOURCE_LABELS: Record<string, string> = {
  AUTO: "Otomatik",
  MANUAL: "Manuel",
  IMPORTED: "İçe aktarma",
};

function SkuRow({ row }: { row: SkuPreviewRow }) {
  return (
    <tr className="border-t border-white/[0.06]">
      <td className="py-2 pr-3 align-top">
        <div className="font-mono text-xs text-white/70">{row.currentSku || "—"}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge tone={row.skuSource === "AUTO" ? "info" : "neutral"}>
            {SOURCE_LABELS[row.skuSource] ?? row.skuSource}
          </Badge>
          {row.issues.map((code) => (
            <Badge key={code} tone="warning">
              {ISSUE_LABELS[code] ?? code}
            </Badge>
          ))}
        </div>
      </td>
      <td className="py-2 pl-3 align-top">
        {row.protected ? (
          <span className="text-xs text-white/40">korunuyor (manuel)</span>
        ) : (
          <div
            className={`font-mono text-xs ${row.changed ? "text-emerald-300" : "text-white/50"}`}
          >
            {row.suggestedSku}
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {row.collision ? <Badge tone="danger">çakışma çözüldü</Badge> : null}
          {row.protected ? <Badge tone="neutral">korumalı</Badge> : null}
          {!row.protected && row.changed ? <Badge tone="success">değişecek</Badge> : null}
        </div>
      </td>
    </tr>
  );
}

export function SkuAutoPanel({ visible, productId }: { visible: boolean; productId: string }) {
  const [onlyAutoSource, setOnlyAutoSource] = useState(true);
  const [force, setForce] = useState(false);
  const [preview, setPreview] = useState<SkuPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ updated: number; skipped: number } | null>(null);

  const body = { onlyAutoSource: force ? false : onlyAutoSource, force };

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setApplied(null);
    try {
      setPreview(await storeApi.previewSku(productId, body));
    } catch (e) {
      setError(e instanceof Error ? e.message : "SKU önizleme başarısız.");
    } finally {
      setLoading(false);
    }  }, [productId, onlyAutoSource, force]);

  const runRegenerate = useCallback(async () => {
    setApplying(true);
    setError(null);
    try {
      const res = await storeApi.regenerateSku(productId, body);
      setApplied({ updated: res.updated, skipped: res.skipped });
      setPreview({ rows: res.rows, counts: preview?.counts ?? { total: res.rows.length, changed: 0, collisions: 0, protectedCount: 0 } });
      // Uygulama sonrası taze önizleme (mevcut = yeni).
      setPreview(await storeApi.previewSku(productId, body));
    } catch (e) {
      setError(e instanceof Error ? e.message : "SKU yeniden üretme başarısız.");
    } finally {
      setApplying(false);
    }  }, [productId, onlyAutoSource, force]);

  if (!visible) return null;

  const changed = preview?.counts.changed ?? 0;

  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-indigo-500/150" />
        <div>
          <h3 className="text-sm font-semibold text-white/90">Otomatik SKU</h3>
          <p className="mt-0.5 text-xs text-white/45">
            Deterministik SKU önerisi ({"{ürün}-{seçenekler}"}). Manuel SKU'lar varsayılan olarak korunur;
            barkoddan ayrı bir kavramdır.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-white/70">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyAutoSource}
            disabled={force}
            onChange={(e) => setOnlyAutoSource(e.target.checked)}
          />
          Yalnız otomatik SKU'ları yeniden üret
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Manuel SKU'ları da ez (force)
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={runPreview} disabled={loading || applying}>
          {loading ? <Spinner size="sm" /> : null}
          Önizle
        </Button>
        <Button variant="primary" onClick={runRegenerate} disabled={applying || loading || !preview || changed === 0}>
          {applying ? <Spinner size="sm" /> : null}
          Yeniden Üret{changed > 0 ? ` (${changed})` : ""}
        </Button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {applied ? (
        <Alert tone="success">
          {applied.updated} SKU güncellendi, {applied.skipped} atlandı.
        </Alert>
      ) : null}

      {preview ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-white/35">
                <th className="pb-1 pr-3 font-semibold">Mevcut</th>
                <th className="pb-1 pl-3 font-semibold">Önerilen</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <SkuRow key={row.variantId} row={row} />
              ))}
            </tbody>
          </table>
          {preview.rows.length === 0 ? (
            <p className="py-3 text-xs text-white/40">Bu üründe varyant yok.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
