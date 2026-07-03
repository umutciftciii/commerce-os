import { Badge } from "@commerce-os/ui";
import type { CustomerOrderShipment } from "@commerce-os/api-client";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import {
  SHIPMENT_STATUS_TONE,
  SHIPMENT_STEP_COUNT,
  isAwaitingPickupShipmentStatus,
  isCancelledShipmentStatus,
  isProblemShipmentStatus,
  providerInitials,
  shipmentStepIndex,
} from "../../lib/shipment";

/**
 * TODO-117 — Müşteri-facing kargo takip kartı (sipariş detayı). F3C.5 shipment
 * domaininden allowlist DTO ile beslenir; provider yalnız ad + (varsa) logo
 * olarak görünür, secret/iç alan yoktur. Stepper + "işlem noktası" timeline
 * ADR-045 kurallarına uyar: "Kargoya verildi" otomatik gösterilmez; konum kesin
 * varış değil → "işlem noktası". Salt-okunur server component.
 */

type TrackingDict = StorefrontDictionary["account"]["orders"]["detail"]["tracking"];

export function ShipmentTracking({
  shipment,
  t,
}: {
  shipment: CustomerOrderShipment;
  t: TrackingDict;
}) {
  const tone = SHIPMENT_STATUS_TONE[shipment.status];
  const stepIndex = shipmentStepIndex(shipment.status);
  const cancelled = isCancelledShipmentStatus(shipment.status);
  const problem = isProblemShipmentStatus(shipment.status);
  // TODO-127 — gönderi oluşturuldu ama henüz kargo firmasınca alınmadı → bekleme bilgisi.
  const awaitingPickup = isAwaitingPickupShipmentStatus(shipment.status);

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">{t.title}</h2>
        <Badge tone={tone} dot>
          {t.statusValues[shipment.status]}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        {shipment.logoUrl ? (
          <img
            src={shipment.logoUrl}
            alt={shipment.logoAlt ?? shipment.providerName}
            className="h-8 w-8 shrink-0 rounded-md object-contain ring-1 ring-slate-200"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-brand-200"
          >
            {providerInitials(shipment.providerName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{shipment.providerName}</p>
          <p className="text-xs text-slate-400">{t.provider}</p>
        </div>
      </div>

      {/* Takip numarası + link */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        {shipment.trackingNumber ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">{t.trackingNumber}</span>
            <span className="font-medium text-slate-900">{shipment.trackingNumber}</span>
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t.noTracking}</p>
        )}
        {shipment.trackingUrl ? (
          <a
            href={shipment.trackingUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
          >
            {t.trackNow} →
          </a>
        ) : null}
      </div>

      {/* Stepper (iptal/başarısız değilse) */}
      {!cancelled && stepIndex >= 0 ? (
        <ol className="mt-4 flex items-center gap-1.5" aria-label={t.title}>
          {t.steps.slice(0, SHIPMENT_STEP_COUNT).map((label, index) => {
            const reached = index <= stepIndex;
            return (
              <li key={label} className="flex flex-1 flex-col items-center gap-1">
                <span
                  aria-hidden
                  className={`h-1.5 w-full rounded-full ${
                    reached ? (problem ? "bg-amber-400" : "bg-brand-500") : "bg-slate-200"
                  }`}
                />
                <span
                  className={`text-center text-[11px] leading-tight ${
                    reached ? "font-medium text-slate-700" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {cancelled ? <p className="mt-3 text-xs text-slate-500">{t.cancelledNote}</p> : null}
      {problem ? <p className="mt-3 text-xs text-amber-700">{t.problemNote}</p> : null}
      {awaitingPickup && !cancelled && !problem ? (
        <p className="mt-3 text-xs text-slate-500">{t.preparedNote}</p>
      ) : null}

      {/* İşlem noktası timeline */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <h3 className="mb-2 text-xs font-semibold text-slate-700">{t.timelineTitle}</h3>
        {shipment.events.length === 0 ? (
          <p className="text-sm text-slate-400">{t.noEvents}</p>
        ) : (
          <ul className="space-y-2.5">
            {shipment.events.map((event, index) => (
              <li key={`${event.eventType}-${index}`} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700">
                    {event.statusText ?? t.eventValues[event.eventType]}
                  </p>
                  {event.location ? (
                    <p className="text-xs text-slate-400">
                      {t.locationLabel}: {event.location}
                    </p>
                  ) : null}
                  {event.occurredAt ? (
                    <p className="text-xs text-slate-400">
                      {new Date(event.occurredAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
