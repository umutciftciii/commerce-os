"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal } from "@commerce-os/ui";
import type { SessionTiming } from "@commerce-os/api-client";

/**
 * ADR-271 — Unified Session Policy istemci muhafızı (üç uygulamada ORTAK semantik).
 *
 * Sorumluluklar:
 *  - idle bitimine `warningLeadSeconds` kala erişilebilir uyarı modalı + geri sayım.
 *  - "Oturumu uzat" (extend; token rotate, absolute DEĞİŞMEZ) / "Çıkış yap".
 *  - Gerçek idle/absolute bitişinde güvenli login yönlendirmesi (sunucu-otoriter:
 *    yerel bitişte önce `me()` ile teyit; başka sekme/aktivite oturumu ayakta
 *    tuttuysa yönlendirme YAPMAZ, süreyi tazeler).
 *  - Çok sekme senkronu: BroadcastChannel (logout/expired/extended) + storage-event
 *    fallback. Bir sekmede çıkış → diğerleri anında çıkar; tekrarlı redirect yok.
 *
 * Sunucu her zaman otoriterdir; bu bileşen yalnızca UX katmanıdır.
 */

export interface SessionGuardMessages {
  warningTitle: string;
  warningBody: string; // "{time}" placeholder
  countdownLabel: string;
  extend: string;
  extendBusy: string;
  logout: string;
  extendError: string;
  closeLabel: string;
}

export interface SessionGuardProps {
  channelName: string;
  initialTiming?: SessionTiming;
  messages: SessionGuardMessages;
  /** me() → güncel timing (null: 401/oturum yok). */
  refreshTiming: () => Promise<SessionTiming | null>;
  /** extend → yeni timing (rotate). */
  extendSession: () => Promise<SessionTiming>;
  /** çıkış (cookie temizle + revoke). */
  logout: () => Promise<void>;
  /** oturum bitti/çıkıldı → güvenli login yönlendirmesi (expired mesajı + returnTo). */
  onEnded: (reason: "expired" | "logout") => void;
}

type BroadcastMessage =
  | { type: "logout" }
  | { type: "expired" }
  | { type: "extended" };

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SessionGuard(props: SessionGuardProps) {
  const { channelName, initialTiming, messages, refreshTiming, extendSession, logout, onEnded } =
    props;

  const [warning, setWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [extending, setExtending] = useState(false);
  const [extendFailed, setExtendFailed] = useState(false);

  // idle penceresi + mutlak tavan (ms). anchor = son "anlamlı aktivite" (yerel).
  const idleWindowMsRef = useRef<number>(0);
  const absoluteMsRef = useRef<number>(0);
  const anchorRef = useRef<number>(0);
  const endedRef = useRef(false); // tekrarlı redirect guard
  const warnedRef = useRef(false);

  const applyTiming = useCallback((timing: SessionTiming) => {
    const idleMs = new Date(timing.idleExpiresAt).getTime() - new Date(timing.lastActivityAt).getTime();
    idleWindowMsRef.current = Number.isFinite(idleMs) && idleMs > 0 ? idleMs : 30 * 60 * 1000;
    absoluteMsRef.current = new Date(timing.absoluteExpiresAt).getTime();
    anchorRef.current = Date.now(); // me()/login/extend anında kullanıcı aktif kabul
    warnedRef.current = false;
    setWarning(false);
    setExtendFailed(false);
  }, []);

  // Başlangıç timing'i (yoksa me() ile çek).
  useEffect(() => {
    let active = true;
    if (initialTiming) {
      applyTiming(initialTiming);
      return;
    }
    refreshTiming()
      .then((t) => {
        if (active && t) applyTiming(t);
      })
      .catch(() => {
        /* sessiz; tick zaten me() ile teyit eder */
      });
    return () => {
      active = false;
    };
  }, [initialTiming, applyTiming, refreshTiming]);

  const warningLeadMsRef = useRef<number>((initialTiming?.warningLeadSeconds ?? 300) * 1000);
  useEffect(() => {
    if (initialTiming) warningLeadMsRef.current = initialTiming.warningLeadSeconds * 1000;
  }, [initialTiming]);

  // Çok sekme senkronu.
  const channelRef = useRef<BroadcastChannel | null>(null);
  const end = useCallback(
    (reason: "expired" | "logout") => {
      if (endedRef.current) return;
      endedRef.current = true;
      onEnded(reason);
    },
    [onEnded],
  );

  // S2 — peer "expired"/"extended" mesajı SERVER-TEYİTSİZ kabul EDİLMEZ. Başka sekmenin
  // extend/rotation'ı bu sekmeyi hâlâ geçerli kılıyor olabilir (rotate edilen cookie paylaşımlı);
  // me() ile doğrula: geçerliyse timing'i tazele (LOGOUT YOK), gerçekten expired/revoked ise çık.
  // "logout" AYRI semantiktir (açık kullanıcı aksiyonu = server-side revoke) → anında iki sekme de çıkar.
  const reconcileWithServer = useCallback(() => {
    refreshTiming()
      .then((t) => {
        if (t) applyTiming(t);
        else end("expired");
      })
      .catch(() => end("expired"));
  }, [refreshTiming, applyTiming, end]);

  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(channelName);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
        const msg = event.data;
        if (msg?.type === "logout") end("logout");
        else if (msg?.type === "expired") reconcileWithServer();
        else if (msg?.type === "extended") reconcileWithServer();
      };
      return () => channel.close();
    }
    // Fallback: storage event.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== channelName || !event.newValue) return;
      try {
        const msg = JSON.parse(event.newValue) as BroadcastMessage;
        if (msg.type === "logout") end("logout");
        else if (msg.type === "expired") reconcileWithServer();
        else if (msg.type === "extended") reconcileWithServer();
      } catch {
        /* yok say */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [channelName, end, reconcileWithServer]);

  const broadcast = useCallback(
    (msg: BroadcastMessage) => {
      channelRef.current?.postMessage(msg);
      try {
        localStorage.setItem(channelName, JSON.stringify({ ...msg, at: Date.now() }));
      } catch {
        /* yok say */
      }
    },
    [channelName],
  );

  // Anlamlı aktivite (click/keydown/pointerdown) → uyarı gösterilmiyorken idle
  // capasını tazele (mousemove SAYILMAZ). Ref güncellenir; tick okur (setState churn yok).
  useEffect(() => {
    const bump = () => {
      if (!warnedRef.current) anchorRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = ["click", "keydown", "pointerdown"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  // 1sn tick: idle/absolute değerlendir; uyarı/expiry sürücüsü.
  useEffect(() => {
    const tick = async () => {
      if (endedRef.current || absoluteMsRef.current === 0) return;
      const now = Date.now();
      const idleDeadline = anchorRef.current + idleWindowMsRef.current;
      const deadline = Math.min(idleDeadline, absoluteMsRef.current);
      const lead = warningLeadMsRef.current;

      if (now >= deadline) {
        // Yerel olarak bitti — ama SUNUCU otoriter. Başka sekme/aktivite ayakta
        // tutmuş olabilir: me() ile teyit et.
        const fresh = await refreshTiming().catch(() => null);
        if (fresh) {
          applyTiming(fresh);
          return;
        }
        broadcast({ type: "expired" });
        end("expired");
        return;
      }
      if (now >= deadline - lead) {
        warnedRef.current = true;
        setWarning(true);
        setRemainingMs(deadline - now);
      } else if (warnedRef.current) {
        warnedRef.current = false;
        setWarning(false);
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, 1000);
    return () => window.clearInterval(id);
  }, [refreshTiming, applyTiming, broadcast, end]);

  const onExtend = useCallback(async () => {
    setExtending(true);
    setExtendFailed(false);
    try {
      const timing = await extendSession();
      applyTiming(timing);
      broadcast({ type: "extended" });
    } catch {
      setExtendFailed(true);
    } finally {
      setExtending(false);
    }
  }, [extendSession, applyTiming, broadcast]);

  const onLogout = useCallback(async () => {
    await logout().catch(() => {
      /* cookie sunucuda her durumda temizlenir */
    });
    broadcast({ type: "logout" });
    end("logout");
  }, [logout, broadcast, end]);

  if (!warning) return null;

  return (
    <Modal
      open={warning}
      // Kapatma (ESC / X / arka plan) "oturumda kal" = uzat olarak yorumlanır.
      onClose={onExtend}
      title={messages.warningTitle}
      closeLabel={messages.closeLabel}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {messages.warningBody.replace("{time}", formatCountdown(remainingMs))}
        </p>
        <div
          className="text-center text-2xl font-semibold tabular-nums text-slate-900"
          role="status"
          aria-live="assertive"
          aria-label={`${messages.countdownLabel}: ${formatCountdown(remainingMs)}`}
        >
          {formatCountdown(remainingMs)}
        </div>
        {extendFailed ? (
          <p role="alert" className="text-sm font-medium text-red-600">
            {messages.extendError}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button type="button" className="flex-1" onClick={onExtend} disabled={extending}>
            {extending ? messages.extendBusy : messages.extend}
          </Button>
          <Button type="button" variant="ghost" onClick={onLogout} disabled={extending}>
            {messages.logout}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
