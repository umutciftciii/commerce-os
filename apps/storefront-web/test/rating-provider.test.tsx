import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RatingProvider, useRating } from "../components/reviews/rating-provider";

/**
 * TODO-159E (ADR-094) — Kart rating context testi. Mock rating KALDIRILDI; kartlar yalnız
 * GERÇEK aggregate özeti gösterir. Yorumu olmayan (veya provider'sız) ürün → null → satır gizli.
 */

function Consumer({ productId }: { productId: string }) {
  const rating = useRating(productId);
  if (!rating) return <span data-testid="empty">no-rating</span>;
  return (
    <span data-testid="rating">
      {rating.average.toFixed(1)}·{rating.count}
    </span>
  );
}

describe("RatingProvider / useRating", () => {
  it("yorumu olan ürün → gerçek ortalama + sayı gösterir", () => {
    const html = renderToStaticMarkup(
      <RatingProvider summaries={{ p1: { average: 4.3, count: 12 } }}>
        <Consumer productId="p1" />
      </RatingProvider>,
    );
    expect(html).toContain("4.3·12");
    expect(html).not.toContain("no-rating");
  });

  it("özet listesinde olmayan ürün → null (satır gizli)", () => {
    const html = renderToStaticMarkup(
      <RatingProvider summaries={{ p1: { average: 4.3, count: 12 } }}>
        <Consumer productId="p2" />
      </RatingProvider>,
    );
    expect(html).toContain("no-rating");
  });

  it("count 0 → null (sahte puan üretilmez)", () => {
    const html = renderToStaticMarkup(
      <RatingProvider summaries={{ p1: { average: 0, count: 0 } }}>
        <Consumer productId="p1" />
      </RatingProvider>,
    );
    expect(html).toContain("no-rating");
  });

  it("provider yok → güvenli no-op (null)", () => {
    const html = renderToStaticMarkup(<Consumer productId="p1" />);
    expect(html).toContain("no-rating");
  });
});
