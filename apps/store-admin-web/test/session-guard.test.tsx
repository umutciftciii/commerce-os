// @vitest-environment jsdom
// Faz F (ADR-271) — Store Admin oturum muhafızı (SessionGuard) UX testleri.
//
// Kapsam (§4 uyarı UX + §5 çok-sekme):
//  - idle bitimine warningLead kala UYARI modalı + geri sayım render edilir; süre/role/store
//    ham debug değeri GÖSTERMEZ (yalnız insan-okunur).
//  - "Oturumu uzat" → extendSession çağrılır (rotation); başarıda uyarı kapanır, süre tazelenir.
//  - extend BAŞARISIZ → hata mesajı; modal kapanmaz (kullanıcı yeniden dener / çıkar).
//  - "Çıkış yap" → logout + onEnded("logout").
//  - SUNUCU-otoriter bitiş: yerel deadline geçince refreshTiming() null ise onEnded("expired");
//    başka sekme/aktivite oturumu ayakta tuttuysa (fresh timing) onEnded ÇAĞRILMAZ → redirect
//    loop yok (süre yeniden çıpalanır).
//  - Çok sekme: BroadcastChannel "logout" → onEnded("logout"); "extended" → refreshTiming reconcile.
//
// server session.timing TEK KAYNAKtır — bileşen hardcoded ikinci sayaç TUTMAZ.
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionGuard, type SessionGuardMessages } from "../components/session-guard";
import type { SessionTiming } from "@commerce-os/contracts";

const messages: SessionGuardMessages = {
  warningTitle: "Oturum sona eriyor",
  warningBody: "Oturumunuz {time} içinde kapanacak.",
  countdownLabel: "Kalan süre",
  extend: "Oturumu uzat",
  extendBusy: "Uzatılıyor…",
  logout: "Çıkış yap",
  extendError: "Uzatma başarısız oldu",
  closeLabel: "Kapat",
};

// idle penceresi 20sn, absolute 1sa, warningLead 10sn → uyarı base+10sn'de.
function makeTiming(base: number, over: Partial<SessionTiming> = {}): SessionTiming {
  return {
    lastActivityAt: new Date(base).toISOString(),
    idleExpiresAt: new Date(base + 20_000).toISOString(),
    absoluteExpiresAt: new Date(base + 3_600_000).toISOString(),
    warningLeadSeconds: 10,
    rememberMe: false,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

interface Handlers {
  refreshTiming?: ReturnType<typeof vi.fn>;
  extendSession?: ReturnType<typeof vi.fn>;
  logout?: ReturnType<typeof vi.fn>;
  onEnded?: ReturnType<typeof vi.fn>;
  channelName?: string;
}

function renderGuard(base: number, h: Handlers = {}) {
  const refreshTiming = h.refreshTiming ?? vi.fn().mockResolvedValue(null);
  const extendSession = h.extendSession ?? vi.fn();
  const logout = h.logout ?? vi.fn().mockResolvedValue(undefined);
  const onEnded = h.onEnded ?? vi.fn();
  render(
    <SessionGuard
      channelName={h.channelName ?? `test_channel_${base}`}
      initialTiming={makeTiming(base)}
      messages={messages}
      refreshTiming={refreshTiming}
      extendSession={extendSession}
      logout={logout}
      onEnded={onEnded}
    />,
  );
  return { refreshTiming, extendSession, logout, onEnded };
}

describe("SessionGuard — warning UX (§4)", () => {
  it("renders the warning modal with a countdown once within warningLead of idle expiry", async () => {
    vi.useFakeTimers();
    const base = 1_800_000_000_000;
    vi.setSystemTime(base);
    renderGuard(base);

    // base+11sn: deadline (base+20sn) - lead (10sn) = base+10sn geçildi → uyarı.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });

    expect(screen.getByRole("status").textContent).toContain("0:09");
    expect(screen.getByText(messages.warningTitle)).toBeTruthy();
    expect(screen.getByRole("button", { name: messages.extend })).toBeTruthy();
    expect(screen.getByRole("button", { name: messages.logout })).toBeTruthy();
    // Ham timing/debug değeri modalda GÖRÜNMEZ (ISO tarih / "idleExpiresAt" sızmaz).
    const html = document.body.innerHTML;
    expect(html).not.toContain("idleExpiresAt");
    expect(html).not.toContain("T00:00:00");
  });

  it("extend success closes the warning and calls extendSession (rotation)", async () => {
    vi.useFakeTimers();
    const base = 1_800_000_100_000;
    vi.setSystemTime(base);
    // extend → uzak idle'lı taze timing döndür (uyarı temizlenir).
    const extendSession = vi.fn().mockImplementation(async () => makeTiming(base + 11_000));
    renderGuard(base, { extendSession });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(screen.queryByRole("status")).toBeTruthy(); // uyarı açık

    // fake timer altında waitFor/findBy gerçek-timer polling'e dayanır → microtask'ları elle flush et.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: messages.extend }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(extendSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull(); // modal kapandı
  });

  it("extend failure shows an error and keeps the modal open (no forced logout)", async () => {
    vi.useFakeTimers();
    const base = 1_800_000_200_000;
    vi.setSystemTime(base);
    const extendSession = vi.fn().mockRejectedValue(new Error("boom"));
    const onEnded = vi.fn();
    renderGuard(base, { extendSession, onEnded });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: messages.extend }));
      await vi.advanceTimersByTimeAsync(0);
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(messages.extendError);
    expect(screen.queryByRole("status")).toBeTruthy(); // modal açık kalır
    expect(onEnded).not.toHaveBeenCalled(); // extend hatası tek başına logout ETMEZ
  });

  it("logout button calls logout() and onEnded('logout')", async () => {
    vi.useFakeTimers();
    const base = 1_800_000_300_000;
    vi.setSystemTime(base);
    const logout = vi.fn().mockResolvedValue(undefined);
    const onEnded = vi.fn();
    renderGuard(base, { logout, onEnded });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: messages.logout }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(logout).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith("logout");
  });
});

describe("SessionGuard — server-authoritative expiry (§4)", () => {
  it("ends the session (expired) only after the server confirms (refreshTiming → null)", async () => {
    vi.useFakeTimers();
    const base = 1_800_000_400_000;
    vi.setSystemTime(base);
    const refreshTiming = vi.fn().mockResolvedValue(null);
    const onEnded = vi.fn();
    renderGuard(base, { refreshTiming, onEnded });

    // deadline (base+20sn) geç → tick server'ı teyit eder (null) → expired.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000);
    });

    expect(onEnded).toHaveBeenCalledWith("expired");
  });

  it("does NOT log out when another tab/activity kept the session alive (fresh timing → re-anchor, no redirect loop)", async () => {
    vi.useFakeTimers();
    const base = 1_800_000_500_000;
    vi.setSystemTime(base);
    // Yerel deadline geçince server HÂLÂ geçerli döndürür (başka sekme uzattı) → onEnded YOK.
    const refreshTiming = vi.fn().mockImplementation(async () => makeTiming(Date.now()));
    const onEnded = vi.fn();
    renderGuard(base, { refreshTiming, onEnded });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });

    expect(refreshTiming).toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled(); // yanlış logout / redirect loop yok
  });
});

describe("SessionGuard — multi-tab sync (§5)", () => {
  it("a peer 'logout' broadcast ends this tab's session immediately", async () => {
    // Node global BroadcastChannel gerçek zamanlı teslim eder → gerçek timer.
    const channelName = `mt_logout_${Date.now()}`;
    const onEnded = vi.fn();
    renderGuard(Date.now(), { channelName, onEnded });

    const peer = new BroadcastChannel(channelName);
    await act(async () => {
      peer.postMessage({ type: "logout" });
      await new Promise((r) => setTimeout(r, 30));
    });
    peer.close();

    expect(onEnded).toHaveBeenCalledWith("logout");
  });

  it("a peer 'extended' broadcast triggers server reconciliation (refreshTiming), not a logout", async () => {
    const channelName = `mt_extended_${Date.now()}`;
    const refreshTiming = vi.fn().mockResolvedValue(makeTiming(Date.now()));
    const onEnded = vi.fn();
    renderGuard(Date.now(), { channelName, refreshTiming, onEnded });

    const peer = new BroadcastChannel(channelName);
    await act(async () => {
      peer.postMessage({ type: "extended" });
      await new Promise((r) => setTimeout(r, 30));
    });
    peer.close();

    expect(refreshTiming).toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
  });
});
