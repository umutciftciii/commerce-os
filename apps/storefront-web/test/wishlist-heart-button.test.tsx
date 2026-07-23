import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { WishlistProvider } from "../components/wishlist/wishlist-provider";
import { WishlistHeartButton } from "../components/wishlist/wishlist-heart-button";

/**
 * TODO-159D (ADR-093) — WishlistHeartButton render-seviyesi a11y testleri.
 *
 * `renderToStaticMarkup` (bu repoda jsdom/testing-library YOK — SSR markup deseni)
 * ile provider durumundan türeyen `aria-pressed` + erişilebilir etiket doğrulanır.
 * Tıklama-etkileşimi (optimistic/rollback) provider implementasyonu + gateway idempotency
 * testiyle kapsanır; buradaki test statik render davranışını sabitler.
 */
const card = getDictionary("tr").storefront.home.card;
const labels = {
  add: card.wishlistAdd,
  remove: card.wishlistRemove,
  savedFeedback: card.wishlistSavedFeedback,
  removedFeedback: card.wishlistRemovedFeedback,
  error: card.wishlistError,
};

describe("WishlistHeartButton", () => {
  it("favoride olan üründe aria-pressed=true + 'çıkar' etiketi", () => {
    const html = renderToStaticMarkup(
      <WishlistProvider initialSavedIds={["p1"]}>
        <WishlistHeartButton productId="p1" labels={labels} />
      </WishlistProvider>,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(`aria-label="${labels.remove}"`);
  });

  it("favoride olmayan üründe aria-pressed=false + 'ekle' etiketi", () => {
    const html = renderToStaticMarkup(
      <WishlistProvider initialSavedIds={[]}>
        <WishlistHeartButton productId="p1" labels={labels} />
      </WishlistProvider>,
    );
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain(`aria-label="${labels.add}"`);
  });

  it("provider yoksa güvenli varsayılan (aria-pressed=false, çökmеz)", () => {
    const html = renderToStaticMarkup(<WishlistHeartButton productId="p1" labels={labels} />);
    expect(html).toContain('aria-pressed="false"');
  });
});
