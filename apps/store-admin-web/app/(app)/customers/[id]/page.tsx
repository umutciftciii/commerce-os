"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "../../../../components/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  CustomerAddress,
  CustomerAddressInput,
  CustomerCommunicationPreference,
  CustomerCouponAssignment,
  CustomerIban,
  StoreAdminCustomerDetail,
  StoreAdminCustomerDetailResponse,
  StoreAdminCustomerListSummaryResponse,
  StoreAdminCustomerSecurity,
} from "@commerce-os/api-client";
import { CustomerIcon } from "../../../../components/icons";
import { storeApi, type ActivationInfo } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../../lib/client/format";
import { SurfaceCard } from "../../../components/premium";
import { ActivationLinkModal } from "../activation-link-modal";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: "success",
  PASSIVE: "neutral",
  BLOCKED: "danger",
  ARCHIVED: "warning",
};

const ORDER_STATUS_TONES: Record<string, Tone> = {
  DRAFT: "neutral",
  PLACED: "info",
  CONFIRMED: "success",
  CANCELLED: "danger",
  FULFILLED: "success",
};

const PAYMENT_STATUS_TONES: Record<string, Tone> = {
  UNPAID: "warning",
  AUTHORIZED: "info",
  PAID: "success",
  REFUNDED: "neutral",
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: StoreAdminCustomerDetailResponse };

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.customers;
  const d = t.detail;
  const c = dict.common;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await storeApi.getCustomer(customerId);
      setState({ status: "ready", data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [customerId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = useCallback((message: string) => {
    setActionError(null);
    setNotice(message);
  }, []);
  const fail = useCallback((error: unknown) => {
    setActionError(messageForError(error, locale));
  }, [locale]);

  if (state.status === "loading") {
    return (
      <>
        <PageHeader eyebrow={d.eyebrow} title={d.eyebrow} />
        <SurfaceCard title={d.profile.title} icon={<CustomerIcon />}>
          <SkeletonRows rows={6} />
        </SurfaceCard>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <PageHeader eyebrow={d.eyebrow} title={d.notFound} />
        <Alert
          tone="error"
          title={d.loadError}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {c.actions.retry}
            </Button>
          }
        >
          {state.message}
        </Alert>
        <div className="mt-4">
          <Link href="/customers" className="text-sm text-white/60 underline hover:text-white">
            {d.back}
          </Link>
        </div>
      </>
    );
  }

  const { customer, security, addresses, ibans, communicationPreference, orders } = state.data;

  return (
    <>
      <PageHeader
        eyebrow={d.eyebrow}
        title={customer.fullName}
        description={customer.email ?? customer.phone ?? undefined}
        breadcrumb={
          <Link href="/customers" className="text-white/50 transition-colors hover:text-white/80">
            {d.back}
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONES[customer.status] ?? "neutral"}>
              {t.statusLabels[customer.status]}
            </Badge>
            <Badge tone={customer.hasCredential ? "info" : "neutral"}>
              {customer.hasCredential ? t.membership.member : t.membership.guest}
            </Badge>
            {customer.emailVerified ? (
              <Badge tone="success" dot>
                {t.verified.email}
              </Badge>
            ) : null}
            {customer.phoneVerified ? (
              <Badge tone="success" dot>
                {t.verified.phone}
              </Badge>
            ) : null}
          </div>
        }
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button type="button" className="text-emerald-300 underline" onClick={() => setNotice(null)}>
                {c.actions.dismiss}
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}
      {actionError ? (
        <div className="mb-4">
          <Alert
            tone="error"
            action={
              <button type="button" className="text-red-300 underline" onClick={() => setActionError(null)}>
                {c.actions.dismiss}
              </button>
            }
          >
            {actionError}
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ProfileCard customer={customer} onSaved={() => { flash(d.profile.saved); void load(); }} onError={fail} />
          <StatusCard customer={customer} onSaved={() => { flash(d.status.saved); void load(); }} onError={fail} />
          <SecurityCard
            customerId={customerId}
            security={security}
            onChanged={(message) => { flash(message); void load(); }}
            onError={fail}
          />
          <AddressesCard
            customerId={customerId}
            addresses={addresses}
            onChanged={(message) => { flash(message); void load(); }}
            onError={fail}
          />
          <OrdersCard orders={orders} />
          <CustomerCouponsCard
            customerId={customerId}
            onChanged={(message) => { flash(message); }}
            onError={fail}
          />
          <PreferencesCard
            customerId={customerId}
            pref={communicationPreference}
            onSaved={() => flash(d.preferences.saved)}
            onError={fail}
          />
          <IbansCard
            customerId={customerId}
            ibans={ibans}
            onChanged={(message) => { flash(message); void load(); }}
            onError={fail}
          />
        </div>
        <aside className="space-y-5">
          <ContextRail customer={customer} addresses={addresses} />
          <CustomerListsSummaryCard customerId={customerId} onError={fail} />
        </aside>
      </div>
    </>
  );
}

/* ── Context rail ─────────────────────────────────────────────────────────── */

function ContextRail({
  customer,
  addresses,
}: {
  customer: StoreAdminCustomerDetail;
  addresses: CustomerAddress[];
}) {
  const dict = getDictionary(useLocale());
  const d = dict.storeAdmin.customers.detail;
  const defaultAddress =
    addresses.find((a) => a.isDefaultShipping) ?? addresses.find((a) => a.isDefaultBilling) ?? null;
  const addressSummary = defaultAddress
    ? [defaultAddress.city, defaultAddress.district].filter(Boolean).join(", ")
    : d.noValue;

  const rows: { label: string; value: string }[] = [
    { label: d.rail.created, value: formatDate(customer.createdAt) },
    { label: d.rail.lastOrder, value: customer.lastOrderAt ? formatDate(customer.lastOrderAt) : d.rail.noOrders },
    { label: d.rail.orders, value: String(customer.orderCount) },
    { label: d.rail.spend, value: formatMinor(customer.totalSpentMinor, customer.currency) },
    { label: d.rail.defaultAddress, value: addressSummary || d.noValue },
  ];

  return (
    <SurfaceCard title={d.rail.title} icon={<CustomerIcon />}>
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3">
            <dt className="text-sm text-white/40">{row.label}</dt>
            <dd className="max-w-[60%] truncate text-right text-sm font-medium text-white/85" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </SurfaceCard>
  );
}

/* ── Listeler & Favoriler (salt-okunur özet) ──────────────────────────────────
 * TODO-159D (ADR-093) — Yalnız asgari sayaç/tarih; öğe içeriği/davranış takibi
 * GÖSTERİLMEZ (gizlilik). Kendi verisini ayrı uçtan çeker (SkeletonRows / hata dayanıklı). */

function CustomerListsSummaryCard({
  customerId,
  onError,
}: {
  customerId: string;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const t = dict.storeAdmin.customers.detail.lists;
  const [summary, setSummary] = useState<
    StoreAdminCustomerListSummaryResponse["data"] | null | "error"
  >(null);

  useEffect(() => {
    let active = true;
    storeApi
      .getCustomerListSummary(customerId)
      .then((response) => {
        if (active) setSummary(response.data);
      })
      .catch((error) => {
        if (active) setSummary("error");
        onError(error);
      });
    return () => {
      active = false;
    };
  }, [customerId, onError]);

  if (summary === null) {
    return (
      <SurfaceCard title={t.title} icon={<CustomerIcon />}>
        <SkeletonRows rows={3} />
      </SurfaceCard>
    );
  }
  if (summary === "error") {
    return (
      <SurfaceCard title={t.title} icon={<CustomerIcon />}>
        <p className="text-sm text-white/40">{t.loadError}</p>
      </SurfaceCard>
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: t.listCount, value: String(summary.listCount) },
    { label: t.wishlistItems, value: String(summary.wishlistItemCount) },
    { label: t.totalItems, value: String(summary.totalItemCount) },
    { label: t.lastAdded, value: summary.lastAddedAt ? formatDate(summary.lastAddedAt) : t.none },
  ];

  return (
    <SurfaceCard title={t.title} icon={<CustomerIcon />}>
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3">
            <dt className="text-sm text-white/40">{row.label}</dt>
            <dd className="text-right text-sm font-medium text-white/85">{row.value}</dd>
          </div>
        ))}
      </dl>
    </SurfaceCard>
  );
}

/* ── Profil ───────────────────────────────────────────────────────────────── */

function ProfileCard({
  customer,
  onSaved,
  onError,
}: {
  customer: StoreAdminCustomerDetail;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const d = dict.storeAdmin.customers.detail;
  const [editing, setEditing] = useState(false);
  const genderLabel = customer.gender ? d.profile.genderOptions[customer.gender] : d.profile.genderOptions.none;

  const rows: { label: string; value: string }[] = [
    { label: d.profile.firstName, value: customer.firstName ?? d.noValue },
    { label: d.profile.lastName, value: customer.lastName ?? d.noValue },
    { label: d.profile.email, value: customer.email ?? d.noValue },
    { label: d.profile.phone, value: customer.phone ?? d.noValue },
    { label: d.profile.birthDate, value: customer.birthDate ?? d.noValue },
    { label: d.profile.gender, value: genderLabel },
  ];

  return (
    <SurfaceCard
      title={d.profile.title}
      description={d.profile.description}
      icon={<CustomerIcon />}
      actions={
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          {d.profile.edit}
        </Button>
      }
    >
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs uppercase tracking-wide text-white/35">{row.label}</dt>
            <dd className="mt-0.5 truncate text-sm text-white/85" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {editing ? (
        <ProfileEditModal
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
          onError={onError}
        />
      ) : null}
    </SurfaceCard>
  );
}

function ProfileEditModal({
  customer,
  onClose,
  onSaved,
  onError,
}: {
  customer: StoreAdminCustomerDetail;
  onClose: () => void;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const c = dict.common;
  const d = dict.storeAdmin.customers.detail;
  const [firstName, setFirstName] = useState(customer.firstName ?? "");
  const [lastName, setLastName] = useState(customer.lastName ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [birthDate, setBirthDate] = useState(customer.birthDate ?? "");
  const [gender, setGender] = useState(customer.gender ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await storeApi.updateCustomer(customer.id, {
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        birthDate: birthDate.trim() || null,
        gender: (gender || null) as StoreAdminCustomerDetail["gender"],
      });
      onSaved();
    } catch (error) {
      onError(error);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={d.profile.title}
      description={d.profile.emailChangeNote}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {d.profile.cancel}
          </Button>
          <Button type="submit" form="customer-profile-form" disabled={saving}>
            {d.profile.save}
          </Button>
        </>
      }
    >
      <form id="customer-profile-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input id="cp-first" label={d.profile.firstName} value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={saving} />
        <Input id="cp-last" label={d.profile.lastName} value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={saving} />
        <Input id="cp-email" type="email" label={d.profile.email} value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
        <Input id="cp-phone" label={d.profile.phone} value={phone} onChange={(e) => setPhone(e.target.value)} disabled={saving} />
        <Input id="cp-birth" type="date" label={d.profile.birthDate} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} disabled={saving} />
        <Select
          id="cp-gender"
          label={d.profile.gender}
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          disabled={saving}
          options={[
            { value: "", label: d.profile.genderOptions.none },
            { value: "FEMALE", label: d.profile.genderOptions.FEMALE },
            { value: "MALE", label: d.profile.genderOptions.MALE },
            { value: "OTHER", label: d.profile.genderOptions.OTHER },
          ]}
        />
      </form>
    </Modal>
  );
}

/* ── Üyelik ve durum ──────────────────────────────────────────────────────── */

function StatusCard({
  customer,
  onSaved,
  onError,
}: {
  customer: StoreAdminCustomerDetail;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const d = dict.storeAdmin.customers.detail;
  const [status, setStatus] = useState(customer.status);
  const [saving, setSaving] = useState(false);

  // ARCHIVED panelden set edilmez; mevcut durum ARCHIVED ise yine de gösterilir.
  const options = [
    { value: "ACTIVE", label: d.status.active },
    { value: "PASSIVE", label: d.status.passive },
    { value: "BLOCKED", label: d.status.blocked },
  ];

  async function save() {
    if (status === customer.status || status === "ARCHIVED") return;
    setSaving(true);
    try {
      await storeApi.updateCustomer(customer.id, { status: status as "ACTIVE" | "PASSIVE" | "BLOCKED" });
      onSaved();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SurfaceCard title={d.status.title} description={d.status.description} icon={<CustomerIcon />}>
      <div className="space-y-4">
        <p className="text-sm text-white/60">
          {customer.hasCredential ? d.status.credentialYes : d.status.credentialNo}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-white/35">{d.verification.email}</p>
            <Badge tone={customer.emailVerified ? "success" : "neutral"}>
              {customer.emailVerified ? d.verification.verified : d.verification.notVerified}
            </Badge>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-white/35">{d.verification.phone}</p>
            <Badge tone={customer.phoneVerified ? "success" : "neutral"}>
              {customer.phoneVerified ? d.verification.verified : d.verification.notVerified}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-white/[0.07] pt-4">
          <div className="min-w-[12rem] flex-1">
            <Select
              id="customer-status"
              label={d.status.label}
              value={status}
              onChange={(e) => setStatus(e.target.value as StoreAdminCustomerDetail["status"])}
              disabled={saving}
              options={options}
            />
          </div>
          <Button onClick={() => void save()} disabled={saving || status === customer.status}>
            {d.status.save}
          </Button>
        </div>
      </div>
    </SurfaceCard>
  );
}

/* ── Güvenlik / Üyelik durumu (TODO-087) ──────────────────────────────────────
 * Credential yok → "Üyelik hesabı yok" + aktivasyon linki üret. Credential var →
 * giriş yapabilir + son şifre değişimi + aktif oturum sayısı + parola sıfırlama.
 * "Tüm oturumları sonlandır" her durumda. Admin parola GÖRMEZ; yalnız tek seferlik
 * link üretir. Link bir kez gösterilir; raw token kalıcı yerde tutulmaz. */
function SecurityCard({
  customerId,
  security,
  onChanged,
  onError,
}: {
  customerId: string;
  security: StoreAdminCustomerSecurity;
  onChanged: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const s = dict.storeAdmin.customers.detail.security;
  const [busy, setBusy] = useState<string | null>(null);
  const [activation, setActivation] = useState<ActivationInfo | null>(null);

  async function createMembership() {
    setBusy("create");
    try {
      const result = await storeApi.createCustomerCredential(customerId);
      setActivation(result.activation);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword() {
    setBusy("reset");
    try {
      const result = await storeApi.resetCustomerCredential(customerId);
      setActivation(result.activation);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  }

  async function revokeSessions() {
    if (!window.confirm(s.revokeConfirm)) return;
    setBusy("revoke");
    try {
      const result = await storeApi.revokeCustomerSessions(customerId);
      onChanged(format(s.revoked, { count: result.revokedCount }));
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SurfaceCard title={s.title} description={s.description} icon={<CustomerIcon />}>
      {security.hasCredential ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone="success" dot>
              {s.canLogin}
            </Badge>
          </div>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-white/35">{s.lastPasswordChange}</dt>
              <dd className="mt-0.5 text-sm text-white/85">
                {security.passwordChangedAt ? formatDate(security.passwordChangedAt) : s.never}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-white/35">{s.activeSessions}</dt>
              <dd className="mt-0.5 text-sm text-white/85 tabular-nums">{security.activeSessionCount}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
            <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void resetPassword()}>
              {s.resetPassword}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null || security.activeSessionCount === 0}
              onClick={() => void revokeSessions()}
            >
              {s.revokeSessions}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Badge tone="neutral">{s.noCredential}</Badge>
          <p className="text-sm text-white/55">{s.noCredentialDesc}</p>
          <div className="border-t border-white/[0.07] pt-4">
            <Button size="sm" disabled={busy !== null} onClick={() => void createMembership()}>
              {s.createMembership}
            </Button>
          </div>
        </div>
      )}
      {activation ? (
        <ActivationLinkModal
          activation={activation}
          onClose={() => {
            setActivation(null);
            onChanged(s.linkGenerated);
          }}
        />
      ) : null}
    </SurfaceCard>
  );
}

/* ── Adresler ─────────────────────────────────────────────────────────────── */

function AddressesCard({
  customerId,
  addresses,
  onChanged,
  onError,
}: {
  customerId: string;
  addresses: CustomerAddress[];
  onChanged: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const d = dict.storeAdmin.customers.detail;
  const [form, setForm] = useState<{ mode: "add" } | { mode: "edit"; address: CustomerAddress } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(addressId: string) {
    if (!window.confirm(d.addresses.confirmDelete)) return;
    setBusy(addressId);
    try {
      await storeApi.deleteCustomerAddress(customerId, addressId);
      onChanged(d.addresses.deleted);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  }

  async function makeDefault(addressId: string) {
    setBusy(addressId);
    try {
      await storeApi.setDefaultCustomerAddress(customerId, addressId);
      onChanged(d.addresses.defaultSet);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SurfaceCard
      title={d.addresses.title}
      icon={<CustomerIcon />}
      actions={
        <Button variant="secondary" size="sm" onClick={() => setForm({ mode: "add" })}>
          {d.addresses.add}
        </Button>
      }
    >
      {addresses.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">{d.addresses.empty}</p>
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <div
              key={address.id}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white/90">{address.addressName}</p>
                    {address.isDefaultShipping ? <Badge tone="info">{d.addresses.defaultShipping}</Badge> : null}
                    {address.isDefaultBilling && !address.isDefaultShipping ? (
                      <Badge tone="info">{d.addresses.defaultBilling}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-white/70">{address.fullName}{address.phone ? ` · ${address.phone}` : ""}</p>
                  <p className="text-sm text-white/45">
                    {[address.addressLine1, address.district, address.city, address.postalCode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {address.billingType ? (
                    <p className="mt-1 text-xs text-white/35">
                      {address.billingType === "CORPORATE"
                        ? [address.companyName, address.taxOffice, address.taxNumberMasked]
                            .filter(Boolean)
                            .join(" · ")
                        : address.tcknMasked ?? ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  {!address.isDefaultShipping ? (
                    <Button variant="ghost" size="sm" disabled={busy === address.id} onClick={() => void makeDefault(address.id)}>
                      {d.addresses.setDefault}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" disabled={busy === address.id} onClick={() => setForm({ mode: "edit", address })}>
                    {d.addresses.edit}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy === address.id} onClick={() => void remove(address.id)}>
                    {d.addresses.delete}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {form ? (
        <AddressFormModal
          customerId={customerId}
          address={form.mode === "edit" ? form.address : null}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            onChanged(d.addresses.saved);
          }}
          onError={onError}
        />
      ) : null}
    </SurfaceCard>
  );
}

function AddressFormModal({
  customerId,
  address,
  onClose,
  onSaved,
  onError,
}: {
  customerId: string;
  address: CustomerAddress | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const c = dict.common;
  const f = dict.storeAdmin.customers.detail.addresses.form;
  const [v, setV] = useState({
    addressName: address?.addressName ?? "",
    fullName: address?.fullName ?? "",
    phone: address?.phone ?? "",
    city: address?.city ?? "",
    district: address?.district ?? "",
    addressLine1: address?.addressLine1 ?? "",
    addressLine2: address?.addressLine2 ?? "",
    postalCode: address?.postalCode ?? "",
    billingType: (address?.billingType ?? "") as "" | "INDIVIDUAL" | "CORPORATE",
    tckn: "",
    companyName: address?.companyName ?? "",
    taxOffice: address?.taxOffice ?? "",
    taxNumber: "",
    makeDefault: address?.isDefaultShipping ?? false,
  });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof v>) => setV((cur) => ({ ...cur, ...patch }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const input: CustomerAddressInput = {
      addressName: v.addressName.trim(),
      fullName: v.fullName.trim(),
      phone: v.phone.trim(),
      city: v.city.trim(),
      district: v.district.trim(),
      addressLine1: v.addressLine1.trim(),
      addressLine2: v.addressLine2.trim() || null,
      postalCode: v.postalCode.trim() || null,
      isDefaultShipping: v.makeDefault,
      billingType: v.billingType || null,
      tckn: v.billingType === "INDIVIDUAL" ? (v.tckn.trim() || null) : null,
      companyName: v.billingType === "CORPORATE" ? (v.companyName.trim() || null) : null,
      taxOffice: v.billingType === "CORPORATE" ? (v.taxOffice.trim() || null) : null,
      taxNumber: v.billingType === "CORPORATE" ? (v.taxNumber.trim() || null) : null,
    };
    try {
      if (address) {
        await storeApi.updateCustomerAddress(customerId, address.id, input);
      } else {
        await storeApi.createCustomerAddress(customerId, input);
      }
      onSaved();
    } catch (error) {
      onError(error);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={address ? f.editTitle : f.addTitle}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {f.cancel}
          </Button>
          <Button type="submit" form="customer-address-form" disabled={saving}>
            {f.save}
          </Button>
        </>
      }
    >
      <form id="customer-address-form" onSubmit={onSubmit} className="space-y-3" noValidate>
        <Input id="ca-name" label={f.addressName} value={v.addressName} onChange={(e) => set({ addressName: e.target.value })} disabled={saving} required />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input id="ca-full" label={f.fullName} value={v.fullName} onChange={(e) => set({ fullName: e.target.value })} disabled={saving} required />
          <Input id="ca-phone" label={f.phone} value={v.phone} onChange={(e) => set({ phone: e.target.value })} disabled={saving} required />
          <Input id="ca-city" label={f.city} value={v.city} onChange={(e) => set({ city: e.target.value })} disabled={saving} required />
          <Input id="ca-district" label={f.district} value={v.district} onChange={(e) => set({ district: e.target.value })} disabled={saving} required />
        </div>
        <Input id="ca-line1" label={f.addressLine1} value={v.addressLine1} onChange={(e) => set({ addressLine1: e.target.value })} disabled={saving} required />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input id="ca-line2" label={f.addressLine2} value={v.addressLine2} onChange={(e) => set({ addressLine2: e.target.value })} disabled={saving} />
          <Input id="ca-postal" label={f.postalCode} value={v.postalCode} onChange={(e) => set({ postalCode: e.target.value })} disabled={saving} />
        </div>
        <Select
          id="ca-billing"
          label={f.billingType}
          value={v.billingType}
          onChange={(e) => set({ billingType: e.target.value as typeof v.billingType })}
          disabled={saving}
          options={[
            { value: "", label: f.billingNone },
            { value: "INDIVIDUAL", label: f.individual },
            { value: "CORPORATE", label: f.corporate },
          ]}
        />
        {v.billingType === "INDIVIDUAL" ? (
          <Input
            id="ca-tckn"
            label={f.tckn}
            value={v.tckn}
            placeholder={address?.tcknMasked ?? undefined}
            onChange={(e) => set({ tckn: e.target.value })}
            disabled={saving}
          />
        ) : null}
        {v.billingType === "CORPORATE" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input id="ca-company" label={f.companyName} value={v.companyName} onChange={(e) => set({ companyName: e.target.value })} disabled={saving} />
            <Input id="ca-taxoffice" label={f.taxOffice} value={v.taxOffice} onChange={(e) => set({ taxOffice: e.target.value })} disabled={saving} />
            <Input
              id="ca-taxnumber"
              label={f.taxNumber}
              value={v.taxNumber}
              placeholder={address?.taxNumberMasked ?? undefined}
              onChange={(e) => set({ taxNumber: e.target.value })}
              disabled={saving}
            />
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={v.makeDefault} onChange={(e) => set({ makeDefault: e.target.checked })} disabled={saving} />
          {f.makeDefault}
        </label>
      </form>
    </Modal>
  );
}

/* ── Siparişler ───────────────────────────────────────────────────────────── */

function OrdersCard({ orders }: { orders: StoreAdminCustomerDetailResponse["orders"] }) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const d = dict.storeAdmin.customers.detail;
  const o = dict.storeAdmin.orders;
  const statusLabels = o.statusLabels as Record<string, string>;
  const paymentLabels = o.paymentLabels as Record<string, string>;

  const columns: DataTableColumn<StoreAdminCustomerDetailResponse["orders"][number]>[] = [
    {
      header: d.orders.number,
      className: "whitespace-nowrap",
      cell: (order) => (
        <div>
          <p className="font-mono text-sm font-medium text-white/90">{order.orderNumber}</p>
          <p className="text-xs text-white/30">{format(d.orders.items, { count: order.itemCount })}</p>
        </div>
      ),
    },
    {
      header: d.orders.date,
      className: "whitespace-nowrap",
      cell: (order) => <span className="text-white/55">{formatDate(order.createdAt)}</span>,
    },
    {
      header: d.orders.payment,
      className: "whitespace-nowrap",
      cell: (order) => (
        <Badge tone={PAYMENT_STATUS_TONES[order.paymentStatus] ?? "neutral"}>
          {paymentLabels[order.paymentStatus] ?? order.paymentStatus}
        </Badge>
      ),
    },
    {
      header: d.orders.status,
      className: "whitespace-nowrap",
      cell: (order) => (
        <Badge tone={ORDER_STATUS_TONES[order.status] ?? "neutral"}>
          {statusLabels[order.status] ?? order.status}
        </Badge>
      ),
    },
    {
      header: d.orders.total,
      align: "right",
      className: "whitespace-nowrap",
      cell: (order) => (
        <span className="font-medium tabular-nums text-white/90">
          {formatMinor(order.totalMinor, order.currency)}
        </span>
      ),
    },
  ];

  return (
    <SurfaceCard title={d.orders.title} icon={<CustomerIcon />}>
      {orders.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">{d.orders.empty}</p>
      ) : (
        <DataTable columns={columns} rows={orders} rowKey={(order) => order.orderNumber} caption={d.orders.title} />
      )}
    </SurfaceCard>
  );
}

/* ── Müşteri kuponları (F4A.3, ADR-060) ───────────────────────────────────── */

/**
 * Müşteri-odaklı kupon cüzdanı: bu müşteriye atanmış/kazanılmış/kullanılmış
 * kuponlar + "Kupon ata" (ortak backend). Atanan kupon yalnız bu müşteride görünür;
 * public/private ayrımı kampanya isPublic'e bağlıdır (atama kuponu public yapmaz).
 */
function CustomerCouponsCard({
  customerId,
  onChanged,
  onError,
}: {
  customerId: string;
  onChanged: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const locale = useLocale();
  const t = dict.storeAdmin.customers.detail.coupons;
  const [rows, setRows] = useState<CustomerCouponAssignment[] | null>(null);
  const [coupons, setCoupons] = useState<Array<{ id: string; code: string; campaignName: string }>>([]);
  const [couponId, setCouponId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [assignments, campaignList] = await Promise.all([
        storeApi.listCustomerCoupons(customerId),
        storeApi.listCampaigns(),
      ]);
      setRows(assignments.data);
      const options = campaignList.data.flatMap((campaign) =>
        campaign.coupons.map((coupon) => ({
          id: coupon.id,
          code: coupon.code,
          campaignName: campaign.name,
        })),
      );
      setCoupons(options);
      setCouponId((current) => current || options[0]?.id || "");
    } catch (error) {
      setRows([]);
      onError(error);
    }
  }, [customerId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(event: FormEvent) {
    event.preventDefault();
    if (!couponId) return;
    setBusy(true);
    try {
      await storeApi.assignCustomerCoupon(customerId, couponId);
      onChanged(t.assignSuccess);
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = (status: CustomerCouponAssignment["status"]) =>
    ({
      AVAILABLE: t.statusAVAILABLE,
      APPLIED: t.statusAPPLIED,
      USED: t.statusUSED,
      REVOKED: t.statusREVOKED,
    })[status];
  const sourceLabel = (source: CustomerCouponAssignment["source"]) =>
    ({
      ADMIN_ASSIGNED: t.sourceADMIN_ASSIGNED,
      PUBLIC_CLAIMED: t.sourcePUBLIC_CLAIMED,
      CODE_CLAIMED: t.sourceCODE_CLAIMED,
    })[source];

  return (
    <SurfaceCard title={t.title} icon={<CustomerIcon />}>
      <p className="text-xs text-white/40">{t.description}</p>
      {coupons.length > 0 ? (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={assign}>
          <label className="flex flex-col gap-1 text-xs text-white/60">
            {t.assignLabel}
            <Select
              value={couponId}
              onChange={(event) => setCouponId(event.target.value)}
              options={coupons.map((coupon) => ({
                value: coupon.id,
                label: `${coupon.code} — ${coupon.campaignName}`,
              }))}
            />
          </label>
          <Button type="submit" size="sm" disabled={busy || !couponId}>
            {t.assignSubmit}
          </Button>
        </form>
      ) : null}
      <div className="mt-3 space-y-1">
        {rows === null ? (
          <SkeletonRows rows={2} />
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-white/40">{t.empty}</p>
        ) : (
          rows.map((row) => (
            <p key={row.id} className="text-sm text-white/75">
              <span className="font-mono text-white/85">{row.couponCode}</span>
              {" · "}
              <Badge tone={row.status === "USED" ? "neutral" : "success"}>{statusLabel(row.status)}</Badge>
              {" · "}
              <span className="text-white/45">{sourceLabel(row.source)}</span>
              {row.orderNumber ? (
                <>
                  {" · "}
                  <Link
                    href={`/orders/${row.orderId}`}
                    className="text-white/85 underline-offset-2 hover:underline"
                  >
                    {row.orderNumber}
                  </Link>
                </>
              ) : null}
              {" · "}
              <span className="text-white/40">
                {new Date(row.usedAt ?? row.claimedAt).toLocaleDateString(
                  locale === "tr" ? "tr-TR" : "en-GB",
                )}
              </span>
            </p>
          ))
        )}
      </div>
    </SurfaceCard>
  );
}

/* ── İletişim tercihleri ──────────────────────────────────────────────────── */

function PreferencesCard({
  customerId,
  pref,
  onSaved,
  onError,
}: {
  customerId: string;
  pref: CustomerCommunicationPreference;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const d = dict.storeAdmin.customers.detail;
  const [value, setValue] = useState(pref);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await storeApi.updateCustomerCommPref(customerId, value);
      onSaved();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  const rows: { key: keyof CustomerCommunicationPreference; label: string }[] = [
    { key: "smsEnabled", label: d.preferences.sms },
    { key: "emailEnabled", label: d.preferences.email },
    { key: "phoneEnabled", label: d.preferences.phone },
  ];

  return (
    <SurfaceCard title={d.preferences.title} description={d.preferences.description} icon={<CustomerIcon />}>
      <div className="space-y-3">
        {rows.map((row) => (
          <label key={row.key} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-4 py-2.5">
            <span className="text-sm text-white/80">{row.label}</span>
            <input
              type="checkbox"
              checked={value[row.key]}
              onChange={(e) => setValue((cur) => ({ ...cur, [row.key]: e.target.checked }))}
              disabled={saving}
            />
          </label>
        ))}
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {d.preferences.save}
          </Button>
        </div>
      </div>
    </SurfaceCard>
  );
}

/* ── IBAN ─────────────────────────────────────────────────────────────────── */

function IbansCard({
  customerId,
  ibans,
  onChanged,
  onError,
}: {
  customerId: string;
  ibans: CustomerIban[];
  onChanged: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const d = dict.storeAdmin.customers.detail;
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(ibanId: string) {
    if (!window.confirm(d.ibans.confirmDelete)) return;
    setBusy(ibanId);
    try {
      await storeApi.deleteCustomerIban(customerId, ibanId);
      onChanged(d.ibans.deleted);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  }

  async function makeDefault(ibanId: string) {
    setBusy(ibanId);
    try {
      await storeApi.setDefaultCustomerIban(customerId, ibanId);
      onChanged(d.ibans.defaultSet);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SurfaceCard
      title={d.ibans.title}
      description={d.ibans.masked}
      icon={<CustomerIcon />}
      actions={
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          {d.ibans.add}
        </Button>
      }
    >
      {ibans.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">{d.ibans.empty}</p>
      ) : (
        <div className="space-y-3">
          {ibans.map((iban) => (
            <div key={iban.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-white/90">{iban.accountHolderName}</p>
                  {iban.isDefault ? <Badge tone="info">{d.ibans.default}</Badge> : null}
                </div>
                <p className="font-mono text-sm text-white/55">{iban.ibanMasked}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!iban.isDefault ? (
                  <Button variant="ghost" size="sm" disabled={busy === iban.id} onClick={() => void makeDefault(iban.id)}>
                    {d.ibans.setDefault}
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" disabled={busy === iban.id} onClick={() => void remove(iban.id)}>
                  {d.ibans.delete}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <IbanFormModal
          customerId={customerId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onChanged(d.ibans.saved);
          }}
          onError={onError}
        />
      ) : null}
    </SurfaceCard>
  );
}

function IbanFormModal({
  customerId,
  onClose,
  onSaved,
  onError,
}: {
  customerId: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const dict = getDictionary(useLocale());
  const c = dict.common;
  const f = dict.storeAdmin.customers.detail.ibans.form;
  const [holder, setHolder] = useState("");
  const [iban, setIban] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await storeApi.createCustomerIban(customerId, {
        accountHolderName: holder.trim(),
        iban: iban.trim(),
        isDefault: makeDefault,
      });
      onSaved();
    } catch (error) {
      onError(error);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={f.title}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {f.cancel}
          </Button>
          <Button type="submit" form="customer-iban-form" disabled={saving}>
            {f.save}
          </Button>
        </>
      }
    >
      <form id="customer-iban-form" onSubmit={onSubmit} className="space-y-3" noValidate>
        <Input id="ci-holder" label={f.holder} value={holder} onChange={(e) => setHolder(e.target.value)} disabled={saving} required />
        <Input id="ci-iban" label={f.iban} value={iban} onChange={(e) => setIban(e.target.value)} disabled={saving} required />
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} disabled={saving} />
          {f.makeDefault}
        </label>
      </form>
    </Modal>
  );
}
