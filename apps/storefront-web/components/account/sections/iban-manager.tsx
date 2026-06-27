"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { isValidIban, type CustomerIban } from "@commerce-os/api-client";
import {
  createIbanAction,
  deleteIbanAction,
  setDefaultIbanAction,
} from "../../../lib/server/account-actions";

type AccountDict = StorefrontDictionary["account"];

/** IBAN Bilgilerim — iade/iptal süreçleri için saklanır. Liste maskeli gösterilir;
 * ekleme client + server IBAN (mod-97) doğrulaması ile yapılır. */
export function IbanManager({ t, ibans }: { t: AccountDict; ibans: CustomerIban[] }) {
  const i = t.iban;
  const router = useRouter();
  const [holder, setHolder] = useState("");
  const [iban, setIban] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isValidIban(iban)) {
      setError(i.invalid);
      return;
    }
    startTransition(async () => {
      const result = await createIbanAction({ accountHolderName: holder.trim(), iban });
      if (result.ok) {
        setHolder("");
        setIban("");
        router.refresh();
      } else {
        setError(i.invalid);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteIbanAction(id);
      router.refresh();
    });
  }

  function makeDefault(id: string) {
    startTransition(async () => {
      await setDefaultIbanAction(id);
      router.refresh();
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{i.title}</h1>

      {ibans.length === 0 ? (
        <p className="text-sm text-slate-500">{i.empty}</p>
      ) : (
        <ul className="space-y-2">
          {ibans.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
            >
              <div className="text-sm">
                <p className="font-medium text-slate-900">
                  {entry.accountHolderName}
                  {entry.isDefault ? (
                    <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                      {i.default}
                    </span>
                  ) : null}
                </p>
                <p className="font-mono text-slate-600">{entry.ibanMasked}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {!entry.isDefault ? (
                  <button
                    type="button"
                    className="font-medium text-brand-700 hover:text-brand-800"
                    onClick={() => makeDefault(entry.id)}
                    disabled={pending}
                  >
                    {i.makeDefault}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="font-medium text-red-600 hover:text-red-700"
                  onClick={() => remove(entry.id)}
                  disabled={pending}
                >
                  {i.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-4 rounded-xl border border-slate-200 p-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input label={i.holder} value={holder} onChange={(e) => setHolder(e.target.value)} required />
        <Input
          label={i.iban}
          placeholder={i.ibanPlaceholder}
          value={iban}
          onChange={(e) => setIban(e.target.value.toUpperCase())}
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? i.adding : i.add}
        </Button>
      </form>
    </div>
  );
}
