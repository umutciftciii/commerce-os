import { z } from "zod";

export const cuidLikeSchema = z.string().min(8);
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export function parseWithSchema<T>(schema: z.Schema<T>, value: unknown): T {
  return schema.parse(value);
}
