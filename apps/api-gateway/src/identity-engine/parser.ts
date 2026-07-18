/**
 * TODO-150 (ADR-073) — Identity Management Engine · PARSER (SAF ÇEKİRDEK).
 *
 * Tokenizer'ın ürettiği lexeme akışını anlamsal olarak DOĞRULANMIŞ bir AST'ye (`Segment[]`) çevirir.
 * Token isimleri bilinen kümeye göre çözülür; argüman zorunluluğu / SEQ padding / rezerve token
 * kuralları BURADA uygulanır. SAF: Prisma / HTTP / Date / Math.random BİLMEZ, yan etki YOK.
 *
 * Aktif token'lar (bu faz):  PRODUCT · CATEGORY · ATTRIBUTE:code · COLOR(=ATTRIBUTE:color) ·
 *                            SIZE(=ATTRIBUTE:size) · SEQ / SEQ:padding
 * Rezerve token'lar (infra):  ID · YEAR · MONTH  → bu faz IDENTITY_TOKEN_NOT_SUPPORTED
 *
 * Parser derlenmiş pattern'ı ürettiğinden ürün başına BİR kez derlenir, N varyantta yeniden değil
 * (performans; O(P) derleme + O(n·L) değerlendirme).
 */

import { tokenize } from "./tokenizer.js";
import type { TokenizeError } from "./tokenizer.js";

// ─────────────────────────── AST ───────────────────────────

export type SegmentKind = "literal" | "product" | "category" | "attribute" | "seq";

export interface LiteralSegment {
  kind: "literal";
  value: string;
}
export interface ProductSegment {
  kind: "product";
}
export interface CategorySegment {
  kind: "category";
}
/** ATTRIBUTE / COLOR / SIZE hepsi buraya normalize olur (code alanıyla). */
export interface AttributeSegment {
  kind: "attribute";
  /** AttributeDefinition.code (örn. "color", "size"). Daima küçük harfe normalize edilir. */
  code: string;
}
export interface SeqSegment {
  kind: "seq";
  /** Sıfır-dolgu genişliği (varsayılan 3; {SEQ:n} ile ayarlanır). */
  padding: number;
}

export type Segment =
  | LiteralSegment
  | ProductSegment
  | CategorySegment
  | AttributeSegment
  | SeqSegment;

export interface CompiledPattern {
  /** Orijinal ham pattern (audit/echo için). */
  source: string;
  segments: Segment[];
  /** Bu pattern SEQ içeriyor mu (collision-önleme ipucu; UI/servis için). */
  usesSeq: boolean;
  /** Referans verilen distinct attribute code'ları (batch metadata çözümü için). */
  attributeCodes: string[];
}

export type ParseErrorCode =
  | TokenizeError["code"]
  | "IDENTITY_PATTERN_EMPTY"
  | "IDENTITY_UNKNOWN_TOKEN"
  | "IDENTITY_TOKEN_ARG_REQUIRED"
  | "IDENTITY_TOKEN_ARG_UNEXPECTED"
  | "IDENTITY_SEQ_PADDING_INVALID"
  | "IDENTITY_TOKEN_NOT_SUPPORTED";

export interface ParseError {
  code: ParseErrorCode;
  message: string;
  index?: number;
}

export type ParseResult =
  | { ok: true; pattern: CompiledPattern }
  | { ok: false; error: ParseError };

// Rezerve (infra hazır ama bu faz aktif değil) token isimleri.
const RESERVED_TOKENS = new Set(["ID", "YEAR", "MONTH"]);
// Argüman ALMAYAN aktif token'lar.
const NO_ARG_TOKENS = new Set(["PRODUCT", "CATEGORY", "COLOR", "SIZE"]);
// SEQ padding güvenlik sınırı (aşırı bellek/uzunluk guard'ı).
const MAX_SEQ_PADDING = 12;

/**
 * Ham pattern'ı derler. Boş pattern (yalnız boşluk dahil) reddedilir: uygulanacak alanın patternı
 * boş olamaz. İlk hatada erken döner (deterministik kod + konum).
 */
export function parsePattern(source: string): ParseResult {
  if (source.trim().length === 0) {
    return {
      ok: false,
      error: { code: "IDENTITY_PATTERN_EMPTY", message: "Pattern must not be empty." },
    };
  }

  const lexed = tokenize(source);
  if (!lexed.ok) {
    return { ok: false, error: { code: lexed.error.code, message: lexed.error.message, index: lexed.error.index } };
  }

  const segments: Segment[] = [];
  let usesSeq = false;
  const attributeCodes = new Set<string>();

  for (const lex of lexed.lexemes) {
    if (lex.kind === "literal") {
      segments.push({ kind: "literal", value: lex.text });
      continue;
    }

    const name = lex.name!;
    const arg = lex.arg;

    if (RESERVED_TOKENS.has(name)) {
      return {
        ok: false,
        error: {
          code: "IDENTITY_TOKEN_NOT_SUPPORTED",
          message: `Token {${name}} is reserved and not supported in this phase.`,
          index: lex.start,
        },
      };
    }

    if (name === "SEQ") {
      let padding = 3;
      if (arg !== undefined) {
        if (!/^[0-9]+$/.test(arg)) {
          return {
            ok: false,
            error: {
              code: "IDENTITY_SEQ_PADDING_INVALID",
              message: `{SEQ} padding must be a non-negative integer (got "${arg}").`,
              index: lex.start,
            },
          };
        }
        padding = Number.parseInt(arg, 10);
        if (padding < 1 || padding > MAX_SEQ_PADDING) {
          return {
            ok: false,
            error: {
              code: "IDENTITY_SEQ_PADDING_INVALID",
              message: `{SEQ} padding must be between 1 and ${MAX_SEQ_PADDING}.`,
              index: lex.start,
            },
          };
        }
      }
      usesSeq = true;
      segments.push({ kind: "seq", padding });
      continue;
    }

    if (name === "ATTRIBUTE") {
      if (arg === undefined) {
        return {
          ok: false,
          error: {
            code: "IDENTITY_TOKEN_ARG_REQUIRED",
            message: "{ATTRIBUTE:code} requires an attribute code argument.",
            index: lex.start,
          },
        };
      }
      const code = arg.toLowerCase();
      attributeCodes.add(code);
      segments.push({ kind: "attribute", code });
      continue;
    }

    if (name === "COLOR" || name === "SIZE") {
      if (arg !== undefined) {
        return {
          ok: false,
          error: {
            code: "IDENTITY_TOKEN_ARG_UNEXPECTED",
            message: `{${name}} does not take an argument.`,
            index: lex.start,
          },
        };
      }
      const code = name.toLowerCase(); // color / size
      attributeCodes.add(code);
      segments.push({ kind: "attribute", code });
      continue;
    }

    if (NO_ARG_TOKENS.has(name)) {
      // PRODUCT / CATEGORY
      if (arg !== undefined) {
        return {
          ok: false,
          error: {
            code: "IDENTITY_TOKEN_ARG_UNEXPECTED",
            message: `{${name}} does not take an argument.`,
            index: lex.start,
          },
        };
      }
      segments.push({ kind: name === "PRODUCT" ? "product" : "category" });
      continue;
    }

    return {
      ok: false,
      error: {
        code: "IDENTITY_UNKNOWN_TOKEN",
        message: `Unknown token {${name}}.`,
        index: lex.start,
      },
    };
  }

  return {
    ok: true,
    pattern: {
      source,
      segments,
      usesSeq,
      attributeCodes: [...attributeCodes],
    },
  };
}
