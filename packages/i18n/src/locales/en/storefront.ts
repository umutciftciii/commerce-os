import type { StorefrontDictionary } from "../tr/storefront";

/**
 * Public demo storefront (storefront-web) — English mirror of the TR source.
 * Product `handle` values are stable ids (not visible copy) and stay identical
 * across locales.
 */
export const enStorefront: StorefrontDictionary = {
  meta: {
    title: "Demo Store · commerce-os",
    description: "Demo storefront running on the commerce-os platform.",
  },
  shell: {
    brand: "Demo Store",
    announcement: "Free shipping on orders over ₺750 · Demo storefront",
    navProducts: "Products",
    navCart: "Cart",
    footerTagline: "A sample storefront running on commerce-os.",
    footerShopHeading: "Shop",
    footerAllProducts: "All products",
    footerCart: "My cart",
    footerHelpHeading: "Help",
    footerHelpShipping: "Shipping and delivery",
    footerHelpReturns: "Returns and exchanges",
    footerCompanyHeading: "Company",
    footerCompanyAbout: "About us",
    footerCompanyContact: "Contact",
    footerCopyright: "© 2026 Demo Store · All rights reserved.",
    footerPoweredBy: "Powered by commerce-os · storefront foundation",
  },
  home: {
    badge: "Demo Store",
    heroTitle: "Everyday essentials, thoughtfully made.",
    heroDescription:
      "A demo storefront running on commerce-os. The products, cart and checkout flow below are placeholders previewing the shopping experience.",
    shopCta: "Explore products",
    cartCta: "View cart",
    valueProps: [
      { title: "Fast delivery", detail: "1–3 business days across Türkiye" },
      { title: "Secure payment", detail: "256-bit SSL-protected infrastructure" },
      { title: "Easy returns", detail: "No-questions returns within 14 days" },
    ],
    featuredEyebrow: "Our picks",
    featuredTitle: "Featured products",
    featuredViewAll: "View all",
  },
  listing: {
    eyebrow: "Collection",
    title: "All products",
    description: "Demo catalogue — {count} sample products previewing the listing grid.",
  },
  detail: {
    breadcrumbProducts: "Products",
    fallbackName: "Sample product",
    fallbackCategory: "Demo",
    fallbackBlurb: "This is a sample product detail page for the storefront foundation.",
    sizeLabel: "Size",
    addToCart: "Add to cart",
    buyNow: "Buy now",
    note: "Cart and checkout actions are placeholders; no real purchase runs yet.",
  },
  cart: {
    title: "My cart",
    emptyTitle: "Your cart is empty",
    emptyDescription:
      "Add demo products to preview cart lines, quantities and totals. Cart contents are not persisted yet.",
    emptyAction: "Browse products",
  },
  checkout: {
    title: "Checkout",
    steps: [
      { title: "Information", detail: "Contact and shipping address" },
      { title: "Shipping", detail: "Delivery method and rates" },
      { title: "Payment", detail: "Secure payment capture" },
    ],
    note: "The checkout flow is a placeholder. Real shipping, tax and payment steps connect to the payment service in a later phase — no payment runs here.",
  },
  cartCount: "0",
  products: [
    {
      handle: "merinos-yuvarlak-yaka-kazak",
      name: "Merino Crew-Neck Sweater",
      category: "Apparel",
      priceLabel: "₺1,290",
      tag: "New",
      blurb: "A lightweight everyday knit in soft merino wool.",
    },
    {
      handle: "kanvas-haftasonu-cantasi",
      name: "Canvas Weekender Bag",
      category: "Accessories",
      priceLabel: "₺1,850",
      tag: "Best seller",
      blurb: "A durable cotton canvas travel bag with leather detailing.",
    },
    {
      handle: "seramik-filtre-kahve-demligi",
      name: "Ceramic Pour-Over Dripper",
      category: "Home & Living",
      priceLabel: "₺640",
      tag: "",
      blurb: "A single-cup ceramic dripper for slow mornings.",
    },
    {
      handle: "keten-masa-runneri",
      name: "Linen Table Runner",
      category: "Home & Living",
      priceLabel: "₺420",
      tag: "",
      blurb: "A stonewashed linen runner for everyday use.",
    },
  ],
};
