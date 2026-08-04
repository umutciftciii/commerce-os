/**
 * TODO-170-recovery — Bekleyen İş sayaçlarını mutation sonrası ANINDA tazelemek için hafif,
 * decoupled bir tarayıcı-olayı köprüsü. Sidebar (StoreNav) ve Dashboard bu olayı dinler;
 * ilgili mutasyonlar (review moderate, return transition/approve/reject/inspect) başarıyla
 * tamamlanınca `notifyPendingWorkChanged()` tetiklenir. Poll YOK; ekranlar arası bağ YOK.
 */
export const PENDING_WORK_EVENT = "commerce:pending-work-changed";

export function notifyPendingWorkChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PENDING_WORK_EVENT));
  }
}

export function onPendingWorkChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PENDING_WORK_EVENT, listener);
  return () => window.removeEventListener(PENDING_WORK_EVENT, listener);
}
