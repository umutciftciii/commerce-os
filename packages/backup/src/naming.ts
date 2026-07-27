/**
 * PB-2/PB-3 — Deterministik dosya adı + güvenli isim/anahtar üretimi.
 *
 * Kurallar (spec §3, §13):
 *  - Artefakt adı: `<environment>-<UTC-timestamp>` (deterministik; zaman ENJEKTE edilir, `Date.now()` gizli
 *    çağrısı YOK → test edilebilir).
 *  - environment yalnız `[a-z0-9-]` (path-traversal / object-key enjeksiyonu engellenir).
 *  - Timestamp UTC (spec §7 "clock/timezone UTC").
 */

/** UTC damgası: `YYYYMMDDTHHmmssZ` (ör. 20260727T210000Z). Saniye çözünürlüğü yeterli + sıralanabilir. */
export function formatBackupTimestamp(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error("formatBackupTimestamp: geçersiz Date.");
  }
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

/** Environment etiketini güvenli slug'a indirger; boş/geçersizse hata (sessiz "unknown"a düşmez). */
export function normalizeEnvironment(environment: string): string {
  const slug = environment.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error(`normalizeEnvironment: geçersiz environment etiketi (${JSON.stringify(environment)}).`);
  }
  return slug;
}

export interface ArtifactNames {
  /** `<env>-<ts>` — grup/manifest ilişkilendirme anahtarı. */
  base: string;
  /** Şifreli custom-format dump (offsite'a yüklenen asıl artefakt). */
  dump: string;
  /** Yüklenen artefaktın SHA-256'sı (yan dosya). */
  checksum: string;
  /** Manifest (secret İÇERMEZ). */
  manifest: string;
}

/** Bir backup turu için tüm artefakt adlarını üretir. */
export function buildArtifactNames(environment: string, date: Date): ArtifactNames {
  const base = `${normalizeEnvironment(environment)}-${formatBackupTimestamp(date)}`;
  return {
    base,
    dump: `${base}.dump.enc`,
    checksum: `${base}.dump.enc.sha256`,
    manifest: `${base}.manifest.json`,
  };
}

const BASE_RE = /^([a-z0-9-]+)-(\d{8}T\d{6}Z)$/;

export interface ParsedArtifact {
  environment: string;
  /** UTC damgası string'i. */
  stamp: string;
  /** Damgadan çözülen zaman (retention grup/sıralama için). */
  date: Date;
}

/** `<env>-<ts>.<...>` ya da `<env>-<ts>` biçimli bir addan environment+zaman çözer; eşleşmezse null. */
export function parseArtifactBase(name: string): ParsedArtifact | null {
  // Uzantıyı (ilk '.') at.
  const dot = name.indexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  const m = BASE_RE.exec(base);
  if (!m) return null;
  const stamp = m[2]!;
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(
    9,
    11,
  )}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { environment: m[1]!, stamp, date };
}

/**
 * Güvenli dosya adı guard'ı — path-traversal / mutlak yol / kontrol karakteri / boş reddedilir.
 * Object key'leri ve türetilmiş dosya adları bu guard'dan geçer.
 */
export function assertSafeFilename(name: string): string {
  if (!name || name.length > 255) {
    throw new Error("assertSafeFilename: boş ya da çok uzun ad.");
  }
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw new Error(`assertSafeFilename: yol ayıracı/kontrol karakteri içeremez (${JSON.stringify(name)}).`);
  }
  if (name === "." || name === ".." || name.startsWith("..")) {
    throw new Error(`assertSafeFilename: göreli-yol bileşeni yasak (${JSON.stringify(name)}).`);
  }
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      throw new Error("assertSafeFilename: kontrol karakteri içeremez.");
    }
  }
  return name;
}

/** Storage object key üretir: `<prefix><name>`; prefix normalize edilir (tek trailing slash). */
export function buildObjectKey(prefix: string, name: string): string {
  assertSafeFilename(name);
  const clean = prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (clean.includes("..")) {
    throw new Error(`buildObjectKey: prefix göreli-yol bileşeni içeremez (${JSON.stringify(prefix)}).`);
  }
  return clean ? `${clean}/${name}` : name;
}
