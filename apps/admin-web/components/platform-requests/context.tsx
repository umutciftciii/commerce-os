// TODO-178 (Faz C) — Bağlam (context) render'ı: ARBITRARY JSON dump YOK. Bilinen contextKind'ler
// için human-readable etiketli alanlar; bilinmeyen/eksik alanlarda güvenli fallback.

import { contextKindLabel } from "./labels";

export interface ContextSnapshot {
  label?: string;
  reference?: string;
  detail?: string;
}

export function RequestContext({
  contextKind,
  snapshot,
  locale,
}: {
  contextKind: string;
  snapshot: ContextSnapshot | null;
  locale: "tr" | "en";
}) {
  const hasSnapshot = snapshot && (snapshot.label || snapshot.reference || snapshot.detail);
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">{locale === "tr" ? "Bağlam türü" : "Context type"}:</span>
        <span className="font-medium">{contextKindLabel(contextKind, locale)}</span>
      </div>
      {contextKind === "NONE" || !hasSnapshot ? (
        <p className="text-slate-400">
          {locale === "tr" ? "Ek bağlam bilgisi verilmemiş." : "No additional context was provided."}
        </p>
      ) : (
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
          {snapshot?.label ? (
            <>
              <dt className="text-slate-500">{locale === "tr" ? "Konu" : "Subject"}</dt>
              <dd className="font-medium">{snapshot.label}</dd>
            </>
          ) : null}
          {snapshot?.reference ? (
            <>
              <dt className="text-slate-500">{locale === "tr" ? "Referans" : "Reference"}</dt>
              <dd className="font-mono text-xs">{snapshot.reference}</dd>
            </>
          ) : null}
          {snapshot?.detail ? (
            <>
              <dt className="text-slate-500">{locale === "tr" ? "Ayrıntı" : "Detail"}</dt>
              <dd className="whitespace-pre-wrap">{snapshot.detail}</dd>
            </>
          ) : null}
        </dl>
      )}
    </div>
  );
}
