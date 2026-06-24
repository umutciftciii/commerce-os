"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, EmptyState, PageHeader, SectionCard, SkeletonRows, useLocale } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { HealthIcon } from "../../../components/icons";
import { adminApi, type InternalProbe, type SystemHealth, type SystemInternal } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type HealthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; health: SystemHealth };

function probeTone(probe: InternalProbe): "success" | "warning" | "neutral" {
  if (probe === "ok") return "success";
  if (probe === "degraded") return "warning";
  return "neutral";
}

export default function SystemHealthPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.admin.systemHealth;
  const c = dict.common;
  const components = t.components;

  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [internal, setInternal] = useState<SystemInternal | null>(null);

  const load = useCallback(async () => {
    setHealth({ status: "loading" });
    setInternal(null);
    try {
      const [healthResult, internalResult] = await Promise.all([
        adminApi.systemHealth(),
        adminApi.systemInternal().catch(() => ({ available: false }) as SystemInternal),
      ]);
      setHealth({ status: "ready", health: healthResult });
      setInternal(internalResult);
    } catch (error) {
      setHealth({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = health.status === "ready" ? health.health : null;
  const gatewayOk = ready?.health.status === "ok";

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        breadcrumb={t.breadcrumb}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={health.status === "loading"}>
            {t.refresh}
          </Button>
        }
      />

      <SectionCard
        title={t.cardTitle}
        description={ready ? `${t.cardDescriptionPrefix} ${ready.gatewayUrl}` : t.cardDescriptionPrefix}
        icon={<HealthIcon />}
        actions={ready ? <Badge tone="success">{c.status.live}</Badge> : null}
      >
        {health.status === "loading" ? <SkeletonRows rows={3} /> : null}

        {health.status === "error" ? (
          <Alert
            tone="error"
            title={t.loadError}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {c.actions.retry}
              </Button>
            }
          >
            {health.message}
          </Alert>
        ) : null}

        {ready ? (
          <ul className="divide-y divide-slate-100">
            <HealthRow
              name={components.gatewayName}
              detail={components.gatewayDetail}
              badge={
                <Badge tone={gatewayOk ? "success" : "warning"} dot>
                  {gatewayOk ? c.status.ok : c.status.degraded}
                </Badge>
              }
            />
            <li className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{t.serviceLabel}</p>
                <p className="text-xs text-slate-500">{ready.version.service}</p>
              </div>
              <span className="font-mono text-xs text-slate-500">
                {t.versionLabel} {ready.version.version}
              </span>
            </li>
            <HealthRow
              name={components.databaseName}
              detail={components.databaseDetail}
              badge={<InternalBadge internal={internal} pick={(i) => i.db} />}
            />
            <HealthRow
              name={components.redisName}
              detail={components.redisDetail}
              badge={<InternalBadge internal={internal} pick={(i) => i.redis} />}
            />
          </ul>
        ) : null}
      </SectionCard>

      {internal && internal.available === false ? (
        <div className="mt-6">
          <EmptyState
            tag={t.internalRequiredTag}
            title={t.internalRequiredTitle}
            description={t.internalRequiredDescription}
            icon={<HealthIcon />}
          />
        </div>
      ) : null}
    </>
  );
}

function HealthRow({
  name,
  detail,
  badge,
}: {
  name: string;
  detail: string;
  badge: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{name}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      {badge}
    </li>
  );
}

function InternalBadge({
  internal,
  pick,
}: {
  internal: SystemInternal | null;
  pick: (value: { db: InternalProbe; redis: InternalProbe }) => InternalProbe;
}) {
  const dict = getDictionary(useLocale());
  const c = dict.common;
  if (!internal || internal.available === false) {
    return <Badge tone="neutral">{c.status.pending}</Badge>;
  }
  const probe = pick(internal);
  const label = probe === "ok" ? c.status.ok : probe === "degraded" ? c.status.degraded : c.status.unknown;
  return (
    <Badge tone={probeTone(probe)} dot={probe !== "unknown"}>
      {label}
    </Badge>
  );
}
