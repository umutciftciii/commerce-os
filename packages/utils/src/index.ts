export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export function nowIso(): string {
  return new Date().toISOString();
}
