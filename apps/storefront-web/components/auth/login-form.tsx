"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, Input } from "../ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { loginAction } from "../../lib/server/auth-actions";

type AuthDict = StorefrontDictionary["auth"];

/** Giris kodlarini yerel mesaja esler (enumeration yaratmaz; jenerik geri donus). */
function loginMessage(code: string, t: AuthDict): string {
  if (code === "AUTH_RATE_LIMITED") return t.login.rateLimited;
  return t.login.error;
}

export function LoginForm({ t, next }: { t: AuthDict; next: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await loginAction(identifier, password, rememberMe);
      if (result.ok) {
        router.push(next);
        router.refresh();
      } else {
        setError(loginMessage(result.code, t));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Input
        label={t.emailOrPhone}
        id="login-identifier"
        name="identifier"
        autoComplete="username"
        placeholder={t.emailOrPhonePlaceholder}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
      />
      <div>
        <Input
          label={t.password}
          id="login-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="button"
          className="mt-1.5 text-xs font-medium text-ink-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
          onClick={() => setShowPassword((v) => !v)}
        >
          {showPassword ? t.passwordHide : t.passwordShow}
        </button>
      </div>
      <label className="flex items-start gap-2.5 text-sm text-ink-muted">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-line text-ink focus:ring-2 focus:ring-ink/40 focus:ring-offset-1"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        <span>
          <span className="font-medium text-ink">{t.rememberMe}</span>
          <span className="mt-0.5 block text-xs text-ink-muted">{t.rememberMeHint}</span>
        </span>
      </label>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t.submitting : t.login.submit}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        {t.login.noAccount}{" "}
        <Link
          href={`/auth/register?next=${encodeURIComponent(next)}`}
          className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
        >
          {t.login.registerCta}
        </Link>
      </p>
    </form>
  );
}
