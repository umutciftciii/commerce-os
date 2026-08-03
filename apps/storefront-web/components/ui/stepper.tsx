import { cn } from "@commerce-os/ui";

/**
 * TODO-169 — Vitrin iade sihirbazı adım göstergesi (editoryel kit).
 *
 * Erişilebilirlik (§18): sıralı `<ol>`, aktif adım `aria-current="step"`, tamamlanan
 * adımlar görünür işaret + gizli metinle (durum yalnız renkle anlatılmaz). Keskin
 * köşeler, uppercase mikro-etiket, ölçülü aksan — vitrinin editoryel diliyle konuşur.
 */
export interface StepDefinition {
  /** Kısa adım etiketi (uppercase gösterilir). */
  label: string;
}

export function Stepper({
  steps,
  current,
  ariaLabel,
  completedLabel,
  currentLabel,
  className,
}: {
  steps: StepDefinition[];
  /** 0-tabanlı aktif adım indeksi. */
  current: number;
  ariaLabel: string;
  /** Ekran okuyucu için "tamamlandı" gizli metni. */
  completedLabel: string;
  /** Ekran okuyucu için "geçerli adım" gizli metni. */
  currentLabel: string;
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {steps.map((step, index) => {
          const isCurrent = index === current;
          const isComplete = index < current;
          return (
            <li key={step.label} className="flex items-center gap-2">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wideish transition-colors",
                  isCurrent
                    ? "border-ink bg-ink text-surface"
                    : isComplete
                      ? "border-ink text-ink"
                      : "border-line text-ink-subtle",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-5 w-5 items-center justify-center border text-[11px] leading-none",
                    isCurrent
                      ? "border-surface"
                      : isComplete
                        ? "border-ink"
                        : "border-line",
                  )}
                >
                  {isComplete ? "✓" : index + 1}
                </span>
                <span>{step.label}</span>
                {isComplete ? <span className="sr-only">{completedLabel}</span> : null}
                {isCurrent ? <span className="sr-only">{currentLabel}</span> : null}
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden className="hidden h-px w-6 bg-line sm:block" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
