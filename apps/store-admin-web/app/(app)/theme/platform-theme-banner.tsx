"use client";

import { useEffect, useState } from "react";
import { FIELD_LABELS, type CanonicalFieldPath } from "@commerce-os/theme";
import type { PlatformThemeStatusResponse } from "@commerce-os/api-client";
import { Alert, Badge } from "../../../components/ui";
import { storeApi } from "../../../lib/client/api";

/**
 * TODO-164B Dilim 2 (§12) — Store Admin Brand Customizer üstü platform teması durumu.
 * Aktif platform teması + current version + update-available + editable/locked alanlar +
 * "Platform tarafından yönetiliyor" bilgisi. Store Admin Platform Theme Designer
 * yetkilerine ERİŞEMEZ — bu banner SALT-OKUMA bilgilendirmedir.
 */
function labelFor(path: string): string {
  return FIELD_LABELS[path as CanonicalFieldPath]?.labelTr ?? path;
}

export function PlatformThemeBanner() {
  const [status, setStatus] = useState<PlatformThemeStatusResponse | null>(null);

  useEffect(() => {
    let active = true;
    storeApi
      .themePlatformStatus()
      .then((s) => active && setStatus(s))
      .catch(() => {
        /* sessizce yoksay — banner opsiyonel */
      });
    return () => {
      active = false;
    };
  }, []);

  if (!status || !status.managedByPlatform) return null;

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">Platform tarafından yönetiliyor</Badge>
        {status.templateName ? <span className="text-sm text-white/80">{status.templateName}</span> : null}
        <span className="text-xs text-white/50">
          Sürüm v{status.currentVersion ?? "?"}
          {status.templatePublishedVersion ? ` / yayın v${status.templatePublishedVersion}` : ""}
        </span>
        {status.updateAvailable ? (
          <Badge tone="warning">Yeni sürüm mevcut</Badge>
        ) : (
          <Badge tone="success">Güncel</Badge>
        )}
      </div>

      {status.updateAvailable ? (
        <Alert tone="info" className="mt-3">
          Bu tema için platform tarafından yeni bir sürüm yayınlandı. Güncelleme, platform yöneticisi tarafından
          kontrollü olarak uygulanır; mevcut görünümünüz otomatik değişmez.
        </Alert>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-emerald-300">Düzenleyebileceğiniz alanlar</p>
          <div className="flex flex-wrap gap-1">
            {status.editableFields.length === 0 ? (
              <span className="text-xs text-white/40">Yok</span>
            ) : (
              status.editableFields.map((f) => (
                <span key={f} className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/70">
                  {labelFor(f)}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-white/50">Platform tarafından kilitli</p>
          <div className="flex flex-wrap gap-1">
            {status.lockedFields.length === 0 ? (
              <span className="text-xs text-white/40">Yok</span>
            ) : (
              status.lockedFields.map((f) => (
                <span key={f} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-white/40">
                  {labelFor(f)}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
