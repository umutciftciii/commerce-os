/**
 * TODO-174B (ADR-281) — Vitrin "Alışveriş Bakiyem". Kullanılabilir bakiye + hareket geçmişi.
 * description SEMANTİK KEY → TR/EN insan-okur copy (raw enum GÖSTERİLMEZ). Sunucu-otoriter veri.
 */
import type { Locale } from "@commerce-os/i18n";
import { formatMinor } from "../../../lib/money";
import type { BalanceData } from "../../../lib/server/balance";

const DESC: Record<string, [string, string]> = {
  "credit.goodwill": ["Müşteri memnuniyeti kapsamında bakiye eklendi", "Goodwill balance added"],
  "credit.orderPayment": ["{n} siparişinde alışveriş bakiyesi kullanıldı", "Shopping balance used on order {n}"],
  "credit.cancellationRestore": ["{n} iptali nedeniyle bakiye geri yüklendi", "Balance restored on cancellation of {n}"],
  "credit.refundRestore": ["{n} iadesi nedeniyle bakiye geri yüklendi", "Balance restored on refund of {n}"],
  // TODO-175 (ADR-285) — refund hedefi = alışveriş bakiyesi olduğunda backend'in yaydığı semantik key'ler.
  "credit.cancellationRefund": ["OS-{n} sipariş iptali iadesi", "OS-{n} order cancellation refund"],
  "credit.returnRefund": ["OS-{n} ürün iadesi", "OS-{n} product return refund"],
  "credit.returnCreditRestore": [
    "Siparişte kullanılan alışveriş bakiyesi geri yüklendi",
    "Store credit used on the order was restored",
  ],
  "credit.returnCreditReissued": [
    "Siparişte kullanılan alışveriş bakiyesi geri yüklendi",
    "Store credit used on the order was restored",
  ],
  "credit.expired": ["Süresi doldu", "Expired"],
  "credit.adjustment": ["Bakiye düzeltmesi", "Balance adjustment"],
};

function descLabel(key: string, orderNumber: string | null, tr: boolean): string {
  const base = DESC[key];
  const text = base ? (tr ? base[0] : base[1]) : key;
  return text.replace("{n}", orderNumber ?? "");
}

// TR mağaza tutarları tr-TR biçiminde ("₺1.000,00") gösterilir. `toLocaleString(undefined, …)`
// runtime locale'ini yok sayıp en-US ("₺1,000.00") üretiyordu; locale-otoriter `formatMinor`e delege ediyoruz.
function fmt(minor: string, currency: string): string {
  return formatMinor(Number(minor), currency);
}

export function BalanceSection({ data, locale }: { data: BalanceData; locale: Locale }) {
  const tr = locale === "tr";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{tr ? "Alışveriş Bakiyem" : "My Shopping Balance"}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {tr
            ? "Mağaza tarafından tanımlanan alışveriş bakiyenizi ve hareketlerinizi burada görebilirsiniz."
            : "View your store-granted shopping balance and its movements here."}
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
        <div className="text-sm text-neutral-500">{tr ? "Kullanılabilir Bakiyeniz" : "Available Balance"}</div>
        <div className="mt-1 text-3xl font-semibold">{fmt(data.availableMinor, data.currency)}</div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">{tr ? "Hareketler" : "Movements"}</h2>
        {data.entries.length === 0 ? (
          <p className="text-sm text-neutral-500">{tr ? "Henüz bir hareket bulunmuyor." : "No movements yet."}</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <div className="text-sm text-neutral-800">{descLabel(e.description, e.orderNumber, tr)}</div>
                  <div className="text-xs text-neutral-400">{new Date(e.createdAt).toLocaleDateString(tr ? "tr-TR" : "en-US")}</div>
                </div>
                <div className="text-right">
                  <div className={e.direction === "CREDIT" ? "text-emerald-600 font-medium" : "text-neutral-700 font-medium"}>
                    {e.direction === "CREDIT" ? "+" : "−"}
                    {fmt(e.amountMinor, e.currency)}
                  </div>
                  <div className="text-xs text-neutral-400">{fmt(e.balanceAfterMinor, e.currency)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
