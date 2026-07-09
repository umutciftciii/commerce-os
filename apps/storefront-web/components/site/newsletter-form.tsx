"use client";

import { useState } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { Button, Input } from "../ui";

/**
 * MOCK: Newsletter (bülten) kaydı — gerçek veri kaynağı yok, bkz. todo.md.
 *
 * Gerçek bir abonelik ucu YOKTUR; submit yalnizca istemci-tarafi bir tesekkur
 * durumu gosterir, e-posta hicbir yere GONDERILMEZ/saklanmaz. Metin bunu
 * (disclaimer ile) acikca belirtir; kullanici yanıltılmaz.
 */
export function NewsletterForm({ t }: { t: StorefrontDictionary["newsletter"] }) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="text-sm text-ink" role="status">
        {t.success}
      </p>
    );
  }

  return (
    <form
      className="flex w-full max-w-md flex-col gap-3 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        setDone(true); // MOCK: persist yok.
      }}
    >
      <label htmlFor="newsletter-email" className="sr-only">
        {t.placeholder}
      </label>
      <Input
        id="newsletter-email"
        type="email"
        required
        placeholder={t.placeholder}
        className="flex-1"
        autoComplete="email"
      />
      <Button type="submit" size="md" className="shrink-0">
        {t.submit}
      </Button>
    </form>
  );
}
