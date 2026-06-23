import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/navigation router'i test ortaminda mevcut degil; smoke render icin sahteleriz.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { LoginClientPage } from "../components/login-client-page.js";

describe("login page · smoke", () => {
  it("renders the Turkish session-checking state without English leakage", () => {
    const html = renderToStaticMarkup(<LoginClientPage />);
    // Mount'ta once oturum dogrulanir; ilk render Turkce "kontrol" durumudur.
    expect(html).toContain("Oturum doğrulanıyor");
    expect(html).not.toContain("Verifying session");
    expect(html).not.toContain("Sign in");
  });
});
