/**
 * Influencer Campaign Lifecycle & Granular Analytics (ADR-170…176) — saf çekirdek
 * testleri: status normalizasyonu, redirect erişim kuralı, attribution kapanış
 * politikası, terminal reason kovaları.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateConversionEligibility,
  evaluateRedirectEligibility,
  normalizeCampaignStatus,
  normalizeLinkStatus,
  terminalReasonBucket,
  type RedirectEligibilityInput,
} from "../src/influencers/tracking-core.js";

const NOW = 1_700_000_000_000;

function redirectInput(overrides: Partial<RedirectEligibilityInput> = {}): RedirectEligibilityInput {
  return {
    storeActive: true,
    influencerActive: true,
    campaignStatus: "ACTIVE",
    linkStatus: "ACTIVE",
    startsAtMs: null,
    endsAtMs: null,
    targetAvailable: true,
    nowMs: NOW,
    ...overrides,
  };
}

describe("status normalizasyonu (ADR-170)", () => {
  it("legacy ARCHIVED → ENDED, INACTIVE → PAUSED", () => {
    expect(normalizeCampaignStatus("ARCHIVED")).toBe("ENDED");
    expect(normalizeLinkStatus("INACTIVE")).toBe("PAUSED");
  });
  it("kanonik değerler korunur", () => {
    for (const s of ["DRAFT", "ACTIVE", "PAUSED", "ENDED", "CANCELLED"] as const) {
      expect(normalizeCampaignStatus(s)).toBe(s);
    }
    for (const s of ["ACTIVE", "PAUSED", "REVOKED"] as const) {
      expect(normalizeLinkStatus(s)).toBe(s);
    }
  });
  it("bilinmeyen değer güvenli terminale düşer", () => {
    expect(normalizeCampaignStatus("WAT")).toBe("ENDED");
    expect(normalizeLinkStatus(undefined)).toBe("REVOKED");
  });
});

describe("redirect erişim kuralı (ADR-171)", () => {
  it("hepsi geçerliyse izin verir", () => {
    expect(evaluateRedirectEligibility(redirectInput())).toEqual({ allowed: true, reason: null });
  });
  it("store pasifse reddeder", () => {
    expect(evaluateRedirectEligibility(redirectInput({ storeActive: false })).reason).toBe("STORE_NOT_ACTIVE");
  });
  it("influencer pasifse reddeder", () => {
    expect(evaluateRedirectEligibility(redirectInput({ influencerActive: false })).reason).toBe("INFLUENCER_NOT_ACTIVE");
  });
  it("kampanya CANCELLED → CAMPAIGN_CANCELLED", () => {
    expect(evaluateRedirectEligibility(redirectInput({ campaignStatus: "CANCELLED" })).reason).toBe("CAMPAIGN_CANCELLED");
  });
  it("kampanya ENDED → CAMPAIGN_ENDED", () => {
    expect(evaluateRedirectEligibility(redirectInput({ campaignStatus: "ENDED" })).reason).toBe("CAMPAIGN_ENDED");
  });
  it("kampanya PAUSED/DRAFT → CAMPAIGN_NOT_ACTIVE", () => {
    expect(evaluateRedirectEligibility(redirectInput({ campaignStatus: "PAUSED" })).reason).toBe("CAMPAIGN_NOT_ACTIVE");
    expect(evaluateRedirectEligibility(redirectInput({ campaignStatus: "DRAFT" })).reason).toBe("CAMPAIGN_NOT_ACTIVE");
  });
  it("link REVOKED → TRACKING_LINK_REVOKED", () => {
    expect(evaluateRedirectEligibility(redirectInput({ linkStatus: "REVOKED" })).reason).toBe("TRACKING_LINK_REVOKED");
  });
  it("link PAUSED → TRACKING_LINK_NOT_ACTIVE", () => {
    expect(evaluateRedirectEligibility(redirectInput({ linkStatus: "PAUSED" })).reason).toBe("TRACKING_LINK_NOT_ACTIVE");
  });
  it("başlamamış kampanya (startsAt gelecek) → CAMPAIGN_NOT_ACTIVE", () => {
    expect(evaluateRedirectEligibility(redirectInput({ startsAtMs: NOW + 1000 })).reason).toBe("CAMPAIGN_NOT_ACTIVE");
  });
  it("bitmiş kampanya (endsAt geçmiş) → CAMPAIGN_ENDED", () => {
    expect(evaluateRedirectEligibility(redirectInput({ endsAtMs: NOW - 1000 })).reason).toBe("CAMPAIGN_ENDED");
  });
  it("target kullanılamaz → TRACKING_TARGET_NOT_AVAILABLE", () => {
    expect(evaluateRedirectEligibility(redirectInput({ targetAvailable: false })).reason).toBe("TRACKING_TARGET_NOT_AVAILABLE");
  });
  it("tarih penceresi tam sınırda geçerli (startsAt<=now, endsAt>=now)", () => {
    expect(evaluateRedirectEligibility(redirectInput({ startsAtMs: NOW, endsAtMs: NOW })).allowed).toBe(true);
  });
});

describe("attribution kapanış politikası (ADR-173)", () => {
  const base = { influencerActive: true, withinWindow: true, linkStatus: "ACTIVE" as const };

  it("ACTIVE/PAUSED/ENDED pencere-içi eski session convert eder", () => {
    for (const campaignStatus of ["ACTIVE", "PAUSED", "ENDED"] as const) {
      expect(evaluateConversionEligibility({ ...base, campaignStatus })).toBe(true);
    }
  });
  it("CANCELLED/DRAFT convert ETMEZ", () => {
    for (const campaignStatus of ["CANCELLED", "DRAFT"] as const) {
      expect(evaluateConversionEligibility({ ...base, campaignStatus })).toBe(false);
    }
  });
  it("REVOKED link convert ETMEZ (kampanya ACTIVE olsa bile)", () => {
    expect(evaluateConversionEligibility({ ...base, campaignStatus: "ACTIVE", linkStatus: "REVOKED" })).toBe(false);
  });
  it("PAUSED link convert eder (yalnız yeni click kapalı)", () => {
    expect(evaluateConversionEligibility({ ...base, campaignStatus: "ACTIVE", linkStatus: "PAUSED" })).toBe(true);
  });
  it("link silinmiş (null) → kampanya/influencer yeter", () => {
    expect(evaluateConversionEligibility({ ...base, campaignStatus: "ENDED", linkStatus: null })).toBe(true);
  });
  it("pencere dışı convert ETMEZ", () => {
    expect(evaluateConversionEligibility({ ...base, campaignStatus: "ACTIVE", withinWindow: false })).toBe(false);
  });
  it("influencer pasif convert ETMEZ", () => {
    expect(evaluateConversionEligibility({ ...base, campaignStatus: "ACTIVE", influencerActive: false })).toBe(false);
  });
});

describe("terminal reason kovaları (ADR-172)", () => {
  it("ENDED → ended; CANCELLED/REVOKED/TARGET → unavailable; diğerleri → inactive", () => {
    expect(terminalReasonBucket("CAMPAIGN_ENDED")).toBe("ended");
    expect(terminalReasonBucket("CAMPAIGN_CANCELLED")).toBe("unavailable");
    expect(terminalReasonBucket("TRACKING_LINK_REVOKED")).toBe("unavailable");
    expect(terminalReasonBucket("TRACKING_TARGET_NOT_AVAILABLE")).toBe("unavailable");
    expect(terminalReasonBucket("CAMPAIGN_NOT_ACTIVE")).toBe("inactive");
    expect(terminalReasonBucket("STORE_NOT_ACTIVE")).toBe("inactive");
    expect(terminalReasonBucket("TRACKING_LINK_NOT_ACTIVE")).toBe("inactive");
  });
});
