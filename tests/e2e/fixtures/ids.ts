export const ids = {
  storeSlug: "e2e-store",
  customer: { email: "e2e-customer@example.test", password: "E2eCustomer!pass1", firstName: "E2E", lastName: "Customer" },
  variantProduct: { slug: "e2e-tshirt", title: "E2E Tshirt", priceMinor: 20000,
    variants: [
      { sku: "e2e-tshirt-s", label: "S" },
      { sku: "e2e-tshirt-m", label: "M" },
      { sku: "e2e-tshirt-l", label: "L" },
    ] },
  simpleProduct: { slug: "e2e-mug", title: "E2E Mug", sku: "e2e-mug-std", priceMinor: 5000 },
  coupon: { code: "E2E10", percentOff: 10 },
  seedOrderNumber: "e2e-order-1001",
} as const;
