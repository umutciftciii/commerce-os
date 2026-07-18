/**
 * TODO-150 (ADR-073) — Identity Management Engine · TOKENIZER (SAF ÇEKİRDEK).
 *
 * Bir identity pattern string'ini ("TSH-{COLOR}-{SEQ:3}") bir TOKEN AKIŞINA (lexeme dizisi) çevirir.
 * Bu modül TAMAMEN SAFTIR: Prisma / DB / HTTP / Date / Math.random / process.env BİLMEZ; yalnız
 * input → output, yan etki YOK, deterministik. Değerlendirme (evaluator) ve DB çözümü BURADA DEĞİL.
 *
 * Grammar:
 *   pattern := segment*
 *   segment := literal | escaped | token
 *   escaped := "{{" → "{"  |  "}}" → "}"
 *   token   := "{" NAME (":" ARG)? "}"
 *   NAME    := [A-Z]+          (yalnız büyük harf; "recursive"/nested "{" token içinde YASAK)
 *   ARG     := [A-Za-z0-9_-]+
 *   literal := "{" "}" dışı karakter
 *
 * Neden string-replace DEĞİL: kaçış (`{{`), argümanlı token (`{ATTRIBUTE:color}`), dengesiz/iç-içe
 * parantez ve bilinmeyen token STABIL hata kodu üretmeli; saf lexer bunu izole test edilebilir kılar.
 */

export type LexemeKind = "literal" | "token";

export interface Lexeme {
  kind: LexemeKind;
  /** literal için ham metin (kaçış çözülmüş); token için ham metin ("{...}" içeriği tanısal). */
  text: string;
  /** token ise büyük-harf NAME (örn. "ATTRIBUTE", "SEQ"); literal ise undefined. */
  name?: string;
  /** token ise ":" sonrası ARG (örn. "color", "3"); yoksa undefined. */
  arg?: string;
  /** Girdideki 0-tabanlı başlangıç konumu (tanısal). */
  start: number;
}

export type TokenizeErrorCode =
  | "IDENTITY_EMPTY_TOKEN" // "{}"
  | "IDENTITY_UNCLOSED_TOKEN" // "{" kapanmadan pattern bitti
  | "IDENTITY_UNEXPECTED_CLOSE" // "}" açılmadan geldi
  | "IDENTITY_NESTED_TOKEN" // token içinde "{" (recursive/iç-içe)
  | "IDENTITY_TOKEN_SYNTAX"; // NAME/ARG charset ihlali

export interface TokenizeError {
  code: TokenizeErrorCode;
  message: string;
  /** Hatanın girdideki konumu (tanısal). */
  index: number;
}

export type TokenizeResult =
  | { ok: true; lexemes: Lexeme[] }
  | { ok: false; error: TokenizeError };

const NAME_RE = /^[A-Z]+$/;
const ARG_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Pattern string'ini lexeme'lere böler. Bitişik literal karakterler tek bir "literal" lexeme'de
 * toplanır (kaçış çözülmüş). İlk hatada erken döner (deterministik konumla).
 */
export function tokenize(pattern: string): TokenizeResult {
  const lexemes: Lexeme[] = [];
  let literal = "";
  let literalStart = 0;

  const flushLiteral = () => {
    if (literal.length > 0) {
      lexemes.push({ kind: "literal", text: literal, start: literalStart });
      literal = "";
    }
  };

  let i = 0;
  const n = pattern.length;
  while (i < n) {
    const ch = pattern[i]!;

    if (ch === "{") {
      // Kaçış: "{{" → literal "{"
      if (pattern[i + 1] === "{") {
        if (literal.length === 0) literalStart = i;
        literal += "{";
        i += 2;
        continue;
      }
      // Token başlangıcı: "}" veya girdinin sonuna kadar tara.
      flushLiteral();
      const tokenStart = i;
      let j = i + 1;
      let body = "";
      let closed = false;
      while (j < n) {
        const c = pattern[j]!;
        if (c === "}") {
          closed = true;
          break;
        }
        if (c === "{") {
          return {
            ok: false,
            error: {
              code: "IDENTITY_NESTED_TOKEN",
              message: `Nested "{" inside a token at index ${j}.`,
              index: j,
            },
          };
        }
        body += c;
        j += 1;
      }
      if (!closed) {
        return {
          ok: false,
          error: {
            code: "IDENTITY_UNCLOSED_TOKEN",
            message: `Unclosed "{" starting at index ${tokenStart}.`,
            index: tokenStart,
          },
        };
      }
      if (body.length === 0) {
        return {
          ok: false,
          error: {
            code: "IDENTITY_EMPTY_TOKEN",
            message: `Empty token "{}" at index ${tokenStart}.`,
            index: tokenStart,
          },
        };
      }
      // body = NAME veya NAME:ARG
      const colon = body.indexOf(":");
      const name = colon === -1 ? body : body.slice(0, colon);
      const arg = colon === -1 ? undefined : body.slice(colon + 1);
      if (!NAME_RE.test(name)) {
        return {
          ok: false,
          error: {
            code: "IDENTITY_TOKEN_SYNTAX",
            message: `Token name "${name}" must be uppercase letters (index ${tokenStart}).`,
            index: tokenStart,
          },
        };
      }
      if (arg !== undefined && !ARG_RE.test(arg)) {
        return {
          ok: false,
          error: {
            code: "IDENTITY_TOKEN_SYNTAX",
            message: `Token argument "${arg}" has invalid characters (index ${tokenStart}).`,
            index: tokenStart,
          },
        };
      }
      lexemes.push({ kind: "token", text: body, name, arg, start: tokenStart });
      i = j + 1;
      continue;
    }

    if (ch === "}") {
      // Kaçış: "}}" → literal "}"
      if (pattern[i + 1] === "}") {
        if (literal.length === 0) literalStart = i;
        literal += "}";
        i += 2;
        continue;
      }
      return {
        ok: false,
        error: {
          code: "IDENTITY_UNEXPECTED_CLOSE",
          message: `Unexpected "}" at index ${i} (no matching "{").`,
          index: i,
        },
      };
    }

    if (literal.length === 0) literalStart = i;
    literal += ch;
    i += 1;
  }

  flushLiteral();
  return { ok: true, lexemes };
}
