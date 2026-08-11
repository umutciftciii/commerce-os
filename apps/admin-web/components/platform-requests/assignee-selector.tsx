"use client";

// TD-178-6 — Searchable PlatformUser selector. Büyük listeyi tek seferde çekmez: min arama eşiği +
// debounce + sunucu-taraflı sayfalı sorgu. Ham id GÖSTERİLMEZ (name + email). loading/empty/error.

import { useEffect, useRef, useState } from "react";
import { Alert, Input } from "@commerce-os/ui";
import type { PlatformUserDirectoryItem } from "@commerce-os/api-client";
import { adminApi } from "../../lib/client/api";
import { messageForError } from "../../lib/client/messages";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

export function AssigneeSelector({
  locale,
  disabled,
  onPick,
}: {
  locale: "tr" | "en";
  disabled?: boolean;
  onPick: (user: PlatformUserDirectoryItem) => void;
}) {
  const [term, setTerm] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [results, setResults] = useState<PlatformUserDirectoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = term.trim();
    if (q.length < MIN_CHARS) {
      setPhase("idle");
      setResults([]);
      return;
    }
    setPhase("loading");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await adminApi.listAssignablePlatformUsers({ search: q, page: 1, pageSize: 10 });
        setResults(r.items);
        setPhase("ready");
      } catch (e) {
        setError(messageForError(e, locale));
        setPhase("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [term, locale]);

  return (
    <div className="space-y-2" data-testid="assignee-selector">
      <Input
        label={locale === "tr" ? "Kullanıcı ara" : "Search user"}
        value={term}
        disabled={disabled}
        onChange={(e) => setTerm(e.target.value)}
        hint={locale === "tr" ? `En az ${MIN_CHARS} karakter yazın (ad veya e-posta).` : `Type at least ${MIN_CHARS} characters (name or email).`}
      />
      {phase === "loading" ? (
        <p className="text-xs text-slate-400">{locale === "tr" ? "Aranıyor…" : "Searching…"}</p>
      ) : phase === "error" ? (
        <Alert tone="error">{error}</Alert>
      ) : phase === "ready" && results.length === 0 ? (
        <p className="text-xs text-slate-400">{locale === "tr" ? "Eşleşen kullanıcı yok." : "No matching users."}</p>
      ) : phase === "ready" ? (
        <ul className="max-h-48 overflow-auto rounded-md border border-slate-200">
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                disabled={disabled}
                className="flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                onClick={() => onPick(u)}
              >
                <span className="font-medium">{u.name ?? (locale === "tr" ? "(isimsiz)" : "(no name)")}</span>
                <span className="text-xs text-slate-500">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
