import { cloneElement, isValidElement } from "react";
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactElement,
  ReactNode,
} from "react";
import { cn, fieldAria } from "@commerce-os/ui";

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

/**
 * Alan sarmalama ortak mantigi: `label` verilirse editoryel `Field`'a sarar
 * (uppercase kucuk etiket + C1 erisilebilirlik: aria-invalid/describedby); yoksa
 * ciplak kontrolu dondurur (mevcut `<Field><Input/></Field>` kullanimi bozulmaz).
 */
type FieldExtras = { label?: string; hint?: string; error?: string; id?: string; required?: boolean };

function withField(label: string | undefined, extras: Omit<FieldExtras, "label">, control: ReactElement) {
  if (!label) return control;
  return (
    <Field label={label} htmlFor={extras.id} hint={extras.hint} error={extras.error} required={extras.required}>
      {control}
    </Field>
  );
}

export function Input({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) {
  return withField(
    label,
    { hint, error, id: props.id, required: props.required },
    <input className={cn(controlBase, "h-11", className)} {...props} />,
  );
}

export function Textarea({
  label,
  hint,
  error,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; error?: string }) {
  return withField(
    label,
    { hint, error, id: props.id, required: props.required },
    <textarea className={cn(controlBase, "min-h-24 py-2.5", className)} {...props} />,
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  label,
  hint,
  error,
  className,
  options,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
  options?: SelectOption[];
}) {
  return withField(
    label,
    { hint, error, id: props.id, required: props.required },
    <select className={cn(controlBase, "h-11 appearance-none pr-9", className)} {...props}>
      {options
        ? options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))
        : children}
    </select>,
  );
}

/**
 * Etiket + opsiyonel yardim/hata metni saran alan.
 *
 * Erisilebilirlik (C1): `htmlFor` verildiginde tek cocuk kontrol klonlanir ve
 * `aria-invalid` / `aria-describedby` / `aria-required` otomatik baglanir; hata
 * ve yardim metni id'li render edilir. Boylece ekran okuyucu, alana odaklaninca
 * hata mesajini alanla birlikte okur.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const aria = fieldAria(htmlFor, { error, hint, required });
  const childProps = isValidElement(children)
    ? (children.props as { id?: string; className?: string })
    : {};
  const control =
    isValidElement(children) && htmlFor
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          ...aria.control,
          // Zaten belirtilmemisse alan id'sini uygula (label esleme + describedby).
          id: childProps.id ?? htmlFor,
          className: cn(
            error && "border-red-500 focus:border-red-600 focus:ring-red-500",
            childProps.className,
          ),
        })
      : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className={cn(
          "block text-[11px] font-medium uppercase tracking-wideish text-ink-muted",
          // Zorunlu göstergesi CSS ::after ile (DOM text'ine girmez → etiket adı sade kalır).
          required && "after:ml-0.5 after:text-red-600 after:content-['*']",
        )}
      >
        {label}
      </label>
      {control}
      {error && aria.errorId ? (
        <p id={aria.errorId} className="text-xs text-red-600">
          {error}
        </p>
      ) : hint && aria.hintId ? (
        <p id={aria.hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
