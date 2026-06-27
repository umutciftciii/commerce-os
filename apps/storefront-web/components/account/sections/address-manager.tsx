"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Select } from "@commerce-os/ui";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { isValidTaxNumber, isValidTckn, isValidTrPhone, type CustomerAddress } from "@commerce-os/api-client";
import { districtsOf, trProvinceNames } from "../../../lib/tr-location-data";
import {
  createAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  updateAddressAction,
} from "../../../lib/server/account-actions";

type AccountDict = StorefrontDictionary["account"];
type BillingMode = "" | "INDIVIDUAL" | "CORPORATE";

/** Adreslerim — CRUD + varsayılan teslimat adresi + fatura tipi (bireysel TCKN /
 * kurumsal VKN). İl/ilçe bağımlı dropdown; telefon TR formatında doğrulanır. */
export function AddressManager({ t, addresses }: { t: AccountDict; addresses: CustomerAddress[] }) {
  const a = t.addresses;
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "add" | string>("list"); // string = editing id
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    if (!window.confirm(a.confirmDelete)) return;
    startTransition(async () => {
      await deleteAddressAction(id);
      router.refresh();
    });
  }

  function makeDefault(id: string) {
    startTransition(async () => {
      await setDefaultAddressAction(id);
      router.refresh();
    });
  }

  if (mode === "add" || (mode !== "list" && mode)) {
    const editing = mode !== "add" ? addresses.find((x) => x.id === mode) ?? null : null;
    return (
      <AddressForm
        t={t}
        editing={editing}
        onDone={() => {
          setMode("list");
          router.refresh();
        }}
        onCancel={() => setMode("list")}
      />
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{a.title}</h1>
        <Button onClick={() => setMode("add")}>{a.add}</Button>
      </div>

      {addresses.length === 0 ? (
        <p className="text-sm text-slate-500">{a.empty}</p>
      ) : (
        <ul className="space-y-3">
          {addresses.map((address) => (
            <li key={address.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm text-slate-700">
                  <p className="font-medium text-slate-900">
                    {address.addressName ? `${address.addressName} · ` : ""}
                    {address.fullName}
                    {address.isDefaultShipping ? (
                      <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                        {a.default}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 leading-relaxed text-slate-600">
                    {address.addressLine1}
                    {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                  </p>
                  <p className="text-slate-600">
                    {address.district ? `${address.district} / ` : ""}
                    {address.city}
                    {address.postalCode ? ` ${address.postalCode}` : ""}
                  </p>
                  {address.phone ? <p className="text-slate-500">{address.phone}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 text-sm">
                  <button
                    type="button"
                    className="font-medium text-brand-700 hover:text-brand-800"
                    onClick={() => setMode(address.id)}
                  >
                    {a.edit}
                  </button>
                  {!address.isDefaultShipping ? (
                    <button
                      type="button"
                      className="font-medium text-slate-600 hover:text-slate-900"
                      onClick={() => makeDefault(address.id)}
                      disabled={pending}
                    >
                      {a.makeDefault}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="font-medium text-red-600 hover:text-red-700"
                    onClick={() => remove(address.id)}
                    disabled={pending}
                  >
                    {a.delete}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddressForm({
  t,
  editing,
  onDone,
  onCancel,
}: {
  t: AccountDict;
  editing: CustomerAddress | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const a = t.addresses;
  const [addressName, setAddressName] = useState(editing?.addressName ?? "");
  const [fullName, setFullName] = useState(editing?.fullName ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [city, setCity] = useState(editing?.city ?? "");
  const [district, setDistrict] = useState(editing?.district ?? "");
  const [addressLine1, setAddressLine1] = useState(editing?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(editing?.addressLine2 ?? "");
  const [postalCode, setPostalCode] = useState(editing?.postalCode ?? "");
  const [isDefault, setIsDefault] = useState(editing?.isDefaultShipping ?? false);
  const [billing, setBilling] = useState<BillingMode>(editing?.billingType ?? "");
  const [tckn, setTckn] = useState("");
  const [companyName, setCompanyName] = useState(editing?.companyName ?? "");
  const [taxOffice, setTaxOffice] = useState(editing?.taxOffice ?? "");
  const [taxNumber, setTaxNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const districts = useMemo(() => districtsOf(city), [city]);
  const isEditing = Boolean(editing);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!addressName.trim() || !fullName.trim() || !city || !district || !addressLine1.trim()) {
      setError(t.membership.title);
      return;
    }
    if (!isValidTrPhone(phone)) {
      setError(t.addresses.phone);
      return;
    }
    // Bireysel: yeni kayıtta TCKN zorunlu; düzenlemede boş = mevcut korunur.
    if (billing === "INDIVIDUAL") {
      if (tckn && !isValidTckn(tckn)) {
        setError(a.tckn);
        return;
      }
      if (!isEditing && !tckn) {
        setError(a.tckn);
        return;
      }
    }
    if (billing === "CORPORATE") {
      if (!companyName.trim() || !taxOffice.trim()) {
        setError(a.company);
        return;
      }
      if (taxNumber && !isValidTaxNumber(taxNumber)) {
        setError(a.taxNumber);
        return;
      }
      if (!isEditing && !taxNumber) {
        setError(a.taxNumber);
        return;
      }
    }

    const input = {
      addressName: addressName.trim(),
      fullName: fullName.trim(),
      phone,
      city,
      district,
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2 || null,
      postalCode: postalCode || null,
      isDefaultShipping: isDefault,
      billingType: billing === "" ? null : billing,
      tckn: tckn || null,
      companyName: billing === "CORPORATE" ? companyName.trim() : null,
      taxOffice: billing === "CORPORATE" ? taxOffice.trim() : null,
      taxNumber: taxNumber || null,
    };

    startTransition(async () => {
      const result = editing
        ? await updateAddressAction(editing.id, input)
        : await createAddressAction(input);
      if (result.ok) onDone();
      else setError(a.title);
    });
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4" noValidate>
      <h1 className="text-xl font-semibold text-slate-900">{isEditing ? a.edit : a.add}</h1>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Input
        label={a.name}
        placeholder={a.namePlaceholder}
        value={addressName}
        onChange={(e) => setAddressName(e.target.value)}
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label={a.fullName} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <Input label={a.phone} placeholder="5XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label={a.city}
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setDistrict("");
          }}
          options={[{ value: "", label: a.city }, ...trProvinceNames.map((n) => ({ value: n, label: n }))]}
        />
        <Select
          label={a.district}
          value={district}
          disabled={!city}
          onChange={(e) => setDistrict(e.target.value)}
          options={[{ value: "", label: a.district }, ...districts.map((n) => ({ value: n, label: n }))]}
        />
      </div>
      <Input label={a.addressLine} value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label={`${a.addressLine} 2`} value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
        <Input label={a.postalCode} inputMode="numeric" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        {a.makeDefault}
      </label>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <Select
          label={a.billingType}
          value={billing}
          onChange={(e) => setBilling(e.target.value as BillingMode)}
          options={[
            { value: "", label: a.none },
            { value: "INDIVIDUAL", label: a.individual },
            { value: "CORPORATE", label: a.corporate },
          ]}
        />
        {billing === "INDIVIDUAL" ? (
          <div>
            <Input
              label={a.tckn}
              inputMode="numeric"
              value={tckn}
              onChange={(e) => setTckn(e.target.value.replace(/\D/g, "").slice(0, 11))}
            />
            {isEditing && editing?.tcknMasked ? (
              <p className="mt-1 text-xs text-slate-400">{a.tcknKept}</p>
            ) : null}
          </div>
        ) : null}
        {billing === "CORPORATE" ? (
          <div className="space-y-4">
            <Input label={a.company} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <Input label={a.taxOffice} value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} />
            <div>
              <Input
                label={a.taxNumber}
                inputMode="numeric"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
              {isEditing && editing?.taxNumberMasked ? (
                <p className="mt-1 text-xs text-slate-400">{a.taxNumberKept}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? a.saving : a.save}
        </Button>
        <button type="button" className="text-sm font-medium text-slate-500 hover:text-slate-700" onClick={onCancel}>
          {a.cancel}
        </button>
      </div>
    </form>
  );
}
