"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, Input } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import { classifyIdentifier } from "@commerce-os/api-client";
import {
  registerCompleteAction,
  registerStartAction,
  registerVerifyAction,
} from "../../lib/server/auth-actions";

type AuthDict = StorefrontDictionary["auth"];
type Step = "identifier" | "otp" | "profile";

/** Gateway hata kodunu yerel mesaja esler. */
function errorMessage(code: string, t: AuthDict): string {
  const map: Record<string, string> = {
    INVALID_IDENTIFIER: t.errors.invalidIdentifier,
    INVALID_OTP: t.errors.invalidOtp,
    OTP_EXPIRED: t.errors.otpExpired,
    OTP_TOO_MANY_ATTEMPTS: t.errors.otpTooMany,
    OTP_COOLDOWN: t.errors.otpCooldown,
    ACCOUNT_ALREADY_REGISTERED: t.errors.alreadyRegistered,
    VALIDATION_ERROR: t.errors.weakPassword,
  };
  return map[code] ?? t.errors.generic;
}

function passwordValid(value: string): boolean {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

export function RegisterFlow({ t, next }: { t: AuthDict; next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [channel, setChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [maskedDestination, setMaskedDestination] = useState("");
  const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [kvkk, setKvkk] = useState(false);
  const [clarification, setClarification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startOtp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (classifyIdentifier(identifier).type === "invalid") {
      setError(t.errors.invalidIdentifier);
      return;
    }
    startTransition(async () => {
      const result = await registerStartAction(identifier);
      if (result.ok) {
        setChannel(result.data.channel);
        setMaskedDestination(result.data.maskedDestination);
        setStep("otp");
      } else {
        setError(errorMessage(result.code, t));
      }
    });
  }

  function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^[0-9]{6}$/.test(code)) {
      setError(t.errors.invalidOtp);
      return;
    }
    startTransition(async () => {
      const result = await registerVerifyAction(identifier, code);
      if (result.ok) {
        setStep("profile");
      } else {
        setError(errorMessage(result.code, t));
      }
    });
  }

  function resend() {
    setError(null);
    startTransition(async () => {
      const result = await registerStartAction(identifier);
      if (!result.ok) setError(errorMessage(result.code, t));
    });
  }

  function complete(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError(t.errors.generic);
      return;
    }
    if (!passwordValid(password)) {
      setError(t.errors.weakPassword);
      return;
    }
    if (!kvkk || !clarification) {
      setError(t.errors.consentRequired);
      return;
    }
    startTransition(async () => {
      const result = await registerCompleteAction({
        identifier,
        code,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
        kvkkConsent: kvkk,
        clarificationConsent: clarification,
      });
      if (result.ok) {
        router.push(next);
        router.refresh();
      } else {
        setError(errorMessage(result.code, t));
      }
    });
  }

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {step === "identifier" ? (
        <form onSubmit={startOtp} className="space-y-4" noValidate>
          <p className="text-sm text-slate-600">{t.register.step1Subtitle}</p>
          <Input
            label={t.emailOrPhone}
            id="register-identifier"
            name="identifier"
            placeholder={t.emailOrPhonePlaceholder}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t.submitting : t.register.step1Submit}
          </Button>
          <p className="text-center text-sm text-slate-600">
            {t.register.haveAccount}{" "}
            <Link
              href={`/auth/login?next=${encodeURIComponent(next)}`}
              className="font-medium text-brand-700 hover:text-brand-800"
            >
              {t.register.loginCta}
            </Link>
          </p>
        </form>
      ) : null}

      {step === "otp" ? (
        <form onSubmit={verifyOtp} className="space-y-4" noValidate>
          <p className="text-sm text-slate-600">
            {channel === "EMAIL" ? t.register.otpSubtitleEmail : t.register.otpSubtitleSms}
          </p>
          <p className="text-xs text-slate-500">
            {format(t.register.sentTo, { destination: maskedDestination })}
          </p>
          <Input
            label={t.register.otpLabel}
            id="register-otp"
            name="code"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t.submitting : t.register.otpVerify}
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="font-medium text-slate-500 hover:text-slate-700"
              onClick={() => setStep("identifier")}
            >
              {t.register.back}
            </button>
            <button
              type="button"
              className="font-medium text-brand-700 hover:text-brand-800"
              onClick={resend}
              disabled={pending}
            >
              {t.register.otpResend}
            </button>
          </div>
        </form>
      ) : null}

      {step === "profile" ? (
        <form onSubmit={complete} className="space-y-4" noValidate>
          <p className="text-sm text-slate-600">{t.register.profileTitle}</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t.register.firstName}
              id="register-firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <Input
              label={t.register.lastName}
              id="register-lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
          <div>
            <Input
              label={t.password}
              id="register-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-xs text-slate-500">{t.register.passwordHint}</span>
              <button
                type="button"
                className="text-xs font-medium text-brand-700 hover:text-brand-800"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? t.passwordHide : t.passwordShow}
              </button>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={kvkk}
              onChange={(e) => setKvkk(e.target.checked)}
            />
            <span>{t.register.kvkk}</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={clarification}
              onChange={(e) => setClarification(e.target.checked)}
            />
            <span>{t.register.clarification}</span>
          </label>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t.submitting : t.register.finish}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
