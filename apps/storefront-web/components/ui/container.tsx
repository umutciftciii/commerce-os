import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@commerce-os/ui";

/**
 * Disiplinli genis grid kabi. Tutarli gutter (mobil 20px → desktop 48px) ve
 * 1440px azami genislik; tum vitrin section'lari ayni hizada nefes alir.
 */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mx-auto w-full max-w-grid px-5 sm:px-8 lg:px-12", className)} {...props} />
  );
}

type SectionProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  /** Dikey ritim: premium bol beyaz alan. */
  spacing?: "sm" | "md" | "lg";
};

const spacingMap: Record<NonNullable<SectionProps["spacing"]>, string> = {
  sm: "py-12 sm:py-16",
  md: "py-16 sm:py-20 lg:py-24",
  lg: "py-20 sm:py-28 lg:py-32",
};

/** Standart dikey ritimli vitrin bolumu. */
export function Section({ as: Tag = "section", spacing = "md", className, ...props }: SectionProps) {
  return <Tag className={cn(spacingMap[spacing], className)} {...props} />;
}
