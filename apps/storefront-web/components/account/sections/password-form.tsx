"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Input } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { changePasswordAction } from "../../../lib/server/account-actions";

type AccountDict = StorefrontDictionary["account"];

function passwordValid(value: string): boolean {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

/** Şifre Değişikliği — mevcut şifre olmadan değiştirilemez (server da doğrular).
 * Başarılı değişiklikte oturum korunur (yeniden giriş istenmez); passwordChangedAt güncellenir. */
export function PasswordForm({ t }: { t: AccountDict }) {
  const p = t.password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (!passwordValid(next)) {
      setError(p.weak);
      return;
    }
    if (next !== confirm) {
      setError(p.mismatch);
      return;
    }
    startTransition(async () => {
      const result = await changePasswordAction({ currentPassword: current, newPassword: next });
      if (result.ok) {
        setDone(true);
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setError(result.code === "INVALID_CURRENT_PASSWORD" ? p.invalidCurrent : p.weak);
      }
    });
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
      <h1 className="text-xl font-semibold text-slate-900">{p.title}</h1>
      {done ? <Alert tone="success">{p.saved}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Input
        type="password"
        label={p.current}
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
      />
      <Input
        type="password"
        label={p.next}
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        required
      />
      <Input
        type="password"
        label={p.confirm}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />
      <p className="text-xs text-slate-400">{p.hint}</p>
      <Button type="submit" disabled={pending}>
        {pending ? p.saving : p.save}
      </Button>
    </form>
  );
}
