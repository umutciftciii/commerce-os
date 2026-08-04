"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, LanguageSwitcher, Spinner, useLocale } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { adminApi } from "../lib/client/api";
import { messageForError } from "../lib/client/messages";
import { safeInternalPath } from "../lib/safe-path";

type FormState = "checking" | "idle" | "submitting" | "redirecting";

/** Kabuk disi, ortalanmis platform admin giris ekrani. */
export function LoginClientPage() {
  const router = useRouter();
  const locale = useLocale();
  const dict = getDictionary(locale);
  const admin = dict.admin;
  const t = admin.auth;

  const [formState, setFormState] = useState<FormState>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ADR-271 — oturum sona erdi bildirimi (idle/absolute expiry sonrası).
  const [notice, setNotice] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState("/");

  // ADR-271 — güvenli returnTo + expired reason (URL'den; open-redirect savunması).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(safeInternalPath(params.get("returnTo"), "/"));
    if (params.get("reason") === "expired") {
      setNotice(admin.session.expiredMessage);
    }
  }, [admin.session.expiredMessage]);

  useEffect(() => {
    let active = true;
    adminApi
      .me()
      .then(() => {
        if (active) {
          setFormState("redirecting");
          router.replace(safeInternalPath(new URLSearchParams(window.location.search).get("returnTo"), "/"));
        }
      })
      .catch(() => {
        if (active) setFormState("idle");
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.includes("@")) {
      setError(t.requiredEmail);
      return;
    }
    if (password.length === 0) {
      setError(t.requiredPassword);
      return;
    }

    setFormState("submitting");
    try {
      await adminApi.login(email, password, rememberMe);
      setFormState("redirecting");
      router.replace(returnTo);
    } catch (caught) {
      setError(messageForError(caught, locale));
      setFormState("idle");
    }
  }

  if (formState === "checking" || formState === "redirecting") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label={formState === "checking" ? t.checking : t.redirecting} />
      </main>
    );
  }

  const busy = formState === "submitting";

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher value={locale} labels={dict.common.language} />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white shadow-card ring-1 ring-brand-700/20">
            {admin.shell.brandName.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-lg font-semibold tracking-tightish text-slate-900">{t.title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t.subtitle}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-panel">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {notice ? <Alert tone="warning">{notice}</Alert> : null}
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Input
              id="email"
              type="email"
              label={t.emailLabel}
              placeholder={t.emailPlaceholder}
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              required
            />
            <Input
              id="password"
              type="password"
              label={t.passwordLabel}
              placeholder={t.passwordPlaceholder}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              required
            />
            <label className="flex items-start gap-2.5 text-sm text-slate-600">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500 focus:ring-offset-1"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                disabled={busy}
              />
              <span>
                <span className="font-medium text-slate-700">{t.rememberMe}</span>
                <span className="mt-0.5 block text-xs text-slate-400">{t.rememberMeHint}</span>
              </span>
            </label>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t.submitting : t.submit}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">{t.footnote}</p>
      </div>
    </main>
  );
}
