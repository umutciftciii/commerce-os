"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Button, Input } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { activateAction } from "../../lib/server/auth-actions";

type AuthDict = StorefrontDictionary["auth"];

/** Aktivasyon hata kodlarini yerel mesaja esler. */
function activateMessage(code: string, t: AuthDict): string {
  if (code === "VALIDATION_ERROR") return t.activate.passwordRules;
  if (code === "INVALID_TOKEN") return t.activate.invalidToken;
  return t.activate.error;
}

export function ActivateForm({ t, token }: { t: AuthDict; token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // Token yoksa link bozuk/eksik; form gösterilmez.
  if (!token) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{t.activate.missingToken}</Alert>
        <Link
          href="/auth/login"
          className="inline-block text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          {t.activate.backToLogin}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t.activate.success}</Alert>
        <Link
          href="/auth/login"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
        >
          {t.activate.backToLogin}
        </Link>
      </div>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t.activate.passwordRules);
      return;
    }
    if (password !== confirm) {
      setError(t.activate.mismatch);
      return;
    }
    startTransition(async () => {
      const result = await activateAction(token, password);
      if (result.ok) {
        setDone(true);
      } else {
        setError(activateMessage(result.code, t));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div>
        <Input
          label={t.activate.password}
          id="activate-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="mt-1.5 text-xs text-slate-500">{t.activate.passwordRules}</p>
        <button
          type="button"
          className="mt-1 text-xs font-medium text-brand-700 hover:text-brand-800"
          onClick={() => setShowPassword((v) => !v)}
        >
          {showPassword ? t.passwordHide : t.passwordShow}
        </button>
      </div>
      <Input
        label={t.activate.confirmPassword}
        id="activate-confirm"
        name="confirm"
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t.submitting : t.activate.submit}
      </Button>
    </form>
  );
}
