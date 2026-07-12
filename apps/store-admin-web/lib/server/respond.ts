import { NextResponse } from "next/server";
import { ApiError } from "@commerce-os/api-client";

/**
 * Yakalanan bir hatayi tarayiciya guvenli JSON yanitina cevirir. Yalnizca
 * makine-okunur `code` ve HTTP status doner; gateway'in ham mesaji veya gizli
 * detaylar istemciye sizdirilmaz. UI bu `code`'u i18n sozluguyle Turkce mesaja
 * cevirir.
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    // `details` yalnizca gateway'in BILINCLI koydugu yapilandirilmis veridir (ham
    // mesaj `message`'da kalir, o gizlenir). Structured details (or. MEDIA_IN_USE'un
    // `usedIn` listesi, validation fieldErrors) UI'a guvenle tasinir.
    const body: { code: string; details?: unknown } = { code: error.code };
    if (error.details !== undefined) body.details = error.details;
    return NextResponse.json({ error: body }, { status: error.status });
  }
  // Ag/altyapi hatasi: gateway'e ulasilamadi. Kod expose etmeden NETWORK doneriz.
  return NextResponse.json({ error: { code: "NETWORK" } }, { status: 502 });
}

/** Oturum cookie'si yoksa kullanilan standart 401 yaniti. */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
}

/** CSRF token/header dogrulamasi basarisiz oldugunda kullanilan standart 403 yaniti. */
export function csrfForbiddenResponse(): NextResponse {
  return NextResponse.json({ error: { code: "CSRF_TOKEN_INVALID" } }, { status: 403 });
}

/** Govde JSON degilse kullanilan standart 400 yaniti. */
export function badRequestResponse(): NextResponse {
  return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
}

/** Hesaba bagli mağaza cozulemediginde kullanilan standart 404 yaniti. */
export function noStoreResponse(): NextResponse {
  return NextResponse.json({ error: { code: "NO_STORE" } }, { status: 404 });
}
