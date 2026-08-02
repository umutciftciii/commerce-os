import type { SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { fieldAria } from "./field-aria";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string | null;
  hint?: string | null;
}

function FieldMessage({
  error,
  hint,
  errorId,
  hintId,
}: {
  error?: string | null;
  hint?: string | null;
  errorId?: string;
  hintId?: string;
}) {
  if (error && errorId)
    return (
      <p id={errorId} className="mt-1.5 text-xs text-red-600">
        {error}
      </p>
    );
  if (hint && hintId)
    return (
      <p id={hintId} className="mt-1.5 text-xs text-slate-500">
        {hint}
      </p>
    );
  return null;
}

/** Etiketli, marka odakli native secim alani. */
export function Select({
  label,
  id,
  className,
  options,
  error,
  hint,
  required,
  ...props
}: SelectProps) {
  const aria = fieldAria(id, { error, hint, required });
  const control = (
    <select
      id={id}
      required={required}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
        error && "border-red-400 focus:border-red-500 focus:ring-red-100",
        className,
      )}
      {...aria.control}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const messages = (
    <FieldMessage error={error} hint={hint} errorId={aria.errorId} hintId={aria.hintId} />
  );

  if (!label)
    return (
      <span className="block">
        {control}
        {messages}
      </span>
    );

  return (
    <label htmlFor={id} className="block">
      <span
        className={cn(
          "mb-1.5 block text-sm font-medium text-slate-700",
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

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | null;
  hint?: string | null;
}

/** Etiketli cok satirli metin alani; Input ile ayni gorsel dil. */
export function Textarea({ label, id, className, error, hint, required, ...props }: TextareaProps) {
  const aria = fieldAria(id, { error, hint, required });
  const control = (
    <textarea
      id={id}
      required={required}
      className={cn(
        "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
        error && "border-red-400 focus:border-red-500 focus:ring-red-100",
        className,
      )}
      {...aria.control}
      {...props}
    />
  );

  const messages = (
    <FieldMessage error={error} hint={hint} errorId={aria.errorId} hintId={aria.hintId} />
  );

  if (!label)
    return (
      <span className="block">
        {control}
        {messages}
      </span>
    );

  return (
    <label htmlFor={id} className="block">
      <span
        className={cn(
          "mb-1.5 block text-sm font-medium text-slate-700",
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
