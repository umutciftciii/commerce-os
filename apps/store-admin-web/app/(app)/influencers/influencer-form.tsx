"use client";

/**
 * TODO-160 — Influencer oluştur/düzenle modal formu. Hem liste (create) hem detay
 * (edit) ekranı bunu yeniden kullanır. Kod mağaza kapsamında benzersizdir; sunucu
 * 409 CODE_TAKEN döndürürse alan-içi hata gösterilir.
 */

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Input, Modal, Select, Textarea, useLocale } from "../../../components/ui";
import type {
  InfluencerDetail,
  InfluencerCreateRequest,
  InfluencerStatus,
} from "@commerce-os/api-client";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type Locale = "tr" | "en";

const L = {
  tr: {
    titleNew: "Yeni influencer",
    titleEdit: "Influencer'ı düzenle",
    name: "Ad",
    code: "Kod",
    codeHint: "Mağaza kapsamında benzersiz. Büyük harfe normalize edilir.",
    email: "E-posta (opsiyonel)",
    status: "Durum",
    notes: "Notlar (opsiyonel)",
    save: "Kaydet",
    create: "Oluştur",
    close: "Kapat",
    statusLabels: { ACTIVE: "Aktif", INACTIVE: "Pasif" } as Record<InfluencerStatus, string>,
    codeTaken: "Bu kod zaten kullanılıyor. Farklı bir kod deneyin.",
    validationName: "Ad zorunludur.",
    validationCode: "Kod zorunludur.",
  },
  en: {
    titleNew: "New influencer",
    titleEdit: "Edit influencer",
    name: "Name",
    code: "Code",
    codeHint: "Unique within the store. Normalized to uppercase.",
    email: "Email (optional)",
    status: "Status",
    notes: "Notes (optional)",
    save: "Save",
    create: "Create",
    close: "Close",
    statusLabels: { ACTIVE: "Active", INACTIVE: "Inactive" } as Record<InfluencerStatus, string>,
    codeTaken: "This code is already in use. Try a different code.",
    validationName: "Name is required.",
    validationCode: "Code is required.",
  },
} satisfies Record<Locale, unknown>;

const STATUSES: readonly InfluencerStatus[] = ["ACTIVE", "INACTIVE"];

export function InfluencerFormModal({
  editing,
  onClose,
  onSaved,
}: {
  /** Düzenlenen influencer; null ise yeni oluşturma. */
  editing: InfluencerDetail | null;
  onClose: () => void;
  onSaved: (influencer: InfluencerDetail) => void;
}) {
  const locale = useLocale() as Locale;
  const t = L[locale] ?? L.tr;

  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [status, setStatus] = useState<InfluencerStatus>(editing?.status ?? "ACTIVE");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(editing?.name ?? "");
    setCode(editing?.code ?? "");
    setEmail(editing?.email ?? "");
    setStatus(editing?.status ?? "ACTIVE");
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [editing]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) {
      setError(t.validationName);
      return;
    }
    if (!code.trim()) {
      setError(t.validationCode);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: InfluencerCreateRequest = {
        name: name.trim(),
        code: code.trim(),
        email: email.trim() ? email.trim() : undefined,
        status,
        notes: notes.trim() ? notes.trim() : undefined,
      };
      const result = editing
        ? await storeApi.updateInfluencer(editing.id, {
            name: payload.name,
            code: payload.code,
            email: payload.email ?? null,
            status: payload.status,
            notes: payload.notes ?? null,
          })
        : await storeApi.createInfluencer(payload);
      onSaved(result.data);
    } catch (cause) {
      const code = cause instanceof Error && "code" in cause ? (cause as { code: string }).code : "";
      setError(code === "CODE_TAKEN" ? t.codeTaken : messageForError(cause, locale));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t.titleEdit : t.titleNew}
      closeLabel={t.close}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.close}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {editing ? t.save : t.create}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="grid gap-3 md:grid-cols-2">
          <Input label={t.name} value={name} onChange={(e) => setName(e.target.value)} required />
          <div>
            <Input label={t.code} value={code} onChange={(e) => setCode(e.target.value)} required />
            <p className="mt-1 text-xs text-white/40">{t.codeHint}</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label={t.email}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select
            label={t.status}
            value={status}
            onChange={(e) => setStatus(e.target.value as InfluencerStatus)}
            options={STATUSES.map((value) => ({ value, label: t.statusLabels[value] }))}
          />
        </div>
        <Textarea label={t.notes} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Modal>
  );
}
