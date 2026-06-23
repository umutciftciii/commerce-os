export type ClassValue = string | number | null | false | undefined;

/** Minimal, dependency-free className joiner (drops falsy values). */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
