export const ids = {
  storeSlug: "e2e-store",
  customer: { email: "e2e-customer@example.test", password: "E2eCustomer!pass1", firstName: "E2E", lastName: "Customer" },
  // Shopping Balance Admin E2E — store-admin login (SUPER_ADMIN) + cross-store izolasyon fixture'ı.
  storeAdmin: { email: "e2e-admin@example.test", password: "E2eAdmin!pass1" },
  // Phase G — StoreUser kimlik/RBAC/oturum E2E fixture'ları.
  storeAuth: {
    // Deterministik OWNER (native login + linkli PlatformUser). Rol i18n: "Sahip".
    owner: { email: "e2e-admin@example.test", password: "E2eAdmin!pass1", roleLabel: "Sahip" },
    // En kısıtlı rol — okuma serbest, manage/mutation yok. Rol i18n: "Görüntüleyici".
    viewer: { email: "e2e-viewer@example.test", password: "E2eViewer!pass1", roleLabel: "Görüntüleyici" },
    // Store context (session-derived; server-otoriter).
    storeName: "E2E Store",
    storeSlug: "e2e-store",
    // PlatformUser (yalnız platform; e2e-store'da StoreUser DEĞİL) — store-admin login'de ÇALIŞMAMALI.
    platformOnly: { email: "e2e-agent@example.test", password: "E2eAdmin!pass1" },
    // DOM'a asla sızmaması gereken ham iç kimlik alanları.
    forbiddenIdKeys: ["linkedPlatformUserId", "tokenHash", "passwordHash", "rotatedFromSessionId"],
  },
  shoppingBalanceAdmin: {
    // Seed'lenen e2e-customer'ın alışveriş bakiyesi (goodwill ₺1.000,00). Liste + detay assert'i.
    customerName: "E2E Customer",
    customerEmail: "e2e-customer@example.test",
    availableText: "1.000,00",
    // Cross-store: e2e-store-2 müşterisi e2e-store listesinde ASLA görünmemeli.
    otherStoreCustomerEmail: "e2e-store2-customer@example.test",
    // Grant sonrası artış doğrulaması: ₺250,00 tanımla → 1.250,00.
    grantAmountTl: "250",
    grantedAvailableText: "1.250,00",
  },
  variantProduct: { slug: "e2e-tshirt", title: "E2E Tshirt", priceMinor: 20000,
    variants: [
      { sku: "e2e-tshirt-s", label: "S" },
      { sku: "e2e-tshirt-m", label: "M" },
      { sku: "e2e-tshirt-l", label: "L" },
    ] },
  simpleProduct: { slug: "e2e-mug", title: "E2E Mug", sku: "e2e-mug-std", priceMinor: 5000 },
  coupon: { code: "E2E10", percentOff: 10 },
  seedOrderNumber: "e2e-order-1001",
  // TODO-176B (BUG-CART-006) — Reorder invariant siparişi: çok-varyantlı ürün (tshirt M) + adet 2.
  // Tek-satır mug siparişinin aksine bu, "Tekrar Satın Al" sonrası sepette DOĞRU varyant + DOĞRU
  // adet + DOĞRU fiyat korunuyor mu invariant'ını tam kanıtlar (reorder == /cart == checkout).
  reorderOrder: {
    number: "e2e-order-2001",
    variantSku: "e2e-tshirt-m",
    variantLabel: "M",
    quantity: 2,
    unitMinor: 20000,
    // Beklenen sepet ara toplamı = 2 × ₺200,00 = ₺400,00.
    expectedSubtotalText: "400,00",
  },
  // TODO-176B (PR2) — Alışveriş bakiyesi (goodwill kredi grant). Finansal invariant: gösterilen
  // kullanılabilir bakiye == grant; STORE_CREDIT bir bakiyedir (asla nakde çevrilmez).
  goodwillCredit: {
    amountMinor: 100000,
    // balance-section artık locale-otoriter `formatMinor` (tr-TR) kullanır → tutar TR mağazada
    // "1.000,00" biçiminde render edilir (önceki en-US "1,000.00" lokalizasyon defekti düzeltildi).
    availableText: "1.000,00",
    // credit.goodwill semantik key'inin TR karşılığı (balance-section DESC map).
    movementText: "Müşteri memnuniyeti kapsamında bakiye eklendi",
  },
  // TODO-176B (PR2) — İade fixture'ları (İadelerim + refund destination invariant). İki iade
  // farklı IMMUTABLE refund hedefi + farklı statü taşır (read-only, deterministik).
  returns: [
    {
      number: "e2e-return-1001",
      destinationText: "Alışveriş bakiyesine",
      statusText: "Talep alındı",
    },
    {
      number: "e2e-return-1002",
      destinationText: "Orijinal ödeme yöntemine",
      statusText: "Onaylandı",
    },
  ],
  // TODO-177 (ADR-289) Faz F — Ürün Desteği fixture'ları. Order-1001'in mug satırı
  // (warrantyMonths=12 + DELIVERED shipment → warranty anchor). 7 published DEFAULT
  // question-set + topic default seed'lidir; guided flow topic→soru→branch çalışır.
  // Seeded RESOLVED ticket (S900001) admin inbox + müşteri reopen testleri içindir.
  support: {
    deliveredOrderNumber: "e2e-order-1001",
    // Seed'lenen mug satırının deterministik id'si (e2e-seed.mjs). Order-line CTA href'i
    // `?order=<no>&line=<orderLineId>` taşır → müşteri ürün/varyant yeniden seçmez.
    orderLineId: "e2e-order-1001-line-1",
    orderLineProductTitle: "E2E Mug",
    // Guided flow ilk konu (TR label; ham enum PRODUCT_NOT_WORKING gösterilmez).
    topicLabel: "Ürün çalışmıyor",
    // Entry sorusunun prompt'u (JSON seed graph'tan; branching doğrulaması için).
    entryPromptFragment: "hiç açılmıyor",
    // Seeded RESOLVED ticket (müşteri resolve edemez → reopen testi için seed).
    seededTicketNumber: "S900001",
    seededTicketStatusText: "Çözüldü",
  },
  // TODO-178 Faz F — Store→Platform talep sistemi. Store Admin (e2e-admin, SUPER_ADMIN) mağaza
  // talebi açar; Platform Admin (aynı SUPER_ADMIN kullanıcı, admin-web global) inbox'ta yönetir.
  // e2e-agent (SUPPORT_ADMIN, login yok) yalnız AssigneeSelector "başka kullanıcı" hedefi.
  // NOT: PR-###### numarası GLOBAL sayaçtan gelir → deterministik değil; testler create'ten
  // dönen numarayı runtime'da yakalar (sabit numara YOK).
  platformRequest: {
    // Login kullanıcıları store-admin ile paylaşılır (storeAdmin.email/password = e2e-admin).
    agentName: "E2E Agent",
    agentSearchTerm: "agent",
    // Create formu — deterministik seçim değerleri (görünen TR metinler).
    categoryLabel: "Platform Politikası", // PLATFORM_POLICY (migration seed, aktif)
    categoryOtherLabel: "Katalog/Kategori Taksonomisi", // recategorize hedefi (CATALOG_TAXONOMY)
    storeImpactLabel: "Yüksek etki", // HIGH
    // Store yüzeyi status metinleri (store-admin lib/client/platform-request-labels.ts).
    storeStatusResolved: "Çözüldü",
    storeStatusWaiting: "Yanıtınız bekleniyor",
    // Platform yüzeyi (admin-web components/platform-requests/labels.ts).
    platformStatusInProgress: "İşlemde",
    platformPriorityHigh: "Yüksek",
    // INTERNAL sızıntı negatif-assert metinleri (store yüzeyinde ASLA görünmemeli).
    internalLeakStrings: ["Dahili not", "Dahili ek", "mağaza görmez", "INTERNAL"],
  },
} as const;
