/**
 * Enterprise Demo Dataset — DETERMİNİSTİK ÜRETİCİ (SAF; IO/DB YOK).
 *
 * `generateDataset()` tek sabit tohumdan tam nesne grafiğini üretir:
 * kategoriler, attribute kataloğu, ürünler, varyantlar, variant-option değerleri,
 * ürün attribute değerleri, kategori atamaları, medya, depolar, envanter, kampanyalar.
 *
 * Aynı girdi ⇒ birebir aynı çıktı. Bu çıktı sonra persist.mjs tarafından store-scope'lu
 * upsert edilir. Testler bu SAF çıktıyı DB'siz doğrular.
 */

import { Rng, ROOT_SEED } from "./prng.mjs";
import { CATEGORY_TREE, BRANDS, BRAND_TIER_WEIGHT, ATTRIBUTES } from "./taxonomy.mjs";
import { LEAF_PROFILES } from "./profiles.mjs";
import { STORE_ID, CURRENCY, ID, SCALE, DATE_ANCHORS } from "./constants.mjs";

// --- yardımcılar -----------------------------------------------------------

const TR_MAP = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
export function slugify(input) {
  return String(input)
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR_MAP[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** KDV bölme: brüt (gross, minor) + bps → { net, vat }. */
function splitVat(grossMinor, vatBps) {
  const net = Math.round(grossMinor / (1 + vatBps / 10000));
  return { netPriceMinor: net, vatAmountMinor: grossMinor - net };
}

/** EAN-13 benzeri deterministik barkod (kontrol hanesi dahil). */
function ean13(seq) {
  const body = ("868" + String(seq).padStart(9, "0")).slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return body + String(check);
}

/** epoch aralığında deterministik tarih. t ∈ [0,1). */
function dateBetween(start, end, t) {
  return new Date(start.getTime() + Math.floor((end.getTime() - start.getTime()) * t));
}

const KIND_CODE = {
  phone: "PHN", laptop: "LAP", desktop: "DSK", monitor: "MON", headphone: "KHP", smartwatch: "WCH",
  tablet: "TAB", ram: "RAM", ssd: "SSD", gpu: "GPU", "womens-apparel": "WAP", "mens-apparel": "MAP",
  shoes: "SHO", bags: "BAG", "small-appliance": "SAP", kitchen: "KIT", "home-textile": "TXT",
  decor: "DEC", skincare: "SKN", haircare: "HAR", perfume: "PRF", fitness: "FIT", "outdoor-apparel": "OAP",
  bicycle: "BIC", "baby-diaper": "DIA", "baby-apparel": "BAP", toys: "TOY", stationery: "STA",
  "office-furniture": "OFF",
};

// Ada gerçekçilik + arama anahtar kelimesi katan tanımlayıcı havuzları.
const DESCRIPTORS = {
  "womens-apparel": ["Basic", "Premium", "Günlük", "Şık", "Rahat Kesim"],
  "mens-apparel": ["Basic", "Premium", "Günlük", "Klasik", "Spor"],
  "home-textile": ["Çift Kişilik", "Tek Kişilik", "Pamuklu", "Lüks"],
  kitchen: ["6 Parça", "Lüks", "Granit", "Çelik"],
  decor: ["Modern", "Rustik", "Vintage", "Minimal"],
  skincare: ["Yoğun Nemlendirici", "SPF 50", "Hyaluronik", "C Vitamini"],
  haircare: ["Onarıcı", "Nemlendirici", "Güçlendirici", "Keratin"],
  toys: ["Eğitici", "Sesli", "Işıklı", "STEM"],
  stationery: ["A4", "A5", "10'lu Paket", "Spiralli"],
};

// --- ana üretici -----------------------------------------------------------

export function generateDataset() {
  const rng = new Rng(ROOT_SEED);

  const out = {
    store: {
      id: STORE_ID,
      name: undefined, // persist doldurur (constants'tan)
    },
    categories: [],
    attributes: { definitions: [], options: [], categoryLinks: [] },
    products: [],
    variants: [],
    variantOptionValues: [],
    productVariantAttributes: [],
    productVariantOptionSelections: [],
    productAttributeValues: [],
    productAttributeValueOptions: [],
    categoryAssignments: [],
    media: [],
    productImages: [],
    warehouses: [],
    inventoryItems: [],
    inventoryBalances: [],
    campaigns: [],
    coupons: [],
    campaignProducts: [],
    campaignCategories: [],
  };

  // 1) Kategoriler ---------------------------------------------------------
  const catBySlug = new Map();
  for (const node of CATEGORY_TREE) {
    const row = {
      id: ID.category(node.slug),
      storeId: STORE_ID,
      name: node.name,
      slug: node.slug,
      parentId: node.parent ? ID.category(node.parent) : null,
      sortOrder: node.sortOrder,
      status: "ACTIVE",
    };
    out.categories.push(row);
    catBySlug.set(node.slug, { ...node, id: row.id });
  }
  const leaves = CATEGORY_TREE.filter((n) => n.kind);

  // 2) Attribute tanımları + option'ları ----------------------------------
  const optionIndex = new Map(); // `${code}:${value}` -> optionId
  for (const [code, def] of Object.entries(ATTRIBUTES)) {
    out.attributes.definitions.push({
      id: ID.attr(code),
      storeId: STORE_ID,
      scope: "STORE",
      code,
      name: def.name,
      description: null,
      dataType: def.dataType,
      unit: def.unit ?? null,
      status: "ACTIVE",
    });
    (def.options ?? []).forEach((o, i) => {
      const optId = ID.attrOption(code, o.value);
      optionIndex.set(`${code}:${o.value}`, optId);
      out.attributes.options.push({
        id: optId,
        attributeDefinitionId: ID.attr(code),
        storeId: STORE_ID,
        value: o.value,
        label: o.label,
        colorHex: o.colorHex ?? null,
        sortOrder: i,
        status: "ACTIVE",
      });
    });
  }

  // 3) Kategori-attribute bağlantıları (facet/searchable/variantDefining) ---
  //    Bir attribute birden çok yaprakta farklı bayraklarla bağlanabilir.
  const linkSeen = new Set();
  const addLink = (catSlug, code, flags, order) => {
    const key = `${catSlug}:${code}`;
    if (linkSeen.has(key)) return;
    linkSeen.add(key);
    out.attributes.categoryLinks.push({
      id: ID.categoryAttr(catSlug, code),
      storeId: STORE_ID,
      categoryId: ID.category(catSlug),
      attributeDefinitionId: ID.attr(code),
      required: !!flags.required,
      filterable: flags.filterable !== false,
      searchable: !!flags.searchable,
      comparable: !!flags.comparable,
      variantDefining: !!flags.variantDefining,
      visibleOnProductPage: true,
      visibleOnListing: !!flags.filterable,
      displayOrder: order,
      validationRules: {},
    });
  };
  for (const leaf of leaves) {
    const p = LEAF_PROFILES[leaf.kind];
    let order = 0;
    for (const ax of p.variantAxes) {
      // variant ekseni: variantDefining + filterable (facet varyant-option'dan gelir).
      addLink(leaf.slug, ax.code, { variantDefining: true, filterable: true, searchable: false, required: ax.code === "renk" }, order++);
    }
    for (const pa of p.productAttrs) {
      addLink(leaf.slug, pa.code, { filterable: pa.filterable, searchable: pa.searchable, required: pa.required }, order++);
    }
  }

  // 4) Ürünler + varyantlar -----------------------------------------------
  // Ürün-payı ağırlığından yaprak başına ürün sayısı (deterministik, ~SCALE.targetProducts).
  const shareSum = leaves.reduce((s, l) => s + LEAF_PROFILES[l.kind].share, 0);
  const perLeafCount = new Map(
    leaves.map((l) => [l.slug, Math.max(5, Math.round((LEAF_PROFILES[l.kind].share / shareSum) * SCALE.targetProducts))]),
  );

  // Marka havuzları (domain -> ağırlıklı liste).
  const brandsByDomain = new Map();
  for (const b of BRANDS) {
    if (!brandsByDomain.has(b.domain)) brandsByDomain.set(b.domain, []);
    brandsByDomain.get(b.domain).push({ value: b, weight: BRAND_TIER_WEIGHT[b.tier] });
  }

  const productSlugs = new Set();
  const productTitles = new Set();
  const skuSeen = new Set();
  let productN = 0;
  let barcodeSeq = 1;

  const uniqueSlug = (base) => {
    let slug = base;
    let i = 2;
    while (productSlugs.has(slug)) slug = `${base}-${i++}`;
    productSlugs.add(slug);
    return slug;
  };
  const uniqueTitle = (base, brand) => {
    let title = base;
    let i = 2;
    while (productTitles.has(title)) title = `${base} ${brand ? "Serisi" : ""} ${i++}`.replace(/\s+/g, " ").trim();
    productTitles.add(title);
    return title;
  };

  for (const leaf of leaves) {
    const p = LEAF_PROFILES[leaf.kind];
    const count = perLeafCount.get(leaf.slug);
    const domainBrands = brandsByDomain.get(p.brandDomain) ?? brandsByDomain.get("home");

    for (let i = 0; i < count; i += 1) {
      productN += 1;
      const prng = rng.child(`product:${leaf.slug}:${i}`);
      const brand = prng.weighted(domainBrands);
      const series = prng.pick(p.series);
      const descriptorPool = DESCRIPTORS[leaf.kind] ?? [];
      const descriptor = descriptorPool.length ? prng.pick(descriptorPool) : "";

      // Arama anahtar-kelime etiketi (deterministik olasılıkla).
      let tag = "";
      if (p.tags.length) {
        if (leaf.kind === "shoes") tag = "Sneaker"; // her ayakkabı sneaker anahtarını taşısın
        else if (leaf.kind === "headphone" && prng.chance(0.6)) tag = "Bluetooth";
        else if (["laptop", "desktop", "monitor"].includes(leaf.kind) && prng.chance(0.45)) tag = "Gaming";
        else if (prng.chance(0.35)) tag = prng.pick(p.tags);
      }

      // Başlık: marka + seri + (noun) + tanımlayıcı + etiket.
      const nounPart = p.noun && !series.includes(p.noun) ? p.noun : "";
      const titleBase = [brand.name, series, nounPart, descriptor, tag].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const title = uniqueTitle(titleBase, false);
      const slug = uniqueSlug(slugify(`${title}-${productN}`));

      // createdAt: epoch içinde deterministik; ~%16 "yeni ürün".
      const isNew = prng.chance(0.16);
      const createdAt = isNew
        ? dateBetween(DATE_ANCHORS.newProductSince, DATE_ANCHORS.catalogEpochEnd, prng.float())
        : dateBetween(DATE_ANCHORS.catalogEpochStart, DATE_ANCHORS.newProductSince, prng.float());

      // Durum: çoğunluk ACTIVE; küçük oran DRAFT/ARCHIVED (search'ten hariç → exclusion testi).
      const statusRoll = prng.float();
      const status = statusRoll < 0.9 ? "ACTIVE" : statusRoll < 0.95 ? "DRAFT" : "ARCHIVED";

      // Kategori atamaları: yaprak + (bazen) ebeveyn + (~%10) ikinci yaprak (cross-category).
      const categoryIds = new Set([ID.category(leaf.slug)]);
      if (leaf.parent) categoryIds.add(ID.category(leaf.parent));
      if (prng.chance(0.1)) {
        const other = prng.pick(leaves);
        if (other.slug !== leaf.slug) categoryIds.add(ID.category(other.slug));
      }

      const mediaAxisCode = p.mediaAxis && p.variantAxes.some((a) => a.code === p.mediaAxis) ? p.mediaAxis : null;

      // Ürün-seviyesi taban fiyat bandı (marka tier premium katsayısı).
      const [pmin, pmax] = p.priceBand;
      const tierMult = brand.tier === "major" ? 1.15 : brand.tier === "niche" ? 0.82 : 1.0;
      const baseGross = Math.round(clamp(pmin + prng.float() * (pmax - pmin), pmin, pmax) * tierMult);

      // Açıklama: arama anahtar kelimelerini (renk/kapasite) taşır.
      const description = buildDescription(p, leaf, prng, title);

      const product = {
        id: ID.product(productN),
        storeId: STORE_ID,
        title,
        slug,
        description,
        status,
        type: "PHYSICAL",
        brand: brand.name,
        vendor: null,
        seoTitle: `${title} | Enterprise Demo`,
        seoDescription: truncate(`${title} — ${description}`, 155),
        salesMode: "ONLINE",
        priceVisibility: "VISIBLE",
        primaryAction: "ADD_TO_CART",
        purchasable: true,
        minOrderQuantity: 1,
        shippingWeightKg: shipWeight(leaf.kind),
        shippingDesi: shipDesi(leaf.kind),
        primaryCategoryId: ID.category(leaf.slug),
        mediaDefiningAttributeId: mediaAxisCode ? ID.attr(mediaAxisCode) : null,
        createdAt,
        _kind: leaf.kind,
        _brand: brand,
        _categoryIds: [...categoryIds],
      };
      out.products.push(product);
      for (const categoryId of categoryIds) {
        out.categoryAssignments.push({ storeId: STORE_ID, productId: product.id, categoryId });
      }

      // Variant ekseni seçimleri (üründe kullanılacak option alt-kümesi).
      const axisSelections = p.variantAxes.map((ax) => {
        const def = ATTRIBUTES[ax.code];
        const poolValues = def.options.map((o) => o.value);
        const k = clamp(prng.int(ax.min, ax.max), 1, poolValues.length);
        const chosen = prng.sample(poolValues, k).sort((a, b) => poolValues.indexOf(a) - poolValues.indexOf(b));
        return { code: ax.code, values: chosen };
      });

      // ProductVariantAttribute + seçim satırları (eksen kaydı).
      axisSelections.forEach((sel, axIdx) => {
        const pvaId = `${product.id}-pva-${sel.code}`;
        out.productVariantAttributes.push({
          id: pvaId,
          storeId: STORE_ID,
          productId: product.id,
          attributeDefinitionId: ID.attr(sel.code),
          position: axIdx,
        });
        sel.values.forEach((v, vi) => {
          out.productVariantOptionSelections.push({
            id: `${pvaId}-${v}`,
            storeId: STORE_ID,
            productVariantAttributeId: pvaId,
            optionId: optionIndex.get(`${sel.code}:${v}`),
            position: vi,
          });
        });
      });

      // Cartesian (capped) → varyantlar.
      const combos = cartesian(axisSelections).slice(0, SCALE.maxVariantsPerProduct);
      const hasAxes = axisSelections.length > 0;
      const discounted = prng.chance(0.35); // compareAt > price (liste fiyatı farkı)

      const variantList = hasAxes ? combos : [[]];
      variantList.forEach((combo, comboIdx) => {
        const variantId = ID.variant(productN, comboIdx);
        // Fiyat: taban + eksen katkıları (daha büyük kapasite/beden → +delta).
        let gross = baseGross;
        for (const c of combo) gross += axisPriceDelta(c.code, c.value, baseGross);
        gross = Math.max(100, Math.round(gross / 10) * 10);
        const { netPriceMinor, vatAmountMinor } = splitVat(gross, p.vatBps);
        const compareAt = discounted ? Math.round((gross * (1.12 + prng.float() * 0.28)) / 10) * 10 : null;
        const costRatio = 0.45 + prng.float() * 0.27;
        const costMinor = Math.min(gross - 10, Math.round((gross * costRatio) / 10) * 10);

        const optionValuesJson = {};
        const comboLabelParts = [];
        for (const c of combo) {
          const label = ATTRIBUTES[c.code].options.find((o) => o.value === c.value)?.label ?? c.value;
          optionValuesJson[c.code] = label;
          comboLabelParts.push(label);
        }
        const vTitle = comboLabelParts.length ? comboLabelParts.join(" / ") : "Standart";
        const combinationKey = combo.length
          ? "v1|" +
            combo
              .map((c) => `${ID.attr(c.code)}:${optionIndex.get(`${c.code}:${c.value}`)}`)
              .sort()
              .join("|")
          : null;

        // SKU (globalde benzersiz): kind + productN + combo değerleri.
        const skuSuffix = combo.length ? combo.map((c) => c.value.toUpperCase()).join("-") : "STD";
        let sku = `EDM-${KIND_CODE[leaf.kind]}-${String(productN).padStart(4, "0")}-${skuSuffix}`;
        if (skuSeen.has(sku)) sku = `${sku}-${comboIdx}`;
        skuSeen.add(sku);

        const withBarcode = prng.chance(0.85);
        const barcode = withBarcode ? ean13(barcodeSeq++) : null;

        // Varyant durumu: çok küçük oran ARCHIVED (exclusion testi).
        const vStatus = prng.chance(0.03) ? "ARCHIVED" : "ACTIVE";

        out.variants.push({
          id: variantId,
          productId: product.id,
          storeId: STORE_ID,
          title: vTitle,
          sku,
          barcode,
          priceMinor: gross,
          compareAtMinor: compareAt,
          costMinor,
          netPriceMinor,
          vatRateBps: p.vatBps,
          vatAmountMinor,
          currency: CURRENCY,
          status: vStatus,
          optionValues: optionValuesJson,
          generationSource: hasAxes ? "ATTRIBUTE_COMBINATION" : "MANUAL",
          combinationKey,
          archivedAt: vStatus === "ARCHIVED" ? DATE_ANCHORS.catalogEpochStart : null,
          titleIsCustom: false,
          _kind: leaf.kind,
        });

        // ProductVariantOptionValue (facet + swatch + mediaOptionId kaynağı).
        for (const c of combo) {
          out.variantOptionValues.push({
            id: `${variantId}-vov-${c.code}`,
            storeId: STORE_ID,
            variantId,
            attributeDefinitionId: ID.attr(c.code),
            optionId: optionIndex.get(`${c.code}:${c.value}`),
          });
        }
      });

      // Ürün-seviyesi attribute değerleri (facet + searchable).
      for (const pa of p.productAttrs) {
        const def = ATTRIBUTES[pa.code];
        const pavId = `${product.id}-pav-${pa.code}`;
        if (pa.value === "int") {
          const [lo, hi] = pa.intRange;
          out.productAttributeValues.push({
            id: pavId, storeId: STORE_ID, productId: product.id, attributeDefinitionId: ID.attr(pa.code),
            valueText: null, valueInteger: prng.int(lo, hi), valueDecimal: null, valueBoolean: null,
            valueDate: null, optionId: null, mediaId: null,
          });
        } else if (def.dataType === "MULTI_SELECT") {
          // baglanti: 1-2 option; wireless kulaklıklar Bluetooth taşısın.
          const values = new Set();
          if (leaf.kind === "headphone") values.add("bluetooth");
          const extra = prng.sample(def.options.map((o) => o.value), prng.int(1, 2));
          for (const v of extra) values.add(v);
          out.productAttributeValues.push({
            id: pavId, storeId: STORE_ID, productId: product.id, attributeDefinitionId: ID.attr(pa.code),
            valueText: null, valueInteger: null, valueDecimal: null, valueBoolean: null, valueDate: null,
            optionId: null, mediaId: null,
          });
          for (const v of values) {
            out.productAttributeValueOptions.push({
              id: `${pavId}-${v}`, storeId: STORE_ID, productAttributeValueId: pavId,
              optionId: optionIndex.get(`${pa.code}:${v}`),
            });
          }
        } else {
          // SELECT/COLOR → tek option.
          const v = prng.pick(def.options.map((o) => o.value));
          out.productAttributeValues.push({
            id: pavId, storeId: STORE_ID, productId: product.id, attributeDefinitionId: ID.attr(pa.code),
            valueText: null, valueInteger: null, valueDecimal: null, valueBoolean: null, valueDate: null,
            optionId: optionIndex.get(`${pa.code}:${v}`), mediaId: null,
          });
        }
      }
    }
  }

  // 5) Medya (yer tutucu; domain başına 1 asset) + kontrollü kapak ataması ---
  const domainOfKind = (kind) => LEAF_PROFILES[kind].brandDomain;
  const mediaByDomain = new Map();
  for (const domain of new Set(BRANDS.map((b) => b.domain))) {
    const id = ID.media(domain);
    mediaByDomain.set(domain, id);
    out.media.push({
      id, storeId: STORE_ID, context: "PRODUCT",
      storageKey: `enterprise-demo/placeholder/${domain}.svg`,
      mimeType: "image/svg+xml", byteSize: 900, width: 800, height: 800,
      altText: `${domain} demo görseli`,
    });
  }
  // ~%65 ürün kapak görselli (deterministik); geri kalan görselsiz (kontrollü senaryo).
  {
    const imgRng = rng.child("images");
    for (const product of out.products) {
      if (!imgRng.chance(0.65)) continue;
      const domain = domainOfKind(product._kind);
      out.productImages.push({
        id: `${product.id}-img-0`, storeId: STORE_ID, productId: product.id,
        mediaId: mediaByDomain.get(domain) ?? mediaByDomain.get("home"),
        position: 0, attributeDefinitionId: null, optionId: null,
      });
    }
  }

  // 6) Depolar + envanter --------------------------------------------------
  out.warehouses.push(
    { id: ID.warehouse("default"), storeId: STORE_ID, code: "DEFAULT", name: "İstanbul Ana Depo", status: "ACTIVE", isDefault: true, priority: 0, city: "İstanbul", district: "Kadıköy", line1: "Demo Mah." },
    { id: ID.warehouse("ankara"), storeId: STORE_ID, code: "ANKARA", name: "Ankara Depo", status: "ACTIVE", isDefault: false, priority: 10, city: "Ankara", district: "Çankaya", line1: "Demo Cad." },
  );
  const invRng = rng.child("inventory");
  for (const variant of out.variants) {
    const bucket = invRng.weighted([
      { value: "in", weight: 70 },
      { value: "low", weight: 13 },
      { value: "out", weight: 12 },
      { value: "high", weight: 5 },
    ]);
    let onHand, reorderPoint, safetyStock, incoming;
    if (bucket === "in") { onHand = invRng.int(15, 120); reorderPoint = 8; safetyStock = 3; incoming = invRng.chance(0.2) ? invRng.int(10, 40) : 0; }
    else if (bucket === "low") { onHand = invRng.int(1, 6); reorderPoint = 8; safetyStock = 2; incoming = invRng.chance(0.5) ? invRng.int(20, 60) : 0; }
    else if (bucket === "out") { onHand = 0; reorderPoint = 8; safetyStock = 2; incoming = invRng.chance(0.6) ? invRng.int(20, 80) : 0; }
    else { onHand = invRng.int(200, 600); reorderPoint = 10; safetyStock = 5; incoming = 0; }

    // InventoryItem = varsayılan depo otoritesi (onHand/reserved birebir).
    out.inventoryItems.push({
      id: `${variant.id}-inv`, storeId: STORE_ID, variantId: variant.id,
      quantityOnHand: onHand, quantityReserved: 0, lowStockThreshold: reorderPoint,
    });
    // Varsayılan depo balance (otorite ile senkron).
    out.inventoryBalances.push({
      id: `${variant.id}-bal-default`, storeId: STORE_ID, warehouseId: ID.warehouse("default"),
      variantId: variant.id, onHand, reserved: 0, incoming, safetyStock, reorderPoint,
    });
    // Ankara depo bağımsız (out ise 0; aksi küçük ek stok).
    const ankOnHand = bucket === "out" || bucket === "low" ? 0 : invRng.int(0, 30);
    out.inventoryBalances.push({
      id: `${variant.id}-bal-ankara`, storeId: STORE_ID, warehouseId: ID.warehouse("ankara"),
      variantId: variant.id, onHand: ankOnHand, reserved: 0, incoming: 0, safetyStock: 0, reorderPoint: 0,
    });
  }

  // 7) Kampanyalar ---------------------------------------------------------
  buildCampaigns(out, rng);

  return out;
}

// --- alt üreticiler / yardımcılar ------------------------------------------

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function truncate(s, n) { return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…"; }

function cartesian(selections) {
  if (selections.length === 0) return [];
  let acc = [[]];
  for (const sel of selections) {
    const next = [];
    for (const row of acc) for (const v of sel.values) next.push([...row, { code: sel.code, value: v }]);
    acc = next;
  }
  return acc;
}

function axisPriceDelta(code, value, base) {
  const rank = {
    depolama: { "128gb": 0, "256gb": 0.06, "512gb": 0.14, "1tb": 0.28 },
    ram_kapasitesi: { "8gb": 0, "16gb": 0.08, "32gb": 0.2, "64gb": 0.4 },
    ssd_kapasitesi: { "256gb": 0, "512gb": 0.08, "1tb": 0.18, "2tb": 0.34 },
    ekran_boyutu: { "24": 0, "27": 0.12, "32": 0.25 },
    yenileme_hizi: { "60hz": 0, "75hz": 0.03, "144hz": 0.12, "165hz": 0.16 },
    hacim: { "50ml": 0, "100ml": 0.35, "200ml": 0.7, "400ml": 1.1 },
    beden: { xs: 0, s: 0, m: 0, l: 0.01, xl: 0.02, xxl: 0.03 },
    numara: {},
    bez_bedeni: {},
    renk: {},
  };
  const table = rank[code];
  const factor = table && table[value] !== undefined ? table[value] : 0;
  return Math.round(base * factor);
}

function shipWeight(kind) {
  const heavy = { laptop: 2.2, desktop: 9, monitor: 5.5, bicycle: 14, "office-furniture": 12, "small-appliance": 3.5 };
  return heavy[kind] ?? 0.6;
}
function shipDesi(kind) {
  const desi = { laptop: 8, desktop: 40, monitor: 30, bicycle: 90, "office-furniture": 70, "small-appliance": 18, kitchen: 12 };
  return desi[kind] ?? 3;
}

function buildDescription(profile, leaf, prng, title) {
  const parts = [`${title}.`];
  // Renk ekseni varsa mevcut renkleri açıklamaya kat (arama: siyah/beyaz...).
  const renkAxis = profile.variantAxes.find((a) => a.code === "renk");
  if (renkAxis) parts.push("Renk seçenekleri: Siyah, Beyaz, Gri, Mavi ve daha fazlası.");
  // Kapasite eksenleri (arama: 16 gb / 512 gb / ssd / ram).
  const caps = [];
  if (profile.variantAxes.some((a) => a.code === "ram_kapasitesi")) caps.push("8 GB, 16 GB, 32 GB RAM");
  if (profile.variantAxes.some((a) => a.code === "ssd_kapasitesi")) caps.push("256 GB, 512 GB, 1 TB SSD");
  if (profile.variantAxes.some((a) => a.code === "depolama")) caps.push("128 GB, 256 GB, 512 GB depolama");
  if (caps.length) parts.push(`Seçenekler: ${caps.join(" / ")}.`);
  if (leaf.kind === "laptop") parts.push("Yüksek performanslı Laptop; ofis ve oyun (gaming) için ideal.");
  if (leaf.kind === "headphone") parts.push("Bluetooth ve kablolu bağlantı desteği.");
  if (leaf.kind === "shoes") parts.push("Günlük kullanım için rahat sneaker taban.");
  parts.push("Enterprise Demo kataloğu için üretilmiş örnek üründür.");
  return parts.join(" ");
}

/**
 * Kampanya seti — aktif/yaklaşan/sona ermiş × yüzde/sabit × ürün/kategori/marka.
 * Aktif+public+rozet-tipi olanlar backfill'de search doküman rozetini besler.
 */
function buildCampaigns(out, rng) {
  const cr = rng.child("campaigns");
  const activeProducts = out.products.filter((p) => p.status === "ACTIVE");
  const productIdsByBrand = (brandName) => activeProducts.filter((p) => p.brand === brandName).map((p) => p.id);
  const pickProductIds = (n, filterFn) => {
    const pool = activeProducts.filter(filterFn ?? (() => true)).map((p) => p.id);
    return cr.sample(pool, Math.min(n, pool.length));
  };

  let n = 0;
  let couponN = 0;
  const add = (spec) => {
    n += 1;
    const id = ID.campaign(n);
    const {
      name, type, discountType, discountValue, status = "ACTIVE", window = "active",
      isPublic = true, stackable = false, scopeProductIds = [], scopeCategorySlugs = [],
      badgeLabel = null, badgeVariant = null, minOrderAmountMinor = null, maxDiscountAmountMinor = null,
      couponCode = null, priority = 0, accessModel = "AUTO_VISIBLE",
    } = spec;
    const w = DATE_ANCHORS;
    const [startsAt, endsAt] =
      window === "upcoming" ? [w.upcomingStart, w.upcomingEnd] :
      window === "ended" ? [w.endedStart, w.endedEnd] : [w.activeStart, w.activeEnd];

    out.campaigns.push({
      id, storeId: STORE_ID, name, description: `${name} — demo kampanyası.`,
      status, type, discountType, discountValue,
      maxDiscountAmountMinor, minOrderAmountMinor, startsAt, endsAt,
      totalUsageLimit: null, perCustomerUsageLimit: null, usageCount: 0,
      stackable, priority, isPublic,
      displayTitle: name, shortDescription: `${name} fırsatı`, terms: "Demo koşulları geçerlidir.",
      badgeLabel, badgeVariant, cardStyle: "STANDARD", accessModel, displayPriority: priority,
    });
    for (const pid of scopeProductIds) out.campaignProducts.push({ campaignId: id, productId: pid, storeId: STORE_ID });
    for (const slug of scopeCategorySlugs) out.campaignCategories.push({ campaignId: id, categoryId: ID.category(slug), storeId: STORE_ID });
    if (couponCode) {
      couponN += 1;
      out.coupons.push({
        id: ID.coupon(couponN), storeId: STORE_ID, campaignId: id,
        code: couponCode, normalizedCode: couponCode.toUpperCase(),
        status: "ACTIVE", totalUsageLimit: null, perCustomerUsageLimit: null, usageCount: 0,
        startsAt: null, endsAt: null,
      });
    }
    return id;
  };

  // Aktif — geniş kapsam (rozet bolluğu; autocomplete rozet testi).
  add({ name: "Sepette %5 İndirim", type: "AUTOMATIC_CART", discountType: "PERCENT", discountValue: 5, stackable: true, badgeLabel: "%5", badgeVariant: "DEFAULT", priority: 1 });
  add({ name: "Telefonlarda %10", type: "CATEGORY_DISCOUNT", discountType: "PERCENT", discountValue: 10, scopeCategorySlugs: ["telefon"], badgeLabel: "%10", badgeVariant: "LIMITED_TIME", priority: 5 });
  add({ name: "Kadın Giyimde %15", type: "CATEGORY_DISCOUNT", discountType: "PERCENT", discountValue: 15, scopeCategorySlugs: ["kadin-giyim"], badgeLabel: "%15", badgeVariant: "WEEKEND", priority: 6 });
  add({ name: "Kulaklıklarda %25", type: "CATEGORY_DISCOUNT", discountType: "PERCENT", discountValue: 25, scopeCategorySlugs: ["kulaklik"], badgeLabel: "%25", badgeVariant: "SUPER", priority: 7 });
  add({ name: "Seçili Ürünlerde %20", type: "PRODUCT_DISCOUNT", discountType: "PERCENT", discountValue: 20, scopeProductIds: pickProductIds(20), badgeLabel: "%20", badgeVariant: "SUPER", priority: 8 });
  add({ name: "Seçili Ürünlerde 50₺ İndirim", type: "PRODUCT_DISCOUNT", discountType: "FIXED_AMOUNT", discountValue: 5000, scopeProductIds: pickProductIds(20), badgeLabel: "50₺", badgeVariant: "DEFAULT", priority: 4 });
  add({ name: "Samsung Fırsatları", type: "PRODUCT_DISCOUNT", discountType: "PERCENT", discountValue: 12, scopeProductIds: productIdsByBrand("Samsung"), badgeLabel: "Samsung %12", badgeVariant: "LIMITED_TIME", priority: 9 });
  add({ name: "Apple Fırsatları", type: "PRODUCT_DISCOUNT", discountType: "PERCENT", discountValue: 8, scopeProductIds: productIdsByBrand("Apple"), badgeLabel: "Apple %8", badgeVariant: "LIMITED_TIME", priority: 9 });
  add({ name: "Sporda %15", type: "AUTOMATIC_CART", discountType: "PERCENT", discountValue: 15, stackable: true, scopeCategorySlugs: ["fitness-ekipmanlari", "outdoor-giyim", "bisiklet"], badgeLabel: "Spor %15", badgeVariant: "DEFAULT", priority: 3 });

  // Kupon kodlu (public claimable) — COUPON_CODE rozeti.
  add({ name: "Hoş Geldin Kuponu", type: "COUPON_CODE", discountType: "PERCENT", discountValue: 10, accessModel: "PUBLIC_CLAIMABLE", couponCode: "WELCOME10", badgeLabel: "WELCOME10", badgeVariant: "NEW_CUSTOMER", priority: 2 });
  add({ name: "Ev Tekstili Kuponu", type: "COUPON_CODE", discountType: "FIXED_AMOUNT", discountValue: 10000, accessModel: "PUBLIC_CLAIMABLE", couponCode: "BAHAR100", scopeCategorySlugs: ["ev-tekstili"], badgeLabel: "BAHAR100", badgeVariant: "WEEKEND", priority: 2 });

  // Yaklaşan (henüz başlamadı → rozet YOK; sınıflandırma testi).
  add({ name: "Yaz Sezonu (Yakında)", type: "AUTOMATIC_CART", discountType: "PERCENT", discountValue: 30, window: "upcoming", scopeCategorySlugs: ["mutfak"], badgeLabel: "%30", badgeVariant: "LIMITED_TIME", priority: 1 });

  // Sona ermiş (pencere geçmiş → rozet YOK).
  add({ name: "Kış İndirimi (Bitti)", type: "PRODUCT_DISCOUNT", discountType: "PERCENT", discountValue: 40, window: "ended", scopeProductIds: pickProductIds(15), badgeLabel: "%40", badgeVariant: "SUPER", priority: 1 });

  // Arşivlenmiş (status ARCHIVED → rozet YOK).
  add({ name: "Arşiv Kampanyası", type: "CATEGORY_DISCOUNT", discountType: "PERCENT", discountValue: 50, status: "ARCHIVED", scopeCategorySlugs: ["dekorasyon"], badgeLabel: "%50", badgeVariant: "SUPER", priority: 0 });
}
