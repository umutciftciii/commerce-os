"use client";

import { useState, useTransition } from "react";
import { Alert, Button } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerCommunicationPreference } from "@commerce-os/api-client";
import { updateCommunicationPreferencesAction } from "../../../lib/server/account-actions";

type AccountDict = StorefrontDictionary["account"];

/** İletişim Tercihlerim — KVKK izin modeli; SMS/e-posta/telefon toggle'ları. */
export function CommunicationForm({
  t,
  initial,
}: {
  t: AccountDict;
  initial: CustomerCommunicationPreference;
}) {
  const c = t.communication;
  const [sms, setSms] = useState(initial.smsEnabled);
  const [email, setEmail] = useState(initial.emailEnabled);
  const [phone, setPhone] = useState(initial.phoneEnabled);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await updateCommunicationPreferencesAction({
        smsEnabled: sms,
        emailEnabled: email,
        phoneEnabled: phone,
      });
      if (result.ok) setDone(true);
      else setError(c.title);
    });
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
      <h1 className="text-xl font-semibold text-slate-900">{c.title}</h1>
      {done ? <Alert tone="success">{c.saved}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Toggle label={c.sms} checked={sms} onChange={setSms} />
      <Toggle label={c.email} checked={email} onChange={setEmail} />
      <Toggle label={c.phone} checked={phone} onChange={setPhone} />
      <p className="text-xs text-slate-400">{c.note}</p>
      <Button type="submit" disabled={pending}>
        {pending ? c.saving : c.save}
      </Button>
    </form>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="checkbox"
        className="h-5 w-5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
