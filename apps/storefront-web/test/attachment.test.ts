import { describe, expect, it } from "vitest";
import {
  IMAGE_MIME_TYPES,
  SUPPORT_ATTACHMENT_MIME_TYPES,
  attachmentPreviewKind,
  isTypeAccepted,
} from "../lib/attachment";

/**
 * TODO-177 (ADR-289) Faz D — Ek (attachment) MIME kabul + önizleme türü saf mantığı.
 * PhotoUpload paylaşılan bileşeni `accept` prop'u ile genişletildi: İADE akışı yalnız GÖRSEL
 * (default) kalır; DESTEK akışı GÖRSEL + PDF kabul eder (gateway 5 MiB, JPEG/PNG/WebP/PDF).
 * Bu, iade regresyonunu önler ve gateway kabulüyle bire bir hizalanır.
 */

describe("isTypeAccepted", () => {
  it("iade default'u (yalnız görsel) PDF'i reddeder — regression koruması", () => {
    expect(isTypeAccepted("image/jpeg", IMAGE_MIME_TYPES)).toBe(true);
    expect(isTypeAccepted("application/pdf", IMAGE_MIME_TYPES)).toBe(false);
  });
  it("destek kümesi görsel + PDF kabul eder", () => {
    expect(isTypeAccepted("image/png", SUPPORT_ATTACHMENT_MIME_TYPES)).toBe(true);
    expect(isTypeAccepted("image/webp", SUPPORT_ATTACHMENT_MIME_TYPES)).toBe(true);
    expect(isTypeAccepted("application/pdf", SUPPORT_ATTACHMENT_MIME_TYPES)).toBe(true);
  });
  it("kabul edilmeyen tür (video vb.) reddedilir", () => {
    expect(isTypeAccepted("video/mp4", SUPPORT_ATTACHMENT_MIME_TYPES)).toBe(false);
  });
});

describe("attachmentPreviewKind", () => {
  it("PDF → 'pdf' (blob img önizlemesi yerine dosya göstergesi)", () => {
    expect(attachmentPreviewKind("application/pdf")).toBe("pdf");
  });
  it("görsel → 'image'", () => {
    expect(attachmentPreviewKind("image/jpeg")).toBe("image");
    expect(attachmentPreviewKind("image/webp")).toBe("image");
  });
});
