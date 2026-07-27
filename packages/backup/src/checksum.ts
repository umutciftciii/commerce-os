/**
 * PB-2/PB-3 — Backup bütünlüğü: dosya SHA-256 (streaming).
 *
 * Checksum, offsite'a yüklenen ŞİFRELİ artefakt üzerinden hesaplanır → remote HEAD/GET ile
 * karşılaştırılabilir ve restore öncesi indirilen dosyanın bozulmadığı kanıtlanır (spec §12).
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/** Bir dosyanın SHA-256 hex özetini streaming hesaplar (büyük dosya bellek-güvenli). */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** İki checksum'ı sabit-zamanlı olmayan basit eşitlikle karşılaştırır (secret değil; gizlilik gerekmez). */
export function checksumsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** `.sha256` yan dosya içeriği: `<hex>  <filename>` (sha256sum uyumlu). */
export function formatChecksumFile(hex: string, filename: string): string {
  return `${hex}  ${filename}\n`;
}

/** `.sha256` yan dosya içeriğinden hex özeti çözer (ilk alan). Boş/geçersizse null. */
export function parseChecksumFile(content: string): string | null {
  const first = content.trim().split(/\s+/)[0];
  if (first && /^[0-9a-f]{64}$/i.test(first)) return first.toLowerCase();
  return null;
}
