"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  SkeletonRows,
  Textarea,
  useLocale,
  type DataTableColumn,
} from "@commerce-os/ui";
import type { PlatformSupportQuestionSetSummary } from "@commerce-os/api-client";
import { adminApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { setStatusLabel } from "../../../components/question-sets/labels";

const KEY_PATTERN = /^[a-z0-9-]{2,}$/;

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

export default function QuestionSetsPage() {
  const locale = useLocale() as "tr" | "en";
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [rows, setRows] = useState<PlatformSupportQuestionSetSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const r = await adminApi.listQuestionSets();
      setRows(r.items);
      setState({ status: "ready" });
    } catch (e) {
      setState({ status: "error", message: messageForError(e, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataTableColumn<PlatformSupportQuestionSetSummary>[] = [
    { header: locale === "tr" ? "Başlık" : "Title", cell: (r) => <span className="font-medium">{r.title}</span> },
    {
      header: locale === "tr" ? "Durum" : "Status",
      cell: (r) => (
        <span className="flex items-center gap-1">
          <Badge tone={r.status === "ACTIVE" ? "success" : "neutral"}>{setStatusLabel(r.status, locale)}</Badge>
          {r.isDefault ? <Badge tone="info">{locale === "tr" ? "Varsayılan" : "Default"}</Badge> : null}
        </span>
      ),
    },
    {
      header: locale === "tr" ? "Yayında" : "Published",
      cell: (r) =>
        r.latestPublishedVersion != null ? (
          <span className="font-mono text-xs">v{r.latestPublishedVersion}</span>
        ) : (
          <span className="text-xs text-slate-400">{locale === "tr" ? "yok" : "none"}</span>
        ),
    },
    { header: locale === "tr" ? "Sürüm" : "Versions", cell: (r) => <span className="text-sm">{r.versionCount}</span> },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <Button variant="secondary" size="sm" onClick={() => router.push(`/question-sets/${r.id}`)}>
          {locale === "tr" ? "Düzenle" : "Edit"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={locale === "tr" ? "Soru Setleri" : "Question Sets"}
        description={
          locale === "tr"
            ? "Ürün desteği guided akışları (platform-yönetimli). Mağazalar bu içeriği değiştiremez."
            : "Product support guided flows (platform-managed). Stores cannot edit this content."
        }
        actions={<Button onClick={() => setCreating(true)}>{locale === "tr" ? "Yeni set" : "New set"}</Button>}
      />
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <SectionCard title={locale === "tr" ? "Setler" : "Sets"}>
        {state.status === "loading" ? (
          <SkeletonRows rows={4} />
        ) : state.status === "error" ? (
          <Alert tone="error">
            {state.message}
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {locale === "tr" ? "Tekrar dene" : "Retry"}
            </Button>
          </Alert>
        ) : rows.length === 0 ? (
          <EmptyState
            title={locale === "tr" ? "Henüz soru seti yok" : "No question sets yet"}
            description={locale === "tr" ? "İlk seti oluşturun." : "Create your first set."}
          />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
        )}
      </SectionCard>

      {creating ? (
        <CreateModal
          locale={locale}
          onClose={() => setCreating(false)}
          onCreated={(id, msg) => {
            setCreating(false);
            setNotice(msg);
            router.push(`/question-sets/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function CreateModal({
  locale,
  onClose,
  onCreated,
}: {
  locale: "tr" | "en";
  onClose: () => void;
  onCreated: (id: string, message: string) => void;
}) {
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!KEY_PATTERN.test(key)) {
      setError(locale === "tr" ? "Anahtar en az 2 küçük harf/rakam/tire olmalı." : "Key must be ≥2 lowercase letters/digits/dashes.");
      return;
    }
    if (!title.trim()) {
      setError(locale === "tr" ? "Başlık gerekli." : "Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await adminApi.createQuestionSet({ key, title: title.trim(), description: description.trim() || undefined, isDefault });
      onCreated(r.questionSet.id, locale === "tr" ? "Set oluşturuldu." : "Set created.");
    } catch (e) {
      setError(messageForError(e, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={locale === "tr" ? "Yeni soru seti" : "New question set"}
      closeLabel={locale === "tr" ? "Kapat" : "Close"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {locale === "tr" ? "İptal" : "Cancel"}
          </Button>
          <Button type="submit" form="qs-form" disabled={saving}>
            {locale === "tr" ? "Oluştur" : "Create"}
          </Button>
        </>
      }
    >
      <form id="qs-form" onSubmit={onSubmit} noValidate className="space-y-3">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input
          label={locale === "tr" ? "Anahtar (teknik)" : "Key (technical)"}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          hint={locale === "tr" ? "örn. default-warranty" : "e.g. default-warranty"}
        />
        <Input label={locale === "tr" ? "Başlık" : "Title"} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          label={locale === "tr" ? "Açıklama (opsiyonel)" : "Description (optional)"}
          value={description}
          rows={2}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          {locale === "tr" ? "Varsayılan set olarak işaretle" : "Mark as a default set"}
        </label>
      </form>
    </Modal>
  );
}
