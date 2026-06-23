"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Alt aksiyon alani (ornegin Vazgec / Kaydet butonlari). */
  footer?: ReactNode;
  /** Erisilebilir kapatma butonu etiketi (i18n'den gelir). */
  closeLabel: string;
  className?: string;
}

/**
 * Sunum amacli, temel erisilebilir diyalog. role="dialog" + aria-modal, ESC ile
 * kapanma, arka plan tiklamasiyla kapanma ve acilista odak yonetimi saglar.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    // Acilista paneli odakla; ekran okuyucu baglami diyalog basligindan baslar.
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-hidden className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? "modal-description" : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-panel focus:outline-none",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-sm font-semibold tracking-tightish text-slate-900">
              {title}
            </h2>
            {description ? (
              <p id="modal-description" className="mt-0.5 text-sm text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className="px-5 py-5">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
