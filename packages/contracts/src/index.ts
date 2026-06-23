import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export const tenantContextSchema = z.object({
  storeId: z.string().min(1),
  storeUserId: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "STAFF", "VIEWER"]),
});

export const platformEventSchema = z.object({
  type: z.enum([
    "STORE_CREATED",
    "STORE_UPDATED",
    "USER_INVITED",
    "SUBSCRIPTION_CHANGED",
    "SYSTEM_EVENT",
  ]),
  storeId: z.string().min(1).optional(),
  payload: z.record(z.unknown()).default({}),
  occurredAt: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type TenantContextContract = z.infer<typeof tenantContextSchema>;
export type PlatformEventContract = z.infer<typeof platformEventSchema>;
