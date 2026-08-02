import { describe, expect, it, vi } from "vitest";

/**
 * Final Polish §5 — Yinelenen "Ana Sayfa" (/hero) yönetim ekranı kaldırıldı.
 *
 * Tek otorite "Ana Sayfa Deneyimi" (/home). Eski bookmark/deep-link'ler güvenli
 * çalışsın diye /hero route'u kalıcı olarak /home'a yönlenir. Bu test, route'un
 * artık CRUD UI değil, yalnız redirect olduğunu sabitler.
 */

// next/navigation redirect(): NEXT_REDIRECT fırlatan bir sentinel ile taklit.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

describe("/hero route — §5 duplicate home redirect", () => {
  it("HeroPage artık /home'a redirect eder (CRUD UI değil)", async () => {
    const mod = await import("../app/(app)/hero/page.js");
    const HeroPage = mod.default;
    expect(() => HeroPage()).toThrow(/NEXT_REDIRECT:\/home/);
    expect(redirectMock).toHaveBeenCalledWith("/home");
  });
});
