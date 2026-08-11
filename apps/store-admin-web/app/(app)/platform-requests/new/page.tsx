"use client";

/**
 * TODO-178 (Faz D) — Yeni platform talebi (mağaza → platform). Minimal form: kategori (yalnız AKTİF
 * taksonomi, bilingual etiket) + konu + açıklama + opsiyonel mağaza etkisi (advisory). Priority store'ca
 * SEÇİLEMEZ (platform-owned). Serbest JSON / dinamik form YOK. Doğrulama client+server; server otoritedir.
 * Başarıda detail'e yönlendirir (PR numarası orada görünür).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Input, Select, Textarea, useLocale } from "../../../../components/ui";
import type { StorePlatformRequestCategoryListResponse } from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { SurfaceCard } from "../../../components/premium";
import { PlatformRequestIcon } from "../../../../components/icons";
import { type Locale, categoryLabel, storeImpactLabel, STORE_IMPACT_ORDER } from "../../../../lib/client/platform-request-labels";

type CategoryRef = StorePlatformRequestCategoryListResponse["items"][number];
type StoreImpact = (typeof STORE_IMPACT_ORDER)[number];

const T = {
  title: { tr: "Yeni Platform Talebi", en: "New Platform Request" },
  subtitle: {
    tr: "Platform ekibinin müdahalesini gerektiren konuyu açıklayın.",
    en: "Describe the issue that needs the platform team's action.",
  },
  back: { tr: "Taleplere dön", en: "Back to requests" },
  category: { tr: "Kategori", en: "Category" },
  categoryPlaceholder: { tr: "Kategori seçin", en: "Select a category" },
  subject: { tr: "Konu", en: "Subject" },
  subjectPlaceholder: { tr: "Kısa ve açıklayıcı bir başlık", en: "A short, descriptive title" },
  description: { tr: "Açıklama", en: "Description" },
  descriptionPlaceholder: {
    tr: "Sorunu, beklentinizi ve varsa adımları yazın.",
    en: "Explain the issue, your expectation and any steps.",
  },
  impact: { tr: "Mağaza etkisi (opsiyonel)", en: "Store impact (optional)" },
  impactNone: { tr: "Belirtilmedi", en: "Not specified" },
  impactHint: {
    tr: "Etki seviyesi platforma yardımcı bilgidir; önceliği platform belirler.",
    en: "Impact is advisory context; the platform sets the priority.",
  },
  submit: { tr: "Talep oluştur", en: "Create request" },
  submitting: { tr: "Oluşturuluyor…", en: "Creating…" },
  cancel: { tr: "Vazgeç", en: "Cancel" },
} as const;

export default function NewPlatformRequestPage() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const tr = (b: { tr: string; en: string }) => (locale === "tr" ? b.tr : b.en);

  const [categories, setCategories] = useState<CategoryRef[]>([]);
  const [categoryKey, setCategoryKey] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [storeImpact, setStoreImpact] = useState<"" | StoreImpact>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    storeApi
      .listPlatformRequestCategories()
      .then((r) => {
        if (active) setCategories(r.items);
      })
      .catch((e) => {
        if (active) setError(messageForError(e, locale));
      });
    return () => {
      active = false;
    };
  }, [locale]);

  const valid = categoryKey !== "" && subject.trim() !== "" && description.trim() !== "";

  const submit = useCallback(async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { request } = await storeApi.createPlatformRequest({
        categoryKey,
        subject: subject.trim(),
        description: description.trim(),
        ...(storeImpact ? { storeImpact } : {}),
      });
      router.push(`/platform-requests/${request.id}`);
    } catch (e) {
      setError(messageForError(e, locale));
      setBusy(false);
    }
  }, [valid, busy, categoryKey, subject, description, storeImpact, router, locale]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/platform-requests" className="text-sm text-white/50 hover:text-white/80">
          ← {tr(T.back)}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-white/90">{tr(T.title)}</h1>
        <p className="text-sm text-white/50">{tr(T.subtitle)}</p>
      </div>

      <SurfaceCard title={tr(T.title)} description={tr(T.subtitle)} icon={<PlatformRequestIcon />}>
        <div className="space-y-4">
          <Select
            label={tr(T.category)}
            value={categoryKey}
            onChange={(e) => setCategoryKey(e.target.value)}
            options={[
              { value: "", label: tr(T.categoryPlaceholder) },
              ...categories.map((cat) => ({ value: cat.key, label: categoryLabel(locale, cat) })),
            ]}
          />
          <Input
            label={tr(T.subject)}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={tr(T.subjectPlaceholder)}
          />
          <Textarea
            label={tr(T.description)}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder={tr(T.descriptionPlaceholder)}
          />
          <div>
            <Select
              label={tr(T.impact)}
              value={storeImpact}
              onChange={(e) => setStoreImpact(e.target.value as "" | StoreImpact)}
              options={[
                { value: "", label: tr(T.impactNone) },
                ...STORE_IMPACT_ORDER.map((value) => ({ value, label: storeImpactLabel(locale, value) })),
              ]}
            />
            <p className="mt-1 text-xs text-white/35">{tr(T.impactHint)}</p>
          </div>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Link href="/platform-requests">
              <Button variant="ghost" disabled={busy}>
                {tr(T.cancel)}
              </Button>
            </Link>
            <Button onClick={() => void submit()} disabled={busy || !valid}>
              {busy ? tr(T.submitting) : tr(T.submit)}
            </Button>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}
