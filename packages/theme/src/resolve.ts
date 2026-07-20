import type { ThemeDocument } from "./schema.js";
import { isTokenRef, tokenRefPath } from "./schema.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Token Resolver — component → semantic → design → somut değer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `{grup.anahtar}` referanslarını, döngü ve derinlik koruması ile somut değere
 * indirger. Çözüm sırası:
 *   1. PRIMITIVE  — `tokens.<grup>.<anahtar>` (somut; şema gereği referans değil)
 *   2. SEMANTIC   — `semantic["<key>"]` (referans veya somut; özyinelemeli)
 *
 * Primitive önce denenir; bulunamazsa semantic'e düşer. Semantic anahtarları
 * primitive grup adlarıyla ÇAKIŞMAYACAK biçimde adlandırılır (page.*, content.*,
 * action.* …) → katman izolasyonu bozulmaz.
 */

const MAX_DEPTH = 16;

export class ThemeResolutionError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = "ThemeResolutionError";
  }
}

/** `tokens.<grup>.<anahtar>` primitive değerini döndürür (yoksa undefined). */
export function getPrimitive(doc: ThemeDocument, path: string): string | undefined {
  const dot = path.indexOf(".");
  if (dot < 0) return undefined;
  const group = path.slice(0, dot);
  const key = path.slice(dot + 1);
  const tokens = doc.tokens as unknown as Record<string, unknown>;
  const bag = tokens[group];
  if (bag && typeof bag === "object" && key in (bag as Record<string, unknown>)) {
    const value = (bag as Record<string, unknown>)[key];
    if (value == null) return undefined;
    return typeof value === "number" ? String(value) : String(value);
  }
  return undefined;
}

/**
 * Bir değeri (referans veya somut) tam somut değere indirger.
 * Döngü/eksik referans/aşırı derinlikte {@link ThemeResolutionError} fırlatır.
 */
export function resolveValue(
  value: string,
  doc: ThemeDocument,
  seen: Set<string> = new Set(),
  depth = 0,
): string {
  if (!isTokenRef(value)) return value;
  if (depth > MAX_DEPTH) {
    throw new ThemeResolutionError(`referans çözümü çok derin: ${value}`, value);
  }
  const path = tokenRefPath(value);
  if (seen.has(path)) {
    throw new ThemeResolutionError(`döngüsel referans: ${path}`, path);
  }
  seen.add(path);

  const primitive = getPrimitive(doc, path);
  if (primitive !== undefined) {
    // Primitive somuttur; yine de güvenlik için özyinele.
    return resolveValue(primitive, doc, seen, depth + 1);
  }

  const semantic = doc.semantic[path];
  if (semantic !== undefined) {
    return resolveValue(semantic, doc, seen, depth + 1);
  }

  throw new ThemeResolutionError(`çözülemeyen token referansı: ${path}`, path);
}

export interface ResolvedTheme {
  /** `page.background` gibi semantic anahtarları somut değere. */
  semantic: Record<string, string>;
  /** `<grup>.<anahtar>` primitive'leri somut string'e (sayılar stringlenir). */
  primitives: Record<string, string>;
  /** bileşen → { tokenKey: somut değer }. */
  components: Record<string, Record<string, string>>;
}

/**
 * Tüm belgeyi çözer: primitive + semantic + component katmanlarını somut
 * değerlere indirger. Herhangi bir eksik/döngüsel referans fırlatır.
 */
export function resolveTheme(doc: ThemeDocument): ResolvedTheme {
  const primitives: Record<string, string> = {};
  for (const [group, bag] of Object.entries(doc.tokens as unknown as Record<string, unknown>)) {
    if (!bag || typeof bag !== "object") continue;
    for (const [key, value] of Object.entries(bag as Record<string, unknown>)) {
      if (value == null) continue;
      primitives[`${group}.${key}`] =
        typeof value === "number" ? String(value) : String(value);
    }
  }

  const semantic: Record<string, string> = {};
  for (const [key, value] of Object.entries(doc.semantic)) {
    semantic[key] = resolveValue(value, doc);
  }

  const components: Record<string, Record<string, string>> = {};
  for (const [name, set] of Object.entries(doc.components)) {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(set.tokens)) {
      resolved[key] = resolveValue(value, doc);
    }
    components[name] = resolved;
  }

  return { primitives, semantic, components };
}

/**
 * Belgedeki TÜM referansları çözmeyi dener; çözülemeyenlerin/döngülerin
 * okunabilir listesini döndürür (throw etmez). Import doğrulaması için.
 */
export function collectResolutionErrors(doc: ThemeDocument): string[] {
  const errors: string[] = [];
  const check = (value: string, where: string) => {
    if (!isTokenRef(value)) return;
    try {
      resolveValue(value, doc);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${where}: ${message}`);
    }
  };
  for (const [key, value] of Object.entries(doc.semantic)) {
    check(value, `semantic.${key}`);
  }
  for (const [name, set] of Object.entries(doc.components)) {
    for (const [key, value] of Object.entries(set.tokens)) {
      check(value, `components.${name}.${key}`);
    }
  }
  return errors;
}
