import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { StoreLoginClient } from "../components/store-login-client.js";

describe("store-admin-web · runtime locale switch", () => {
  it("renders Turkish login by default (no locale cookie / no provider)", () => {
    const html = renderToStaticMarkup(<StoreLoginClient />);
    expect(html).toContain("Oturum doğrulanıyor");
    expect(html).not.toContain("Verifying session");
  });

  it("renders English login under an en locale (locale=en cookie)", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <StoreLoginClient />
      </LocaleProvider>,
    );
    expect(html).toContain("Verifying session");
    expect(html).not.toContain("Oturum doğrulanıyor");
  });
});
