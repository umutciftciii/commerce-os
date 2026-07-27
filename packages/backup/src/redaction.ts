/**
 * PB-2/PB-3 — Secret redaction.
 *
 * Backup/restore araçları DB URL, object-storage secret'ı ve encryption anahtarı ile çalışır.
 * Bu değerler log'a, manifest'e, hata mesajına ya da process arg listesine ASLA sızmamalı
 * (bkz. spec §13 Güvenlik). Bu modül serbest metinden bilinen secret'ları ve connection-string
 * kalıplarını temizler. `packages/config` `ConfigValidationError`'ın "env değeri asla loglanmaz"
 * disiplininin backup-tarafı karşılığıdır.
 */

export const REDACTED = "«redacted»";

/** Regex özel karakterlerini kaçır (secret'ı literal olarak eşlemek için). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Postgres/redis benzeri `scheme://user:password@host` connection string'lerindeki KİMLİK
 * BİLGİSİNİ maskeler (host/port/db görünür kalır — teşhis için yararlı, secret değil).
 */
export function redactConnectionStrings(text: string): string {
  return text.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)([^:/@\s]+)(?::([^@\s]+))?@/gi,
    (_match, scheme: string) => `${scheme}${REDACTED}@`,
  );
}

/**
 * Verilen secret'ları (DB URL, storage secret/access key, encryption key …) ve connection-string
 * kimlik bilgilerini metinden temizler. Boş/undefined secret'lar yok sayılır. Çok kısa (< 6) secret'lar
 * gürültü/yanlış-pozitif üretmemek için literal eşlemeye alınmaz (yalnız connection-string maskesi geçer).
 */
export function redactSecrets(text: string, secrets: Array<string | null | undefined>): string {
  let out = redactConnectionStrings(text);
  const seen = new Set<string>();
  for (const secret of secrets) {
    if (!secret) continue;
    const trimmed = secret.trim();
    if (trimmed.length < 6 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out = out.replace(new RegExp(escapeRegExp(trimmed), "g"), REDACTED);
  }
  return out;
}

/**
 * Bir Error'ı güvenli, loglanabilir bir özete indirger (name + redakte mesaj). Stack İÇERMEZ
 * (stack argüman/secret sızdırabilir). `secrets` verilen değerleri mesajdan temizler.
 */
export function redactError(error: unknown, secrets: Array<string | null | undefined> = []): {
  name: string;
  message: string;
} {
  if (error instanceof Error) {
    return { name: error.name, message: redactSecrets(error.message, secrets) };
  }
  return { name: "Error", message: redactSecrets(String(error), secrets) };
}
