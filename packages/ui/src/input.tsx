import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";
import { fieldAria } from "./field-aria";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Hata metni — dolu oldugunda alan aria-invalid olur ve mesaj describedby ile baglanir. */
  error?: string | null;
  /** Yardimci metin — hata yokken gosterilir ve describedby ile baglanir. */
  hint?: string | null;
}

export function Input({ label, id, className, error, hint, required, ...props }: InputProps) {
  const aria = fieldAria(id, { error, hint, required });
  const control = (
    <input
      id={id}
      required={required}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
        error && "border-red-400 focus:border-red-500 focus:ring-red-100",
        className,
      )}
      {...aria.control}
      {...props}
    />
  );

  const messages =
    error && aria.errorId ? (
      <p id={aria.errorId} className="mt-1.5 text-xs text-red-600">
        {error}
      </p>
    ) : hint && aria.hintId ? (
      <p id={aria.hintId} className="mt-1.5 text-xs text-slate-500">
        {hint}
      </p>
    ) : null;

  if (!label) {
    return messages ? (
      <span className="block">
        {control}
        {messages}
      </span>
    ) : (
      control
    );
  }

  return (
    <label htmlFor={id} className="block">
      <span
        className={cn(
          "mb-1.5 block text-sm font-medium text-slate-700",
          // Zorunlu göstergesi CSS ::after ile (DOM text'ine girmez → etiket adı sade kalır).
          required && "after:ml-0.5 after:text-red-500 after:content-['*']",
        )}
      >
        {label}
      </span>
      {control}
      {messages}
    </label>
  );
}
