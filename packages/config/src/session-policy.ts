/**
 * ADR-271 — Unified Session Policy (TEK KAYNAK, uc uygulama ortak).
 *
 * SAF modul: `node:*` importu YOK, `process.env`e TOP-LEVEL erisim YOK. Boylece
 * hem gateway (Node) hem de Next BFF (server) tarafindan guvenle import edilir;
 * pure fonksiyonlar unit-test edilebilir ve client'a deger olarak (prop) tasinabilir.
 *
 * Iki-kapili omur modeli:
 *   - idle (kayan)   : `lastActivityAt + idleTimeout(rememberMe)` — anlamli
 *                      aktiviteyle (throttle'li) yenilenir.
 *   - absolute (tavan): `absoluteExpiresAt` — login'de sabitlenir, ASLA uzamaz.
 * Gecerlilik: `now <= min(idleDeadline, absoluteDeadline) && revokedAt == null`.
 *
 * `rememberMe` login/extend'de server-otoriter secilir ve hangi pencerenin
 * gecerli oldugunu belirler.
 */

export interface SessionPolicyWindow {
  /** Kayan idle penceresi (saniye). */
  idleTimeoutSeconds: number;
  /** Mutlak omur tavani (saniye). */
  absoluteExpirySeconds: number;
}

export interface SessionPolicy {
  /** "Beni hatirla" KAPALI. */
  rememberOff: SessionPolicyWindow;
  /** "Beni hatirla" ACIK. */
  rememberOn: SessionPolicyWindow;
  /** idle bitimine kac saniye kala uyari gosterilir. */
  warningLeadSeconds: number;
  /**
   * `lastActivityAt` DB yazma throttle penceresi (saniye): son yazmadan bu
   * sure gecmeden idle capasi tekrar DB'ye yazilmaz (her request'te write yok).
   */
  activityThrottleSeconds: number;
}

/**
 * S3 (post-audit hardening) — activity throttle production alt sınırı (saniye). 0 = footgun
 * (her anlamlı request'te DB write + idle-refresh baskısı). Production'da en az bu değer zorunlu;
 * test için NODE_ENV!=production ile daha kısa süre kullanılabilir (production'a sızamaz — parser
 * fail-fast). Birim: SANİYE.
 */
export const SESSION_ACTIVITY_THROTTLE_MIN_PRODUCTION_SECONDS = 30;

/**
 * S3 — `SESSION_ACTIVITY_THROTTLE_SECONDS` doğrulaması (SAF, testable). 0/negatif/tamsayı-olmayan
 * HER zaman reddedilir; production'da `< 30` reddedilir (fail-fast). Aksi halde değeri döner.
 */
export function assertActivityThrottleSeconds(seconds: number, isProduction: boolean): number {
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(
      `SESSION_ACTIVITY_THROTTLE_SECONDS geçersiz (${seconds}): pozitif tamsayı (saniye) olmalı. ` +
        `0 footgun'dur — her anlamlı request DB'ye yazar.`,
    );
  }
  if (isProduction && seconds < SESSION_ACTIVITY_THROTTLE_MIN_PRODUCTION_SECONDS) {
    throw new Error(
      `SESSION_ACTIVITY_THROTTLE_SECONDS production'da en az ${SESSION_ACTIVITY_THROTTLE_MIN_PRODUCTION_SECONDS} sn ` +
        `olmalı (verilen ${seconds}). Kısa süre yalnız test/dev (NODE_ENV!=production) içindir.`,
    );
  }
  return seconds;
}

/** ADR-271 §3 politika tablosu (varsayilan degerler). */
export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  rememberOff: {
    idleTimeoutSeconds: 30 * 60, // 30 dk
    absoluteExpirySeconds: 8 * 60 * 60, // 8 saat
  },
  rememberOn: {
    idleTimeoutSeconds: 7 * 24 * 60 * 60, // 7 gun
    absoluteExpirySeconds: 30 * 24 * 60 * 60, // 30 gun
  },
  warningLeadSeconds: 5 * 60, // 5 dk
  activityThrottleSeconds: 5 * 60, // 5 dk
};

/** Bir oturumun omur-degerlendirmesi icin gereken minimal alanlar. */
export interface SessionLifetimeFields {
  lastActivityAt: Date;
  /** ADR-271 sonrasi set edilir; NULL ise `expiresAt`'e geri duser (guvenli-additive). */
  absoluteExpiresAt: Date | null;
  /** Geri-uyumluluk: absolute deadline yoksa bu kullanilir. */
  expiresAt: Date;
  rememberMe: boolean;
  revokedAt: Date | null;
  /**
   * M1 (hardening) — legacy cutover marker. 0 = ADR-271-oncesi (grandfathered): idle-collapse
   * UYGULANMAZ, yalniz absolute tavan gecerlidir → deploy'da mevcut oturum sessizce dusmez. Ilk
   * anlamli aktivitede uygulama kodu 1'e terfi eder (taze idle o an baslar). undefined / >=1 =
   * ADR-271-native (idle+absolute). Opsiyonel: alani tasimayan literal'ler native varsayilir.
   */
  policyVersion?: number;
}

/** Gecerli (ADR-271-native) policy surumu. Yeni oturumlar bununla acilir. */
export const SESSION_POLICY_VERSION_CURRENT = 1;

/**
 * Legacy (grandfathered) oturum mu? policyVersion === 0 → idle yok sayilir, yalniz absolute tavan
 * uygulanir. undefined (alani tasimayan literal) veya >=1 → native.
 */
export function isLegacySession(s: Pick<SessionLifetimeFields, "policyVersion">): boolean {
  return s.policyVersion === 0;
}

/** rememberMe'ye gore pencere. */
export function windowFor(policy: SessionPolicy, rememberMe: boolean): SessionPolicyWindow {
  return rememberMe ? policy.rememberOn : policy.rememberOff;
}

/**
 * Login/creation'da hesaplanan omur sinirlari.
 * `expiresAt` kolonu geri-uyumluluk icin `absoluteExpiresAt`'e esitlenir.
 */
export function computeSessionExpiry(
  policy: SessionPolicy,
  rememberMe: boolean,
  now: Date,
): { idleExpiresAt: Date; absoluteExpiresAt: Date; expiresAt: Date } {
  const w = windowFor(policy, rememberMe);
  const idleExpiresAt = new Date(now.getTime() + w.idleTimeoutSeconds * 1000);
  const absoluteExpiresAt = new Date(now.getTime() + w.absoluteExpirySeconds * 1000);
  return { idleExpiresAt, absoluteExpiresAt, expiresAt: absoluteExpiresAt };
}

/** Absolute deadline'in etkin degeri (guvenli-additive fallback). */
export function effectiveAbsolute(
  s: Pick<SessionLifetimeFields, "absoluteExpiresAt" | "expiresAt">,
): Date {
  return s.absoluteExpiresAt ?? s.expiresAt;
}

/** Kayan idle deadline = lastActivityAt + idleTimeout(rememberMe). */
export function idleDeadline(
  policy: SessionPolicy,
  s: Pick<SessionLifetimeFields, "lastActivityAt" | "rememberMe">,
): Date {
  const w = windowFor(policy, s.rememberMe);
  return new Date(s.lastActivityAt.getTime() + w.idleTimeoutSeconds * 1000);
}

/**
 * Etkin oturum bitis ani = min(idleDeadline, absoluteDeadline).
 * idle asla absolute'u asamaz.
 *
 * M1 — LEGACY (policyVersion 0) oturumda idle-collapse UYGULANMAZ: deadline yalniz absolute tavandir
 * (mevcut oturum deploy'da sessizce dusmez). Ilk anlamli aktivitede oturum native'e (v1) terfi eder;
 * o andan itibaren normal idle+absolute isler.
 */
export function sessionDeadline(policy: SessionPolicy, s: SessionLifetimeFields): Date {
  const abs = effectiveAbsolute(s);
  if (isLegacySession(s)) return abs;
  const idle = idleDeadline(policy, s);
  return idle.getTime() <= abs.getTime() ? idle : abs;
}

/** ADR-271 gecerlilik: revoked degil VE now <= min(idle, absolute). */
export function isSessionValid(
  policy: SessionPolicy,
  s: SessionLifetimeFields,
  now: Date,
): boolean {
  if (s.revokedAt) return false;
  return now.getTime() <= sessionDeadline(policy, s).getTime();
}

/**
 * Istemci uyari/geri-sayim + oturum yonetimi UX'i icin oturum zamanlamasi
 * (Date'ler; route ISO'ya cevirir). idle + absolute deadline'lari ve uyari
 * lead'ini tasir.
 */
export function sessionTiming(
  policy: SessionPolicy,
  s: SessionLifetimeFields,
): {
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  warningLeadSeconds: number;
  rememberMe: boolean;
  lastActivityAt: Date;
} {
  const abs = effectiveAbsolute(s);
  return {
    // M1 — legacy oturumda client geri-sayimi absolute'u yansitir (idle uygulanmaz); boylece
    // SessionGuard eski (backfill) lastActivityAt yuzunden erken "expired" uyarisi gostermez.
    idleExpiresAt: isLegacySession(s) ? abs : idleDeadline(policy, s),
    absoluteExpiresAt: abs,
    warningLeadSeconds: policy.warningLeadSeconds,
    rememberMe: s.rememberMe,
    lastActivityAt: s.lastActivityAt,
  };
}

/**
 * idle capasini DB'ye yeniden yazmali miyiz? (throttle) — son aktiviteden
 * `activityThrottleSeconds` gecmediyse yazma (her request'te write engellenir).
 */
export function shouldBumpActivity(
  policy: SessionPolicy,
  lastActivityAt: Date,
  now: Date,
): boolean {
  return now.getTime() - lastActivityAt.getTime() >= policy.activityThrottleSeconds * 1000;
}

/**
 * Cookie max-age (saniye) turetimi:
 *   - rememberMe ACIK  → kalici cookie; absolute pencere kadar.
 *   - rememberMe KAPALI → `null` = SESSION cookie (tarayici kapaninca gider).
 * Cookie sadece TASIYICIDIR; gercek gecerlilik her zaman server-otoriter (idle+absolute).
 */
export function cookieMaxAgeSeconds(policy: SessionPolicy, rememberMe: boolean): number | null {
  return rememberMe ? policy.rememberOn.absoluteExpirySeconds : null;
}

// Kontrol karakterleri (CR/LF/NUL/DEL vb.) — header/URL enjeksiyonu denemesi.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Guvenli returnTo (open-redirect savunmasi) — uc uygulama ORTAK.
 * Yalniz same-origin RELATIVE path kabul edilir:
 *   - tek "/" ile baslamali; "//" (protocol-relative) reddedilir
 *   - "\" (backslash tricks) reddedilir
 *   - decode sonrasi scheme (":") / "://" / kontrol karakteri iceriyorsa reddedilir
 *   - `blockedPrefixes` (or. /auth, /login, /logout) redirect loop'unu engeller
 * Aksi halde `fallback` doner.
 */
export function safeReturnTo(
  raw: string | null | undefined,
  fallback: string,
  blockedPrefixes: readonly string[] = [],
): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (value === "") return fallback;
  // Tek "/" ile baslamali (mutlak relative path), "//" degil.
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // Backslash tricks: "/\evil.com", "\", "/\\"
  if (value.includes("\\")) return fallback;
  if (CONTROL_CHARS.test(value)) return fallback;
  // Decode ederek gizli scheme / kontrol karakteri denemesini yakala.
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (CONTROL_CHARS.test(decoded)) return fallback;
  if (decoded.startsWith("//") || decoded.includes("://") || decoded.includes("\\")) {
    return fallback;
  }
  // Auth/login/logout gibi dongu yaratacak yollari engelle.
  const pathOnly = value.split(/[?#]/, 1)[0] ?? value;
  for (const prefix of blockedPrefixes) {
    if (
      pathOnly === prefix ||
      pathOnly.startsWith(`${prefix}/`) ||
      pathOnly.startsWith(`${prefix}?`)
    ) {
      return fallback;
    }
  }
  return value;
}
