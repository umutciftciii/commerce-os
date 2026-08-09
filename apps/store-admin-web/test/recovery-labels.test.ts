/**
 * TODO-174B.2 — Recovery i18n label modülü testleri. Ham enum UI'a ASLA sızmamalı.
 */
import { describe, expect, it } from "vitest";
import {
  recoveryStatusLabel,
  recoveryStatusTone,
  priorityLabel,
  activityTypeLabel,
  outcomeLabel,
  resolutionLabel,
  cancelReasonLabel,
  orderStatusLabel,
  paymentStatusLabel,
  slaState,
} from "../lib/client/recovery-labels";

describe("recovery-labels", () => {
  it("status label tr/en", () => {
    expect(recoveryStatusLabel("CONTACT_ATTEMPTED", true)).toBe("İletişim denendi");
    expect(recoveryStatusLabel("CONTACT_ATTEMPTED", false)).toBe("Contact attempted");
    expect(recoveryStatusLabel("NO_ACTION_REQUIRED", true)).toBe("Aksiyon gerekmez");
  });

  it("her status için bir tone var (bilinmeyen → neutral)", () => {
    expect(recoveryStatusTone("RESOLVED")).toBe("success");
    expect(recoveryStatusTone("UNREACHABLE")).toBe("danger");
    expect(recoveryStatusTone("ZZZ")).toBe("neutral");
  });

  it("priority label", () => {
    expect(priorityLabel("HIGH", true)).toBe("Yüksek");
    expect(priorityLabel("LOW", false)).toBe("Low");
  });

  it("activity type label (ham enum sızmaz)", () => {
    expect(activityTypeLabel("GOODWILL_CREDIT", true)).toBe("Alışveriş bakiyesi tanımlandı");
    expect(activityTypeLabel("CONTACT_CALL", true)).toBe("Telefonla arandı");
    expect(activityTypeLabel("ASSIGNED", false)).toBe("Assigned");
  });

  it("outcome label", () => {
    expect(outcomeLabel("CUSTOMER_UNREACHABLE", true)).toBe("Müşteriye ulaşılamadı");
    expect(outcomeLabel("PRODUCT_EXPECTATION_MISMATCH", false)).toBe("Product expectation mismatch");
  });

  it("resolution label", () => {
    expect(resolutionLabel("GOODWILL_CREDIT", true)).toBe("Alışveriş bakiyesi");
    expect(resolutionLabel("REFUND_FOLLOWUP", false)).toBe("Refund follow-up");
  });

  it("cancel reason label (bilinen kodlar human-readable)", () => {
    // null → em dash
    expect(cancelReasonLabel(null, true)).toBe("—");
    // gerçek OrderCancellationReason değeri human-readable
    expect(cancelReasonLabel("DELIVERY_ESTIMATE_TOO_LONG", true)).toBe("Teslimat süresi uzun");
    // bilinmeyen kod bile ham SNAKE_CASE gösterilmez (defansif humanize)
    expect(cancelReasonLabel("SOME_FUTURE_CODE", true)).not.toBe("SOME_FUTURE_CODE");
  });

  it("order/payment status label (ham enum sızmaz)", () => {
    expect(orderStatusLabel("CANCELLED", true)).toBe("İptal edildi");
    expect(paymentStatusLabel("PARTIALLY_REFUNDED", true)).toBe("Kısmen iade edildi");
    expect(paymentStatusLabel("PAID", false)).toBe("Paid");
  });

  describe("slaState", () => {
    const H = 3600_000;
    it("terminal status → DONE", () => {
      const s = slaState({ status: "RESOLVED", dueAt: new Date(Date.now() - 5 * H).toISOString(), overdue: false }, Date.now());
      expect(s.state).toBe("DONE");
      expect(s.label).toBe("Tamamlandı");
      expect(s.tone).toBe("success");
    });
    it("overdue → OVERDUE", () => {
      const s = slaState({ status: "OPEN", dueAt: new Date(Date.now() - H).toISOString(), overdue: true }, Date.now());
      expect(s.state).toBe("OVERDUE");
      expect(s.label).toBe("Gecikti");
      expect(s.tone).toBe("danger");
    });
    // PERF-001 (ilgisiz flake fix): `slaState` gün-sınırını `isSameDay` ile YEREL
    // takvim gününe göre belirler. Eskiden `now = Date.now()` + 2s kullanılınca,
    // CI yerel gün-sınırına (UTC runner'da 22:00–24:00) yakın koşarsa `now+2h`
    // ertesi güne taşıp DUE_TODAY yerine INSIDE dönüyordu (tarih-bağımlı flake).
    // `now` yerel öğlene sabitlenerek +2s aynı gün, +72s farklı gün GARANTİLENİR;
    // üretim davranışı DEĞİŞMEZ (yalnız test determinizmi).
    const localNoon = () => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      return d.getTime();
    };
    it("bugün bitiyor → DUE_TODAY", () => {
      const now = localNoon();
      const s = slaState({ status: "ASSIGNED", dueAt: new Date(now + 2 * H).toISOString(), overdue: false }, now);
      expect(s.state).toBe("DUE_TODAY");
      expect(s.label).toBe("Bugün bitiyor");
    });
    it("ileri tarih → INSIDE", () => {
      const now = localNoon();
      const s = slaState({ status: "OPEN", dueAt: new Date(now + 72 * H).toISOString(), overdue: false }, now);
      expect(s.state).toBe("INSIDE");
      expect(s.tone).toBe("neutral");
    });
  });
});
