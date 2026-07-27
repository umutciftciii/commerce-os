/**
 * PB-2/PB-3 — Minimal argv parser (bağımlılıksız). `--key value`, `--key=value`, `--flag`.
 * Değerler shell'e ENJEKTE EDİLMEZ (servisler spawn arg-array kullanır); parser yalnız çözer.
 */
export interface ParsedArgs {
  get(name: string): string | undefined;
  has(name: string): boolean;
  bool(name: string): boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const map = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const body = a.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      map.set(body.slice(0, eq), body.slice(eq + 1));
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        map.set(body, next);
        i++;
      } else {
        flags.add(body);
      }
    }
  }
  return {
    get: (name) => map.get(name),
    has: (name) => map.has(name) || flags.has(name),
    bool: (name) => flags.has(name) || map.get(name) === "true",
  };
}
