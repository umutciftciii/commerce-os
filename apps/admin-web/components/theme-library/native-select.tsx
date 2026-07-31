import type { SelectHTMLAttributes } from "react";

/**
 * TODO-164B Dilim 2 — Children (option) alan native select (ui Select `options` prop
 * ister; Designer'da dinamik/gruplu option'lar için native daha uygun). Marka odaklı stil.
 */
export function NativeSelect({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
