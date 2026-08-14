/**
 * Store-auth (Faz B) — ADR-271 oturum doğrulama validator'ı.
 *
 * `authenticatePlatform`'un (server.ts) gövdesini birebir yansıtır; Fastify/route/audit
 * bağımlılığı YOK — saf, enjekte-edilmiş bağımlılıklarla test edilebilir. İki-kapılı
 * geçerlilik: revoked değil VE now <= min(idle, absolute). Başarısızlık nedeni (revoked mü,
 * idle-expired mi, absolute-expired mi, DISABLED mı) çağırana SIZDIRILMAZ — tek `null`.
 */
import type { SessionPolicy } from "@commerce-os/config";
import { effectiveAbsolute, isLegacySession, isSessionValid, shouldBumpActivity } from "@commerce-os/config";
import type { StoreAuthData } from "./data.js";
import type { StoreSessionAuthRecord, StoreSessionPrincipal } from "./types.js";

export interface AuthenticateStoreDeps {
  data: Pick<StoreAuthData, "findStoreSessionByTokenHash" | "touchStoreSessionActivity">;
  policy: SessionPolicy;
  hashToken: (token: string) => string; // enjekte: (t) => hashSessionToken(t, SESSION_SECRET)
  onTouchError?: (e: unknown) => void; // fire-and-forget logger
}

/**
 * Bearer token'ı bir mağaza principal'ına çözer, ya da geçersiz/iptal/süresi-dolmuş/
 * devre-dışı ise null döner. Başarısızlık nedenini çağırana ASLA ayırt etmez (enumeration
 * sızıntısı yok).
 */
export async function authenticateStoreToken(
  deps: AuthenticateStoreDeps,
  token: string | null,
  now: Date,
  opts: { countAsActivity?: boolean } = {},
): Promise<{ session: StoreSessionAuthRecord; principal: StoreSessionPrincipal } | null> {
  if (!token) return null;
  const countAsActivity = opts.countAsActivity ?? true;
  const session = await deps.data.findStoreSessionByTokenHash(deps.hashToken(token));
  if (!session) return null;
  if (!isSessionValid(deps.policy, session, now)) return null;
  // Store status policy (Faz D): yalnız ACTIVE mağaza eligible. Mağaza sonradan SUSPENDED/
  // CLOSED (veya ACTIVE dışı) olduysa mevcut oturum artık geçerli sayılmaz → fail-closed.
  if (session.store.status !== "ACTIVE") return null;
  // DISABLED mağaza kullanıcısı mevcut bir oturumu kullanamaz (doğrulamada reddedilir).
  if (session.storeUser.status !== "ACTIVE") return null;
  // KİMLİK-BÜTÜNLÜĞÜ (Faz D): native/unlinked null-email StoreUser oturumu GEÇERSİZ. Böylece
  // principal/session-DTO asla `email:""` sentineli üretmez ve session endpoint 500 vermez.
  // (Bir fixture ile oturum oluşmuş olsa bile burada fail-closed 401.)
  const storeUserEmail = session.storeUser.email;
  if (!storeUserEmail) return null;

  if (countAsActivity && now.getTime() <= effectiveAbsolute(session).getTime()) {
    const warn = deps.onTouchError ?? (() => {});
    if (isLegacySession(session)) {
      void deps.data.touchStoreSessionActivity(session.id, now, true).catch(warn);
      session.lastActivityAt = now;
      session.policyVersion = 1;
    } else if (shouldBumpActivity(deps.policy, session.lastActivityAt, now)) {
      void deps.data.touchStoreSessionActivity(session.id, now).catch(warn);
      session.lastActivityAt = now;
    }
  }

  return {
    session,
    principal: {
      storeUserId: session.storeUser.id,
      storeId: session.storeId,
      role: session.storeUser.role,
      name: session.storeUser.name,
      email: storeUserEmail, // yukarıda non-null garantilendi (aksi halde null döndük)
    },
  };
}
