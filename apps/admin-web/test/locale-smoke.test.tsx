import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";

// next/navigation router'i test ortaminda mevcut degil; smoke render icin sahteleriz.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { LoginClientPage } from "../components/login-client-page.js";

describe("admin-web · runtime locale switch", () => {
  it("renders Turkish login by default (no locale cookie / no provider)", () => {
    const html = renderToStaticMarkup(<LoginClientPage />);
    expect(html).toContain("Oturum doğrulanıyor");
    expect(html).not.toContain("Verifying session");
  });

  it("renders English login under an en locale (locale=en cookie)", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <LoginClientPage />
      </LocaleProvider>,
    );
    expect(html).toContain("Verifying session");
    expect(html).not.toContain("Oturum doğrulanıyor");
  });
});
