import { z } from "zod";

/**
 * TD-036 (ADR-057) — Opsiyonel ortam degiskeni normalizasyonu.
 *
 * Amac: `env_file`'da `KEY=` seklinde birakilan ya da docker override'da bos
 * string atanan OPSIYONEL degerlerin config yuklemesini cokertmesini onlemek.
 * `undefined`, `null`, `""` ve yalniz-bosluk degerleri "yok" (undefined) kabul
 * edilir; boylece opsiyonel alanlar varsayilanina/undefined'a duser.
 *
 * KURAL: Bu helper YALNIZ opsiyonel alanlarda kullanilir. ZORUNLU degerler
 * (DATABASE_URL, REDIS_URL, INTERNAL_API_TOKEN, SESSION_SECRET) strict kalir ve
 * eksik/gecersizse yuksek sesle hata verir. Opsiyonel bir alanda GECERSIZ
 * (bos olmayan) bir deger verilirse yine yuksek sesle hata verilir.
 */

/** `null` / `""` / yalniz-bosluk → `undefined`; diger her sey oldugu gibi. */
export function emptyToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

/** Herhangi bir (opsiyonel) semayi bos-string toleransli hale getirir. */
export function optionalEnv<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(emptyToUndefined, schema);
}

/**
 * Opsiyonel URL env.
 * - bos/whitespace/absent → `default` (verildiyse) ya da `undefined`
 * - gecerli URL → oldugu gibi
 * - bos OLMAYAN gecersiz string → yuksek sesle hata (yardimci mesajla)
 */
export function optionalUrlEnv(options: {
  default: string;
}): z.ZodType<string, z.ZodTypeDef, unknown>;
export function optionalUrlEnv(options?: {
  default?: undefined;
}): z.ZodType<string | undefined, z.ZodTypeDef, unknown>;
export function optionalUrlEnv(
  options: { default?: string } = {},
): z.ZodType<string | undefined, z.ZodTypeDef, unknown> {
  const base = z.string().url({
    message: "gecerli bir URL olmali (ya da tamamen bos birakin/kaldirin)",
  });
  const optionalized =
    options.default !== undefined ? base.optional().default(options.default) : base.optional();
  return optionalEnv(optionalized) as z.ZodType<string | undefined, z.ZodTypeDef, unknown>;
}

/**
 * Opsiyonel boolean env.
 * - bos/whitespace/absent → `defaultValue`
 * - `true`/`false` (string) ya da boolean → parse edilir
 * - bos OLMAYAN gecersiz string → yuksek sesle hata
 */
export function optionalBooleanEnv(defaultValue = false) {
  return optionalEnv(
    z
      .union([z.boolean(), z.enum(["true", "false"])])
      .optional()
      .default(defaultValue)
      .transform((value) => value === true || value === "true"),
  );
}

/**
 * Opsiyonel sayi env. Kisitlar (min/max/int/positive/default) caller tarafindan
 * verilen semada tanimlanir; bu helper yalniz bos-string toleransini ekler.
 * - bos/whitespace/absent → semanin default'u
 * - gecerli sayi → coerce edilir
 * - bos OLMAYAN gecersiz sayi → yuksek sesle hata
 */
export function optionalNumberEnv<T extends z.ZodTypeAny>(schema: T) {
  return optionalEnv(schema);
}
