"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, Input } from "@commerce-os/ui";
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await loginAction(identifier, password);
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
          className="mt-1.5 text-xs font-medium text-brand-700 hover:text-brand-800"
          onClick={() => setShowPassword((v) => !v)}
        >
          {showPassword ? t.passwordHide : t.passwordShow}
        </button>
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t.submitting : t.login.submit}
      </Button>
      <p className="text-center text-sm text-slate-600">
        {t.login.noAccount}{" "}
        <Link
          href={`/auth/register?next=${encodeURIComponent(next)}`}
          className="font-medium text-brand-700 hover:text-brand-800"
        >
          {t.login.registerCta}
        </Link>
      </p>
    </form>
  );
}
