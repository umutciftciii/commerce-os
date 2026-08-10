"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, PageHeader, SkeletonRows, useLocale } from "@commerce-os/ui";
import type { PlatformSupportQuestionSetDetail } from "@commerce-os/api-client";
import { adminApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { QuestionSetEditor } from "../../../../components/question-sets/question-set-editor";

export default function QuestionSetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const locale = useLocale() as "tr" | "en";
  const [detail, setDetail] = useState<PlatformSupportQuestionSetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await adminApi.getQuestionSet(id);
      setDetail(r.questionSet);
    } catch (e) {
      setError(messageForError(e, locale));
    }
  }, [id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={detail ? detail.title : locale === "tr" ? "Soru seti" : "Question set"}
        description={detail ? detail.description ?? "" : ""}
        actions={
          <Link href="/question-sets">
            <Button variant="secondary" size="sm">
              {locale === "tr" ? "← Listeye dön" : "← Back to list"}
            </Button>
          </Link>
        }
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!detail && !error ? <SkeletonRows rows={5} /> : null}
      {detail ? <QuestionSetEditor initial={detail} /> : null}
    </div>
  );
}
