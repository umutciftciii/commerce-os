"use client";

import { useState } from "react";
import { Alert, Button, Modal, useLocale } from "../../../components/ui";
import { getDictionary } from "@commerce-os/i18n";
import type { ActivationInfo } from "../../../lib/client/api";

/**
 * TODO-087 — Admin tetikli aktivasyon/parola-sıfırlama linkini TEK SEFERLİK gösterir.
 * Link raw token içerir; kapatıldıktan sonra tekrar görüntülenemez (gerekirse yeni
 * link üretilir). Güvenlik uyarısı zorunlu; link log/snapshot'a yazılmaz.
 */
export function ActivationLinkModal({
  activation,
  onClose,
  extraFooter,
}: {
  activation: ActivationInfo;
  onClose: () => void;
  extraFooter?: React.ReactNode;
}) {
  const dict = getDictionary(useLocale());
  const l = dict.storeAdmin.customers.link;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(activation.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const purposeLabel =
    activation.purpose === "ADMIN_PASSWORD_RESET" ? l.resetPurpose : l.activationPurpose;

  return (
    <Modal
      open
      onClose={onClose}
      title={l.title}
      description={purposeLabel}
      closeLabel={l.close}
      footer={
        <>
          {extraFooter}
          <Button onClick={onClose}>{l.close}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning" title={l.warningTitle}>
          {l.warning}
        </Alert>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="break-all font-mono text-xs text-white/80">{activation.link}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-white/40">{l.expiresHint}</span>
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            {copied ? l.copied : l.copy}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
