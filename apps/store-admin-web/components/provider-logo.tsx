"use client";

import { useState } from "react";

/**
 * F3C.5 (TODO-121) — Kargo sağlayıcı logosu. Logo PUBLIC bir URL'dir (secret DEĞİL),
 * client bundle'a güvenle gider. Bozuk/eksik URL'de sağlayıcı baş harfleri (initials)
 * fallback gösterilir. Hiçbir token/secret render edilmez.
 */
export function ProviderLogo({
  logoUrl,
  displayName,
  logoAlt,
  size = 28,
  className,
}: {
  logoUrl?: string | null;
  displayName: string;
  logoAlt?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const initials =
    displayName
      .replace(/[^\p{L}\p{N}]/gu, " ")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  const dim = { width: size, height: size };
  const base = "inline-flex shrink-0 items-center justify-center rounded-md overflow-hidden";

  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt={logoAlt ?? displayName}
        style={dim}
        onError={() => setBroken(true)}
        className={`${base} bg-white/[0.06] object-contain ring-1 ring-inset ring-white/[0.08] ${className ?? ""}`}
      />
    );
  }
  return (
    <span
      aria-label={logoAlt ?? displayName}
      role="img"
      style={dim}
      className={`${base} bg-white/[0.08] text-[10px] font-bold text-white/55 ring-1 ring-inset ring-white/[0.1] ${className ?? ""}`}
    >
      {initials}
    </span>
  );
}
