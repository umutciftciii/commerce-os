import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** Centered max-width content wrapper used by the public storefront shell. */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />
  );
}
