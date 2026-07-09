import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@commerce-os/ui";

/**
 * Vitrin form elemanlari (ADIM 1). Premium/minimal: hairline cerceve, keskin
 * koseler, aksan focus halkasi. ADIM 1'de bu bilesenler EK'tir — mevcut
 * checkout/auth form mantigina DOKUNULMAZ; ileriki adimlarda kademeli baglanir.
 *
 * Not: yerel bir <label>/aciklama sarmalayici (Field) da sunulur; erisilebilirlik
 * icin `htmlFor`/`id` esleme cagiran tarafin sorumlulugundadir.
 */

const controlBase =
  "w-full rounded-none border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlBase, "min-h-24 py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlBase, "h-11 appearance-none pr-9", className)} {...props}>
      {children}
    </select>
  );
}

/** Etiket + opsiyonel yardim/hata metni saran alan. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-medium uppercase tracking-wideish text-ink-muted"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
