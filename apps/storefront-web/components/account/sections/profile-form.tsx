"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Select } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerAccount } from "@commerce-os/api-client";
import { updateProfileAction } from "../../../lib/server/account-actions";

type AccountDict = StorefrontDictionary["account"];

/** Üyelik Bilgilerim — ad/soyad/doğum tarihi/cinsiyet düzenlenir; e-posta/telefon
 * doğrulama durumu ile salt-okunur gösterilir (değişiklik OTP gerektirir, sonraki faz). */
export function ProfileForm({ t, customer }: { t: AccountDict; customer: CustomerAccount }) {
  const router = useRouter();
  const m = t.membership;
  const [firstName, setFirstName] = useState(customer.firstName ?? "");
  const [lastName, setLastName] = useState(customer.lastName ?? "");
  const [birthDate, setBirthDate] = useState(customer.birthDate ?? "");
  const [gender, setGender] = useState<string>(customer.gender ?? "");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await updateProfileAction({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate: birthDate || null,
        gender: gender ? (gender as "FEMALE" | "MALE" | "OTHER") : null,
      });
      if (result.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(t.membership.title);
      }
    });
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4" noValidate>
      <h1 className="text-xl font-semibold text-slate-900">{m.title}</h1>
      {done ? <Alert tone="success">{m.saved}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label={m.firstName} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        <Input label={m.lastName} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input type="date" label={m.birthDate} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        <Select
          label={m.gender}
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          options={[
            { value: "", label: m.genderUnspecified },
            { value: "FEMALE", label: m.genderFemale },
            { value: "MALE", label: m.genderMale },
            { value: "OTHER", label: m.genderOther },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReadOnlyContact
          label={m.phone}
          value={customer.phone}
          verified={customer.phoneVerified}
          verifiedLabel={m.verified}
          unverifiedLabel={m.unverified}
        />
        <ReadOnlyContact
          label={m.email}
          value={customer.email}
          verified={customer.emailVerified}
          verifiedLabel={m.verified}
          unverifiedLabel={m.unverified}
        />
      </div>
      <p className="text-xs text-slate-400">{m.contactChangeNote}</p>
      <Button type="submit" disabled={pending}>
        {pending ? m.saving : m.save}
      </Button>
    </form>
  );
}

function ReadOnlyContact({
  label,
  value,
  verified,
  verifiedLabel,
  unverifiedLabel,
}: {
  label: string;
  value: string | null;
  verified: boolean;
  verifiedLabel: string;
  unverifiedLabel: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <div className="flex h-10 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
        <span>{value ?? "—"}</span>
        {value ? (
          <span
            className={[
              "rounded-full px-2 py-0.5 text-xs font-medium",
              verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
            ].join(" ")}
          >
            {verified ? verifiedLabel : unverifiedLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
