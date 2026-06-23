import { cn } from "./cn";

export interface SkeletonProps {
  className?: string;
}

/** Tek bir yukleme bloklu placeholder cizgisi. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-slate-100", className)} />;
}

export interface SkeletonRowsProps {
  /** Kac satir gosterilecegi. */
  rows?: number;
  className?: string;
}

/** Liste/tablo yuklemesi icin yinelenen iskelet satirlari. */
export function SkeletonRows({ rows = 4, className }: SkeletonRowsProps) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
