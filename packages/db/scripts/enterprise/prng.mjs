/**
 * Enterprise Demo Dataset — deterministic PRNG + helpers.
 *
 * Tüm veri üretimi TEK bir sabit tohumdan (SEED) türetilir. Aynı tohum → aynı
 * veri (bit birebir). Kayan tarih / Math.random / Date.now KULLANILMAZ; bu sayede
 * seed tekrar çalıştırıldığında birebir aynı slug/SKU/fiyat/stok üretilir ve
 * upsert idempotent kalır.
 *
 * Uygulama: mulberry32 (32-bit, hızlı, iyi dağılımlı, bağımlılıksız). Her mantıksal
 * akış (kategori, marka, ürün-i) için `childRng(label)` ile ayrı deterministik
 * alt-akış üretilebilir; böylece bir bölümdeki üretim sırası değişse bile diğer
 * bölümler kaymaz (stabilite).
 */

/** 32-bit FNV-1a hash — string → uint32 tohum. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG factory — verilen uint32 tohumdan [0,1) üreten fonksiyon döner. */
export function mulberry32(seedUint32) {
  let a = seedUint32 >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rng — deterministik yardımcılarla sarmalanmış akış. */
export class Rng {
  constructor(seed) {
    this._seed = typeof seed === "number" ? seed >>> 0 : hashSeed(String(seed));
    this._next = mulberry32(this._seed);
  }

  /** [0,1) float. */
  float() {
    return this._next();
  }

  /** [min,max] tamsayı (dahil). */
  int(min, max) {
    return min + Math.floor(this._next() * (max - min + 1));
  }

  /** Diziden bir eleman. */
  pick(arr) {
    return arr[Math.floor(this._next() * arr.length)];
  }

  /** Diziden `count` benzersiz eleman (Fisher–Yates kısmi karıştırma). */
  sample(arr, count) {
    const copy = arr.slice();
    const n = Math.min(count, copy.length);
    for (let i = 0; i < n; i += 1) {
      const j = i + Math.floor(this._next() * (copy.length - i));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy.slice(0, n);
  }

  /** Ağırlıklı seçim: [{ value, weight }] → value. */
  weighted(entries) {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    let roll = this._next() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll < 0) return entry.value;
    }
    return entries[entries.length - 1].value;
  }

  /** Verilen olasılıkla true. */
  chance(probability) {
    return this._next() < probability;
  }

  /** Alt-akış: aynı label → aynı alt-Rng (sıra-bağımsız stabilite). */
  child(label) {
    return new Rng((this._seed ^ hashSeed(String(label))) >>> 0);
  }
}

/** Kök tohum — dataset'in tamamı bundan türetilir. Değiştirmek TÜM veriyi değiştirir. */
export const ROOT_SEED = "commerce-os/enterprise-demo/v1";
