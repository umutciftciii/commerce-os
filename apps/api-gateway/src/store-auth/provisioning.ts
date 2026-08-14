/**
 * Store-admin OWNER provisioning/backfill (Faz D) — SAF planlayıcı + manifest ayrıştırıcı.
 *
 * İLKELER (spec §2-3):
 *  - HEURISTIC YOK: yalnız explicit manifest (storeSlug|storeId → ownerEmail). "ilk mağaza",
 *    demo inference, first-user fallback YOK. Mapping olmayan ELIGIBLE (ACTIVE) mağaza varsa
 *    apply FAIL-CLOSED (applicable=false).
 *  - Yalnız ACTIVE mağaza provision edilir; SUSPENDED/CLOSED/DRAFT → SKIP (policy).
 *  - StoreUser oluşturulur/converge edilir; role = OWNER. Rastgele owner / default password /
 *    plaintext / credential log ASLA üretilmez.
 *  - passwordHash yalnız GERÇEK email eşleşen PlatformUser'dan REUSE edilebilir; o zaman
 *    linkedPlatformUserId set edilir. Reuse yoksa INVITED (non-login-ready) — ACTIVE+credentialless
 *    OWNER ASLA bırakılmaz.
 *  - Bu modül SAFtır: prisma/secret değeri GÖRMEZ. passwordHash DEĞERİ planlayıcıya girmez
 *    (yalnız "reuse edilebilir mi" boolean'ı) → rapor/log'a hash sızmaz. Yazma işini executor yapar.
 */

export type StoreStatusValue = "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED";
export type StoreUserStatusValue = "INVITED" | "ACTIVE" | "DISABLED";
export type StoreUserRoleValue = "OWNER" | "ADMIN" | "MANAGER" | "STAFF" | "VIEWER";

export interface OwnerManifestEntry {
  /** storeSlug VEYA storeId'den TAM biri verilir. */
  storeSlug?: string;
  storeId?: string;
  ownerEmail: string;
}

export interface ProvisioningStore {
  id: string;
  slug: string;
  status: StoreStatusValue;
}

export interface ProvisioningStoreUser {
  id: string;
  storeId: string;
  email: string; // normalize (lowercase) — null-email kullanıcılar buraya alınmaz
  role: StoreUserRoleValue;
  status: StoreUserStatusValue;
  hasPasswordHash: boolean;
  linkedPlatformUserId: string | null;
}

/** Email-eşleşen PlatformUser referansı — passwordHash DEĞERİ YOK, yalnız varlığı. */
export interface ProvisioningPlatformUser {
  id: string;
  email: string; // normalize (lowercase)
  name: string | null;
  hasPasswordHash: boolean;
}

export interface ProvisioningInput {
  manifest: OwnerManifestEntry[];
  stores: ProvisioningStore[];
  /** Manifest'te adı geçen mağazalardaki (storeId,email) eşleşen mevcut StoreUser'lar. */
  existingStoreUsers: ProvisioningStoreUser[];
  /** Manifest owner email'leriyle eşleşen PlatformUser'lar (normalize email ile). */
  platformUsers: ProvisioningPlatformUser[];
}

export type ProvisioningOutcome =
  | "CREATE_LOGIN_READY"
  | "CREATE_INVITED"
  | "CONVERGE_LOGIN_READY"
  | "CONVERGE_INVITED"
  | "NOOP_LOGIN_READY"
  | "SKIP_STORE_NOT_ACTIVE";

export type CredentialResolution =
  | "EXISTING_STORE_HASH"
  | "PLATFORM_HASH_REUSE"
  | "NONE_INVITED"
  | "NONE";

export interface ProvisioningDecision {
  ref: string; // insan-okunur (storeSlug|storeId → ownerEmail)
  storeId?: string;
  storeSlug?: string;
  ownerEmail: string;
  outcome: ProvisioningOutcome;
  credential: CredentialResolution;
  /** Yalnız gerçek email eşleşmesinde set edilir. */
  linkedPlatformUserId: string | null;
  loginReady: boolean;
  /** Executor için: bu StoreUser zaten var mı (converge) yoksa create mi. */
  existingStoreUserId?: string;
  /** Executor için hedef durum. */
  targetRole: StoreUserRoleValue;
  targetStatus: StoreUserStatusValue;
}

export interface ProvisioningConflict {
  ref: string;
  reason:
    | "UNKNOWN_STORE"
    | "DUPLICATE_MAPPING"
    | "BOTH_STORE_KEYS"
    | "MISSING_STORE_KEY"
    | "INVALID_EMAIL"
    | "EXISTING_DISABLED"
    | "ACTIVE_WITHOUT_CREDENTIAL";
  detail: string;
}

export interface ProvisioningReport {
  activeStoreCount: number;
  mappedStoreCount: number;
  unmappedActiveStores: { storeId: string; slug: string }[];
  decisions: ProvisioningDecision[];
  conflicts: ProvisioningConflict[];
  /** APPLY yalnız bu true iken güvenlidir: conflict YOK ve unmapped ACTIVE mağaza YOK. */
  applicable: boolean;
  summary: {
    loginReadyOwners: number;
    invited: number;
    skippedNotActive: number;
    conflicts: number;
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Basit email şekil kontrolü (RFC değil; provisioning girdi doğrulaması için yeterli). */
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Manifest ayrıştırma + doğrulama. SECRET İÇEREMEZ: `password`/`passwordHash`/`token` gibi
 * alanlar bulunursa reddedilir. Her giriş: storeSlug XOR storeId + ownerEmail.
 */
export function parseOwnerManifest(raw: unknown): OwnerManifestEntry[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Manifest bir nesne olmalı: { stores: [...] }");
  }
  const storesRaw = (raw as Record<string, unknown>).stores;
  if (!Array.isArray(storesRaw)) {
    throw new Error("Manifest.stores bir dizi olmalı.");
  }
  const forbidden = ["password", "passwordhash", "token", "secret"];
  return storesRaw.map((entry, i) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`stores[${i}] bir nesne olmalı.`);
    }
    const rec = entry as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      if (forbidden.includes(key.toLowerCase())) {
        throw new Error(`stores[${i}]: yasak alan '${key}' — manifest SECRET/parola içeremez.`);
      }
    }
    const storeSlug = typeof rec.storeSlug === "string" ? rec.storeSlug.trim() : undefined;
    const storeId = typeof rec.storeId === "string" ? rec.storeId.trim() : undefined;
    const ownerEmail = typeof rec.ownerEmail === "string" ? rec.ownerEmail.trim() : undefined;
    if (!ownerEmail) throw new Error(`stores[${i}]: ownerEmail zorunlu.`);
    if (!!storeSlug === !!storeId) {
      throw new Error(`stores[${i}]: storeSlug VEYA storeId'den TAM biri verilmeli.`);
    }
    return { storeSlug: storeSlug || undefined, storeId: storeId || undefined, ownerEmail };
  });
}

function entryRef(e: OwnerManifestEntry): string {
  const key = e.storeSlug ? `slug:${e.storeSlug}` : `id:${e.storeId}`;
  return `${key} → ${e.ownerEmail}`;
}

/**
 * SAF planlama. Deterministik — Date/random YOK. Idempotent tasarım: aynı girdi → aynı plan;
 * mevcut OWNER (login-ready) → NOOP_LOGIN_READY.
 */
export function planStoreOwnerProvisioning(input: ProvisioningInput): ProvisioningReport {
  const storeById = new Map(input.stores.map((s) => [s.id, s]));
  const storeBySlug = new Map(input.stores.map((s) => [s.slug, s]));
  const activeStores = input.stores.filter((s) => s.status === "ACTIVE");

  const existingByKey = new Map(
    input.existingStoreUsers.map((u) => [`${u.storeId}::${u.email}`, u]),
  );
  const platformByEmail = new Map(input.platformUsers.map((p) => [normalizeEmail(p.email), p]));

  const decisions: ProvisioningDecision[] = [];
  const conflicts: ProvisioningConflict[] = [];
  const mappedStoreIds = new Set<string>();
  const seenStoreRefs = new Set<string>();

  for (const entry of input.manifest) {
    const ref = entryRef(entry);
    const ownerEmail = normalizeEmail(entry.ownerEmail);

    if (!!entry.storeSlug === !!entry.storeId) {
      conflicts.push({
        ref,
        reason: entry.storeSlug || entry.storeId ? "BOTH_STORE_KEYS" : "MISSING_STORE_KEY",
        detail: "storeSlug VEYA storeId'den tam biri gerekli.",
      });
      continue;
    }
    if (!looksLikeEmail(ownerEmail)) {
      conflicts.push({ ref, reason: "INVALID_EMAIL", detail: "ownerEmail geçersiz." });
      continue;
    }

    const store = entry.storeId ? storeById.get(entry.storeId) : storeBySlug.get(entry.storeSlug!);
    if (!store) {
      conflicts.push({ ref, reason: "UNKNOWN_STORE", detail: "Manifest'teki mağaza bulunamadı." });
      continue;
    }

    // Aynı mağaza birden çok kez → conflict (aynı ya da farklı email fark etmez).
    const storeRefKey = store.id;
    if (seenStoreRefs.has(storeRefKey)) {
      conflicts.push({ ref, reason: "DUPLICATE_MAPPING", detail: `Mağaza ${store.slug} birden çok kez eşlendi.` });
      continue;
    }
    seenStoreRefs.add(storeRefKey);

    if (store.status !== "ACTIVE") {
      decisions.push({
        ref,
        storeId: store.id,
        storeSlug: store.slug,
        ownerEmail,
        outcome: "SKIP_STORE_NOT_ACTIVE",
        credential: "NONE",
        linkedPlatformUserId: null,
        loginReady: false,
        targetRole: "OWNER",
        targetStatus: "INVITED",
      });
      continue;
    }

    mappedStoreIds.add(store.id);
    const platform = platformByEmail.get(ownerEmail); // yalnız GERÇEK email eşleşmesi
    const platformReusable = !!platform && platform.hasPasswordHash;
    const existing = existingByKey.get(`${store.id}::${ownerEmail}`);

    if (existing) {
      // --- CONVERGE ---
      if (existing.status === "DISABLED") {
        conflicts.push({
          ref,
          reason: "EXISTING_DISABLED",
          detail: "Mevcut StoreUser DISABLED — otomatik yeniden etkinleştirilmez (manuel müdahale).",
        });
        continue;
      }
      const hasCredential = existing.hasPasswordHash || platformReusable;
      if (existing.status === "ACTIVE" && !hasCredential) {
        // ACTIVE ama credential yok ve reuse edilemiyor → login-ready sayılamaz; işaretle.
        conflicts.push({
          ref,
          reason: "ACTIVE_WITHOUT_CREDENTIAL",
          detail: "Mevcut ACTIVE StoreUser'ın passwordHash'i yok ve reuse edilemiyor.",
        });
        continue;
      }
      const credential: CredentialResolution = existing.hasPasswordHash
        ? "EXISTING_STORE_HASH"
        : platformReusable
          ? "PLATFORM_HASH_REUSE"
          : "NONE_INVITED";
      const loginReady = hasCredential;
      const targetStatus: StoreUserStatusValue = loginReady ? "ACTIVE" : "INVITED";
      const willLink =
        existing.linkedPlatformUserId ??
        (credential === "PLATFORM_HASH_REUSE" ? platform!.id : null);
      const noop =
        loginReady && // yalnız login-ready iken NOOP olabilir; değilse INVITED converge olarak raporlanır
        existing.role === "OWNER" &&
        existing.status === targetStatus &&
        existing.linkedPlatformUserId === willLink &&
        credential !== "PLATFORM_HASH_REUSE"; // reuse her zaman yazma gerektirir
      decisions.push({
        ref,
        storeId: store.id,
        storeSlug: store.slug,
        ownerEmail,
        outcome: noop ? "NOOP_LOGIN_READY" : loginReady ? "CONVERGE_LOGIN_READY" : "CONVERGE_INVITED",
        credential,
        linkedPlatformUserId: willLink,
        loginReady,
        existingStoreUserId: existing.id,
        targetRole: "OWNER",
        targetStatus,
      });
      continue;
    }

    // --- CREATE ---
    const loginReady = platformReusable;
    decisions.push({
      ref,
      storeId: store.id,
      storeSlug: store.slug,
      ownerEmail,
      outcome: loginReady ? "CREATE_LOGIN_READY" : "CREATE_INVITED",
      credential: loginReady ? "PLATFORM_HASH_REUSE" : "NONE_INVITED",
      linkedPlatformUserId: loginReady ? platform!.id : null,
      loginReady,
      targetRole: "OWNER",
      targetStatus: loginReady ? "ACTIVE" : "INVITED",
    });
  }

  const unmappedActiveStores = activeStores
    .filter((s) => !mappedStoreIds.has(s.id))
    .map((s) => ({ storeId: s.id, slug: s.slug }));

  const summary = {
    loginReadyOwners: decisions.filter((d) => d.loginReady).length,
    invited: decisions.filter(
      (d) => d.outcome === "CREATE_INVITED" || d.outcome === "CONVERGE_INVITED",
    ).length,
    skippedNotActive: decisions.filter((d) => d.outcome === "SKIP_STORE_NOT_ACTIVE").length,
    conflicts: conflicts.length,
  };

  // FAIL-CLOSED: conflict VEYA unmapped ACTIVE mağaza varsa apply güvenli değil.
  const applicable = conflicts.length === 0 && unmappedActiveStores.length === 0;

  return {
    activeStoreCount: activeStores.length,
    mappedStoreCount: mappedStoreIds.size,
    unmappedActiveStores,
    decisions,
    conflicts,
    applicable,
    summary,
  };
}
