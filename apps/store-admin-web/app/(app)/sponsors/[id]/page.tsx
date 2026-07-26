"use client";

/**
 * TODO-161A — Sponsor firma detayı: kimlik + düzenleme + para-birimi bazlı cari bakiye
 * (ADR-127) + bu sponsorun anlaşmaları. Vergi no / iletişim yalnız yetkili admin yüzeyinde
 * görünür (public uç yoktur).
 */
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, SkeletonRows, Textarea, useLocale } from "../../../../components/ui";
import type { SponsorAccountDetail, SponsorshipAgreementSummary } from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatMinor } from "../../../../lib/client/format";
import { DetailHero, RailCard, RailRow, SurfaceCard } from "../../../components/premium";
import { AGREEMENT_STATUS_LABELS, PRICING_MODEL_LABELS, sponsorshipError, type Locale } from "../labels";

function errorText(error: unknown, locale: Locale): string {
  if (error instanceof UiError) return sponsorshipError(error.code) ?? messageForError(error, locale);
  return messageForError(error, locale);
}

export default function SponsorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const locale = useLocale() as Locale;
  const [sponsor, setSponsor] = useState<SponsorAccountDetail | null>(null);
  const [agreements, setAgreements] = useState<SponsorshipAgreementSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [detail, ags] = await Promise.all([
        storeApi.getSponsor(id),
        storeApi.listSponsorshipAgreements({ sponsorAccountId: id, pageSize: 100 }),
      ]);
      setSponsor(detail.data);
      setAgreements(ags.data);
    } catch (e) {
      setError(errorText(e, locale));
    }
  }, [id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert tone="error" title="Yüklenemedi">{error}</Alert>;
  if (!sponsor) return <SkeletonRows rows={5} />;

  return (
    <div className="space-y-5">
      <DetailHero
        eyebrow="Sponsor firma"
        title={sponsor.companyName}
        subtitle={sponsor.email}
        badges={<Badge tone={sponsor.status === "ACTIVE" ? "success" : "neutral"}>{sponsor.status === "ACTIVE" ? "Aktif" : "Pasif"}</Badge>}
        actions={<Button variant="secondary" onClick={() => setEditing((v) => !v)}>{editing ? "Kapat" : "Düzenle"}</Button>}
        backHref="/sponsors"
        backLabel="Sponsorlar"
      />

      {editing ? <EditSponsor sponsor={sponsor} locale={locale} onSaved={() => { setEditing(false); void load(); }} /> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <SurfaceCard title="Cari bakiye" description="Para birimi bazında ayrı (farklı para birimleri toplanmaz)">
            {sponsor.balances.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-white/40">Henüz tahakkuk yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-white/50">
                    <tr className="border-b border-white/10 text-left">
                      <th className="px-3 py-2 font-medium">Para Birimi</th>
                      <th className="px-3 py-2 text-right font-medium">Tahakkuk</th>
                      <th className="px-3 py-2 text-right font-medium">Tahsil</th>
                      <th className="px-3 py-2 text-right font-medium">Kalan</th>
                      <th className="px-3 py-2 text-right font-medium">Vadesi Geçen</th>
                      <th className="px-3 py-2 text-right font-medium">Avans (kullanılmamış)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sponsor.balances.map((b) => (
                      <tr key={b.currency} className="border-b border-white/5 text-white/80">
                        <td className="px-3 py-2 font-medium">{b.currency}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMinor(b.chargedMinor, b.currency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{formatMinor(b.paidMinor, b.currency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMinor(b.outstandingMinor, b.currency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-300">{formatMinor(b.overdueMinor, b.currency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-300">{formatMinor(b.advanceBalanceMinor, b.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard title="Anlaşmalar" description="Bu sponsora ait sözleşmeler" actions={<Link href="/sponsorship-agreements" className="text-sm text-indigo-300 hover:underline">Tümü</Link>}>
            {agreements.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-white/40">Bu sponsora bağlı anlaşma yok.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {agreements.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/sponsorship-agreements/${a.id}`} className="font-medium text-white/90 hover:text-indigo-200 hover:underline">
                        {a.agreementNumber} · {a.title}
                      </Link>
                      <div className="text-xs text-white/40">{PRICING_MODEL_LABELS[a.pricingModel]} · {a.currency}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.hasOverdueCharge ? <Badge tone="danger">Vade aşımı</Badge> : null}
                      <Badge tone={a.status === "ACTIVE" ? "success" : "neutral"}>{AGREEMENT_STATUS_LABELS[a.status]}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SurfaceCard>
        </div>

        <RailCard title="İletişim & Vergi">
          <RailRow label="İlgili kişi" value={sponsor.contactName} />
          <RailRow label="E-posta" value={sponsor.email} />
          <RailRow label="Telefon" value={sponsor.phone ?? "—"} />
          <RailRow label="Vergi dairesi" value={sponsor.taxOffice ?? "—"} />
          <RailRow label="Vergi no" value={sponsor.taxNumber ?? "—"} />
          <RailRow label="Fatura adresi" value={sponsor.billingAddress ?? "—"} />
          {sponsor.notes ? <RailRow label="Not" value={sponsor.notes} /> : null}
        </RailCard>
      </div>
    </div>
  );
}

function EditSponsor({ sponsor, locale, onSaved }: { sponsor: SponsorAccountDetail; locale: Locale; onSaved: () => void }) {
  const [contactName, setContactName] = useState(sponsor.contactName);
  const [email, setEmail] = useState(sponsor.email);
  const [phone, setPhone] = useState(sponsor.phone ?? "");
  const [taxOffice, setTaxOffice] = useState(sponsor.taxOffice ?? "");
  const [taxNumber, setTaxNumber] = useState(sponsor.taxNumber ?? "");
  const [billingAddress, setBillingAddress] = useState(sponsor.billingAddress ?? "");
  const [status, setStatus] = useState(sponsor.status);
  const [notes, setNotes] = useState(sponsor.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await storeApi.updateSponsor(sponsor.id, {
        contactName: contactName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        taxOffice: taxOffice.trim() || null,
        taxNumber: taxNumber.trim() || null,
        billingAddress: billingAddress.trim() || null,
        status,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SurfaceCard title="Firma bilgilerini düzenle">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="İlgili kişi" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <Input label="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/50">Durum</span>
          <select className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white [&>option]:text-slate-900" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Pasif</option>
          </select>
        </label>
        <Input label="Vergi dairesi" value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} />
        <Input label="Vergi no" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />
        <div className="sm:col-span-2">
          <Input label="Fatura adresi" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Textarea label="Notlar" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <Button onClick={() => void save()} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</Button>
      </div>
    </SurfaceCard>
  );
}
