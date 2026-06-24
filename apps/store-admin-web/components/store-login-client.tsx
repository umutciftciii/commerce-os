"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, LanguageSwitcher, Spinner, useLocale } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { storeApi } from "../lib/client/api";
import { messageForError } from "../lib/client/messages";

type FormState = "checking" | "idle" | "submitting" | "redirecting";

/** Kabuk dışı, ortalanmış mağaza yöneticisi giriş ekranı. */
export function StoreLoginClient() {
  const router = useRouter();
  const locale = useLocale();
  const dict = getDictionary(locale);
  const store = dict.storeAdmin;
  const t = store.auth;

  const [formState, setFormState] = useState<FormState>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    storeApi
      .me()
      .then(() => {
        if (active) {
          setFormState("redirecting");
          router.replace("/");
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
      await storeApi.login(email, password);
      setFormState("redirecting");
      router.replace("/");
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
            {store.shell.brandName.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-lg font-semibold tracking-tightish text-slate-900">{t.title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t.subtitle}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-panel">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t.submitting : t.submit}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">{t.footnote}</p>
        <p className="mt-1 text-center text-xs text-slate-400">{t.demoNote}</p>
      </div>
    </main>
  );
}
