/**
 * TODO-132 — Sağlayıcı gönderi operasyonları için alıcı e-posta çözümleme.
 *
 * MNG/DHL createRecipient boş/geçersiz e-postayı reddeder (sandbox kanıtı: 400 kod
 * 26039 "'Recipient. Email' geçerli bir e-posta adresi değil"). Ürün kararı: sağlayıcıya
 * DAİMA geçerli bir alıcı e-postası gönderilir; yoksa sağlayıcı ÇAĞRILMADAN lokal ve
 * güvenli hata dönülür (RECIPIENT_EMAIL_REQUIRED / RECIPIENT_EMAIL_INVALID).
 *
 * Öncelik: sipariş seviyesindeki e-posta (Order.customerEmail) → bağlı müşteri kaydı
 * (Customer.email). Adaylar trim'lenir; ilk GEÇERLİ aday kullanılır. Hata mesajları/
 * kodları PII (e-posta değeri) İÇERMEZ.
 */

/** Basit, güvenli e-posta biçim kontrolü (local@domain.tld; boşluk yok, 254 sınırı). */
const RECIPIENT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidRecipientEmail(value: string): boolean {
  const email = value.trim();
  return email.length > 0 && email.length <= 254 && RECIPIENT_EMAIL_PATTERN.test(email);
}

export type RecipientEmailResolution =
  | { ok: true; email: string }
  | { ok: false; code: "RECIPIENT_EMAIL_REQUIRED" | "RECIPIENT_EMAIL_INVALID" };

/**
 * Aday listesinden (öncelik sırasıyla) ilk geçerli e-postayı seçer.
 *  - Tüm adaylar boş/eksik → RECIPIENT_EMAIL_REQUIRED.
 *  - En az bir aday dolu ama hiçbiri geçerli değil → RECIPIENT_EMAIL_INVALID.
 * Dönen e-posta trim'lenmiştir; hata durumunda aday değerler sonuca TAŞINMAZ (PII yok).
 */
export function resolveRecipientEmail(
  candidates: ReadonlyArray<string | null | undefined>,
): RecipientEmailResolution {
  let sawNonEmpty = false;
  for (const candidate of candidates) {
    const email = (candidate ?? "").trim();
    if (email.length === 0) continue;
    sawNonEmpty = true;
    if (isValidRecipientEmail(email)) return { ok: true, email };
  }
  return { ok: false, code: sawNonEmpty ? "RECIPIENT_EMAIL_INVALID" : "RECIPIENT_EMAIL_REQUIRED" };
}
