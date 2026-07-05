import { describe, expect, it } from "vitest";
import {
  campaignCreateRequestSchema,
  campaignUpdateRequestSchema,
  deriveIsPublicFromAccessModel,
} from "@commerce-os/contracts";

/**
 * F4A.4 — Kampanya SUNUM alanları + erişim modeli sözleşme doğrulaması (ADR-061).
 * Bu alanlar yalnızca görünümdür; motoru etkilemez. FOLLOW/store-follow/
 * seller-follow gibi takip tabanlı hiçbir değer kabul EDİLMEZ.
 */
const BASE = {
  name: "Hafta Sonu",
  type: "COUPON_CODE" as const,
  discountType: "PERCENT" as const,
  discountValue: 10,
  couponCode: "HAFTASONU10",
};

describe("F4A.4 · campaign presentation contract", () => {
  it("accepts a campaign with all display fields + access model", () => {
    const parsed = campaignCreateRequestSchema.parse({
      ...BASE,
      displayTitle: "Hafta sonu 500 TL’ye 100 TL kupon",
      shortDescription: "Tüm indirimlere ek fırsat",
      terms: "Kampanya stoklarla sınırlıdır.",
      badgeLabel: "Süper Kupon",
      badgeVariant: "SUPER",
      cardStyle: "FEATURED",
      accessModel: "PUBLIC_CLAIMABLE",
      displayPriority: 5,
    });
    expect(parsed.displayTitle).toBe("Hafta sonu 500 TL’ye 100 TL kupon");
    expect(parsed.badgeVariant).toBe("SUPER");
    expect(parsed.accessModel).toBe("PUBLIC_CLAIMABLE");
  });

  it("basic campaign still works with defaulted display fields (backward compatible)", () => {
    const parsed = campaignCreateRequestSchema.parse(BASE);
    expect(parsed.displayTitle ?? null).toBeNull();
    expect(parsed.badgeVariant ?? null).toBeNull();
    expect(parsed.cardStyle).toBe("STANDARD");
    expect(parsed.accessModel).toBe("AUTO_VISIBLE");
    expect(parsed.displayPriority).toBe(0);
  });

  it("rejects an overly long displayTitle (>120)", () => {
    const result = campaignCreateRequestSchema.safeParse({ ...BASE, displayTitle: "a".repeat(121) });
    expect(result.success).toBe(false);
  });

  it("rejects an overly long shortDescription (>240)", () => {
    const result = campaignCreateRequestSchema.safeParse({
      ...BASE,
      shortDescription: "a".repeat(241),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an overly long badgeLabel (>40)", () => {
    const result = campaignCreateRequestSchema.safeParse({ ...BASE, badgeLabel: "a".repeat(41) });
    expect(result.success).toBe(false);
  });

  it("rejects overly long terms (>2000)", () => {
    const result = campaignCreateRequestSchema.safeParse({ ...BASE, terms: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid badgeVariant / cardStyle", () => {
    expect(campaignCreateRequestSchema.safeParse({ ...BASE, badgeVariant: "MEGA" }).success).toBe(false);
    expect(campaignCreateRequestSchema.safeParse({ ...BASE, cardStyle: "GLOSSY" }).success).toBe(false);
  });

  it("rejects follow-based / reserved access model values", () => {
    for (const forbidden of [
      "FOLLOW_REQUIRED",
      "STORE_FOLLOW",
      "SELLER_FOLLOW",
      "FOLLOW_REQUIRED_RESERVED",
      "FIRST_ORDER",
      "RETURNING_CUSTOMER",
      "EMAIL_LIST",
    ]) {
      expect(campaignCreateRequestSchema.safeParse({ ...BASE, accessModel: forbidden }).success).toBe(
        false,
      );
    }
  });

  it("derives isPublic from access model consistently", () => {
    expect(deriveIsPublicFromAccessModel("AUTO_VISIBLE")).toBe(true);
    expect(deriveIsPublicFromAccessModel("PUBLIC_CLAIMABLE")).toBe(true);
    expect(deriveIsPublicFromAccessModel("CODE_CLAIMED")).toBe(false);
    expect(deriveIsPublicFromAccessModel("ADMIN_ASSIGNED")).toBe(false);
  });

  it("update schema accepts partial display-field edits", () => {
    const parsed = campaignUpdateRequestSchema.parse({ displayTitle: "Yeni başlık", accessModel: "CODE_CLAIMED" });
    expect(parsed.displayTitle).toBe("Yeni başlık");
    expect(parsed.accessModel).toBe("CODE_CLAIMED");
  });
});
