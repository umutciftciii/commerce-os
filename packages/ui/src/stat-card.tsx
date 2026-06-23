import type { ReactNode } from "react";
import { Badge } from "./badge";
import { Card } from "./card";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  badge?: string;
  /** Sag ust kosedeki rozetin tonu (varsayilan: notr). */
  badgeTone?: "neutral" | "success" | "warning" | "info";
  /** Etiketin solunda gosterilen istege bagli ikon. */
  icon?: ReactNode;
}

/** Panolar icin kompakt KPI karti. Yer tutucu dostu (deger "—" olabilir). */
export function StatCard({ label, value, hint, badge, badgeTone = "neutral", icon }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
              {icon}
            </span>
          ) : null}
          <p className="text-sm font-medium text-slate-500">{label}</p>
        </div>
        {badge ? (
          <Badge tone={badgeTone} dot={badgeTone !== "neutral"}>
            {badge}
          </Badge>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tightish text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </Card>
  );
}
