import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@commerce-os/ui";

/**
 * TODO-169 — Erişilebilir onay kutusu + radyo (editoryel kit). Vitrinde bugüne
 * kadar checkbox/radio primitive'i YOKTU; iade sihirbazı (satır seçimi, çözüm
 * seçimi) için burada tek yerde tanımlanır.
 *
 * Erişilebilirlik (§18): GERÇEK native `<input>` (klavye + ekran okuyucu doğal),
 * görünür `focus-visible` halkası, etiket tıklanabilir, `aria-describedby` opsiyonel.
 * Görsel işaret keskin köşeli kutu/nokta; durum yalnız renkle değil işaretle anlatılır.
 */

type BaseChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label: ReactNode;
  /** Etiketin altında ikincil açıklama (opsiyonel). */
  description?: ReactNode;
  className?: string;
};

// Native kontrol; `accent-ink` ile tema mürekkebine boyanır (tarayıcı işaret/nokta
// çizer → durum garanti görünür, salt renk değil). Görünür focus-visible halkası.
const controlBase =
  "mt-0.5 h-4 w-4 shrink-0 accent-ink focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper " +
  "disabled:cursor-not-allowed disabled:opacity-40";

function Choice({
  type,
  label,
  description,
  className,
  id,
  ...props
}: BaseChoiceProps & { type: "checkbox" | "radio" }) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 text-sm text-ink",
        props.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input id={id} type={type} className={controlBase} {...props} />
      <span className="min-w-0 space-y-0.5">
        <span className="block leading-snug">{label}</span>
        {description ? (
          <span className="block text-xs leading-relaxed text-ink-subtle">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

export function Checkbox(props: BaseChoiceProps) {
  return <Choice type="checkbox" {...props} />;
}

export function Radio(props: BaseChoiceProps) {
  return <Choice type="radio" {...props} />;
}
