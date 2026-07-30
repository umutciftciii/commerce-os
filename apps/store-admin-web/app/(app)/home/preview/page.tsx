"use client";

/**
 * TODO-162 (TD-152) — Keşif önizleme (eligibility simülasyonu). Mağaza yöneticisine, yapılandırdığı keşif
 * bölümlerinin farklı ziyaretçi durumlarında NASIL davranacağını ÖRNEK sinyallerle gösterir. Gerçek müşteri
 * verisi KULLANMAZ; nihai kararı sunucu verir (bkz. discovery-preview-logic.ts). Salt-okunur.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  SectionCard,
  Select,
  SkeletonRows,
  useLocale,
} from "../../../../components/ui";
import { HomeIcon } from "../../../../components/icons";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { homeLabels, type HomeLocale } from "../labels";
import {
  SCENARIO_ORDER,
  SCENARIO_PRESETS,
  evaluateSection,
  isDiscoveryType,
  type EvaluatedSection,
  type ScenarioKey,
} from "./discovery-preview-logic";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sections: { id: string; type: string; enabled: boolean; title: string | null; config: unknown }[] };

export default function DiscoveryPreviewPage() {
  const locale = useLocale() as HomeLocale;
  const t = homeLabels(locale);
  const p = t.preview;
  const router = useRouter();

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [scenario, setScenario] = useState<ScenarioKey>("guestNoSignal");

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listHomeSections();
      setState({
        status: "ready",
        sections: result.data.map((s) => ({ id: s.id, type: s.type, enabled: s.enabled, title: s.title, config: s.config })),
      });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const signals = SCENARIO_PRESETS[scenario];

  const evaluated = useMemo<EvaluatedSection[]>(() => {
    if (state.status !== "ready") return [];
    return state.sections.filter((s) => isDiscoveryType(s.type)).map((s) => evaluateSection(s, signals));
  }, [state, signals]);

  const rendered = evaluated.filter((e) => e.rendered);
  const hidden = evaluated.filter((e) => !e.rendered);
  const hasDiscovery = evaluated.length > 0;

  const reasonLabel = (reason: EvaluatedSection["reason"]): string => {
    switch (reason) {
      case "eligible":
        return p.reasonEligible;
      case "noSignal":
        return p.reasonNoSignal;
      case "requiresAuth":
        return p.reasonRequiresAuth;
      case "disabled":
        return p.reasonDisabled;
      case "editorialIncomplete":
        return p.reasonEditorialIncomplete;
      case "gridInsufficient":
        return p.reasonGridInsufficient;
      case "dependsCatalog":
        return p.reasonDependsCatalog;
      default:
        return reason;
    }
  };

  const typeLabel = (type: string) => t.types[type] ?? type;

  return (
    <>
      <PageHeader
        eyebrow={p.eyebrow}
        title={p.title}
        description={p.description}
        actions={
          <Button variant="secondary" onClick={() => router.push("/home")}>
            {p.back}
          </Button>
        }
      />

      <div className="mb-4">
        <Alert tone="warning">{p.disclaimer}</Alert>
      </div>

      <SectionCard title={p.scenarioLabel} icon={<HomeIcon />}>
        {state.status === "loading" ? <SkeletonRows rows={3} /> : null}
        {state.status === "error" ? (
          <Alert
            tone="error"
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {t.retry}
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}

        {state.status === "ready" ? (
          <div className="space-y-6">
            <Select
              id="preview-scenario"
              label={p.scenarioLabel}
              value={scenario}
              onChange={(e) => setScenario(e.target.value as ScenarioKey)}
              options={SCENARIO_ORDER.map((key) => ({ value: key, label: p.scenarios[key] }))}
            />

            <div className="rounded border border-white/10 bg-white/[0.02] p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">{p.signalsLabel}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-white/70 sm:grid-cols-3">
                <span>{p.signalAuth}: <span className="text-white/90">{signals.isAuthenticated ? p.authYes : p.authNo}</span></span>
                <span>{p.signalRecentlyViewed}: <span className="text-white/90">{signals.recentlyViewedCount}</span></span>
                <span>{p.signalCart}: <span className="text-white/90">{signals.cartItemCount}</span></span>
                <span>{p.signalWishlist}: <span className="text-white/90">{signals.wishlistItemCount}</span></span>
                <span>{p.signalOrders}: <span className="text-white/90">{signals.completedOrderCount}</span></span>
              </div>
            </div>

            {!hasDiscovery ? (
              <p className="text-sm text-white/50">{p.noDiscoverySections}</p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-medium text-emerald-300">
                    {p.renderedTitle} ({rendered.length})
                  </p>
                  {rendered.length === 0 ? (
                    <p className="text-sm text-white/40">{p.noneRendered}</p>
                  ) : (
                    <ul className="space-y-2">
                      {rendered.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 rounded border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
                          <span className="text-sm text-white/85">{typeLabel(e.type)}</span>
                          <Badge tone={e.reason === "dependsCatalog" ? "neutral" : "success"}>{reasonLabel(e.reason)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-white/50">
                    {p.hiddenTitle} ({hidden.length})
                  </p>
                  {hidden.length === 0 ? (
                    <p className="text-sm text-white/40">—</p>
                  ) : (
                    <ul className="space-y-2">
                      {hidden.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 rounded border border-white/10 px-3 py-2">
                          <span className="text-sm text-white/60">{typeLabel(e.type)}</span>
                          <Badge tone="neutral">{reasonLabel(e.reason)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </SectionCard>
    </>
  );
}
