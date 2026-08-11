/**
 * C1 (post-audit hardening) — Private iade attachment guard (ADR-269 §8).
 *
 * `/media/**` public statik servisi, PRIVATE `returns` segmentine ulaşan HER isteği reddetmelidir.
 * Eski guard HAM url'de `"/returns/"` substring'i arıyordu → `%2F` (encoded slash) / `%252F` (double)
 * / `%5C` (backslash) / karışık-case ile BYPASS edilebiliyordu (fastifyStatic decode edip dosyayı
 * 200 ile servis ediyordu). Bu SAF sınıflandırıcı path'i TAM (iteratif) decode eder, backslash'i
 * separator olarak normalize eder ve SEGMENT bazında `returns` arar; malformed encoding / path
 * traversal / kontrol karakteri fail-closed reddedilir. Static'e ULAŞMADAN (onRequest) çalışır.
 *
 * SAF/DB'siz → unit-testlenebilir (bkz. media-private-guard.test.ts).
 */

export type MediaPathVerdict = "ok" | "private" | "malformed";

/** Kontrol karakteri (NUL/CR/LF/DEL vb., 0x00–0x1f / 0x7f) — path/header enjeksiyon denemesi. */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Path'i STABIL hâle gelene kadar (en çok 5 tur) percent-decode eder. Multi-encoding (`%252F` →
 * `%2F` → `/`) böylece tam çözülür. Malformed encoding (decodeURIComponent throw) → null.
 */
function fullyDecode(path: string): string | null {
  let current = path;
  for (let i = 0; i < 5; i++) {
    if (!current.includes("%")) return current;
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) return current;
    current = next;
  }
  // 5 turda stabilize olmadı ve hâlâ `%` var → şüpheli/hostile; fail-closed.
  return current.includes("%") ? null : current;
}

/**
 * Bir `/media/**` isteğinin verdict'i:
 *  - "ok"        → public statik servise geçebilir
 *  - "private"   → `returns`/`support`/`platform-requests` segmentine ulaşıyor → 404 (gizlilik; enumerable değil)
 *  - "malformed" → bozuk encoding / traversal / kontrol karakteri → 400
 * `/media/` ile başlamayan istekler bu guard'ın konusu değildir → "ok".
 */
const PRIVATE_SEGMENTS = new Set(["returns", "support", "platform-requests"]);

export function classifyMediaRequestPath(rawUrl: string): MediaPathVerdict {
  const rawPath = rawUrl.split(/[?#]/)[0] ?? rawUrl;
  if (!rawPath.startsWith("/media/")) return "ok";
  if (hasControlChar(rawPath)) return "malformed";

  const decoded = fullyDecode(rawPath);
  if (decoded === null) return "malformed";
  if (hasControlChar(decoded)) return "malformed";

  // Backslash'i separator gibi ele al (`%5C` / Windows-tarzı) — segment kaçışını önler.
  const norm = decoded.replace(/\\/g, "/");
  const segments = norm.split("/");
  if (segments.some((s) => s === "..")) return "malformed"; // path traversal
  // PRIVATE segmentler (public statik servisten SIZMAZ): returns (ADR-269), support (ADR-289),
  // platform-requests (TODO-178).
  if (segments.some((s) => PRIVATE_SEGMENTS.has(s.toLowerCase()))) return "private";
  return "ok";
}
