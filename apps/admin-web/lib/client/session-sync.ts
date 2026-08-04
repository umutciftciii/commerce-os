"use client";

/**
 * ADR-271 — Çok sekme oturum senkron kanalı (BroadcastChannel + storage fallback).
 * SessionGuard ile topbar "Çıkış yap" butonu AYNI kanalı kullanır; böylece bir
 * sekmedeki çıkış diğer sekmeleri de anında çıkarır.
 */
// ADR-271 — Kanal/anahtar adı session cookie adından KASITLI olarak ayrıdır
// (`_sync` soneki); localStorage fallback'i yalnız mesaj tipi taşır, ASLA token.
export const SESSION_CHANNEL = "commerce_os_admin_session_sync";

export type SessionSyncMessage = { type: "logout" } | { type: "expired" } | { type: "extended" };

export function postSessionMessage(msg: SessionSyncMessage): void {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(SESSION_CHANNEL);
      channel.postMessage(msg);
      channel.close();
    }
  } catch {
    /* yok say */
  }
  try {
    localStorage.setItem(SESSION_CHANNEL, JSON.stringify({ ...msg, at: Date.now() }));
  } catch {
    /* yok say */
  }
}
