/**
 * Static demo catalogue for the storefront foundation.
 *
 * PLACEHOLDER ONLY — there is no real product data, pricing or inventory behind
 * this. Real catalogue data will be served by the storefront/commerce services
 * in a later phase.
 */
export interface SampleProduct {
  handle: string;
  name: string;
  priceLabel: string;
  blurb: string;
}

export const sampleProducts: SampleProduct[] = [
  {
    handle: "merino-crew-sweater",
    name: "Merino Crew Sweater",
    priceLabel: "₺1.290",
    blurb: "Lightweight everyday knit in soft merino wool.",
  },
  {
    handle: "canvas-weekender-bag",
    name: "Canvas Weekender Bag",
    priceLabel: "₺1.850",
    blurb: "Durable cotton canvas with leather trim.",
  },
  {
    handle: "ceramic-pour-over",
    name: "Ceramic Pour-Over",
    priceLabel: "₺640",
    blurb: "Single-cup ceramic dripper for slow mornings.",
  },
  {
    handle: "linen-table-runner",
    name: "Linen Table Runner",
    priceLabel: "₺420",
    blurb: "Stonewashed linen runner for everyday dining.",
  },
];

export function findSampleProduct(handle: string): SampleProduct | undefined {
  return sampleProducts.find((product) => product.handle === handle);
}
