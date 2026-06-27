/**
 * Vitrin -> API gateway public-read/public-write erisim katmani (sunucu-yalniz).
 *
 * Vitrin, katalog/sepet/checkout verisini gateway'in AUTH GEREKTIRMEYEN public
 * uclarindan okur ve yazar (TD-032 / F3B.1). Hicbir platform-admin kimligi,
 * login ya da Bearer token KULLANILMAZ; bu modulun degerleri NEXT_PUBLIC_
 * degildir, dolayisiyla client bundle'a girmez.
 */

/** Gateway taban URL'i (yalnizca sunucu env'i). */
export function gatewayBaseUrl(): string {
  return (process.env.API_GATEWAY_URL ?? "http://localhost:4000").replace(/\/+$/, "");
}

export type FetchOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string | null };

/** Hata zarfindan (varsa) guvenli error.code'u cikarir; secret/PII tasimaz. */
async function errorCodeOf(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "code" in body.error &&
      typeof (body.error as { code: unknown }).code === "string"
    ) {
      return (body.error as { code: string }).code;
    }
  } catch {
    // Govde JSON degilse status tabanli devam.
  }
  return null;
}

/** Public GET. Hicbir auth header gondermez; her istekte taze (no-store). */
export async function getPublic<T>(path: string): Promise<FetchOutcome<T>> {
  const response = await fetch(`${gatewayBaseUrl()}${path}`, { cache: "no-store" });
  if (!response.ok) {
    return { ok: false, status: response.status, code: await errorCodeOf(response) };
  }
  return { ok: true, data: (await response.json()) as T };
}

/** Public POST (JSON govde). Auth header yok; her istekte taze (no-store). */
export async function postPublic<T>(path: string, body: unknown): Promise<FetchOutcome<T>> {
  const response = await fetch(`${gatewayBaseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    return { ok: false, status: response.status, code: await errorCodeOf(response) };
  }
  return { ok: true, data: (await response.json()) as T };
}
