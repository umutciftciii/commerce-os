import type { ReactNode } from "react";
import { Badge } from "./badge";
import { Card } from "./card";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  badge?: string;
}

/** Compact KPI tile for dashboards. Placeholder-friendly (value can be "—"). */
export function StatCard({ label, value, hint, badge }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {badge ? <Badge tone="neutral">{badge}</Badge> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </Card>
  );
}
