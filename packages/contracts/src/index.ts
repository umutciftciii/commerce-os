import { z } from "zod";

const jsonRecordSchema = z.record(z.unknown());

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
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

export const platformUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.enum(["SUPER_ADMIN", "SUPPORT_ADMIN"]),
});

export const platformLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const platformLoginResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  user: platformUserSchema,
});

export const platformMeResponseSchema = z.object({
  user: platformUserSchema,
  session: z.object({
    id: z.string().min(1),
    expiresAt: z.string().datetime(),
  }),
});

export const platformLogoutResponseSchema = z.object({
  revoked: z.boolean(),
});

export const storeStatusSchema = z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "CLOSED"]);

export const adminStoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  domain: z.string().min(3).max(255).nullable(),
  status: storeStatusSchema,
  metadata: jsonRecordSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const adminStoreListResponseSchema = z.object({
  data: z.array(adminStoreSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const adminStoreCreateRequestSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  status: storeStatusSchema.default("DRAFT"),
  domain: z.string().min(3).max(255).optional(),
  metadata: jsonRecordSchema.optional(),
});

export const adminStoreUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    status: storeStatusSchema.optional(),
    metadata: jsonRecordSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const planSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  metadata: jsonRecordSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const planListResponseSchema = z.object({
  data: z.array(planSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const planCreateRequestSchema = z.object({
  code: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  metadata: jsonRecordSchema.optional(),
});

export const planUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    metadata: jsonRecordSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type TenantContextContract = z.infer<typeof tenantContextSchema>;
export type PlatformEventContract = z.infer<typeof platformEventSchema>;
export type PlatformUserContract = z.infer<typeof platformUserSchema>;
export type PlatformLoginRequest = z.infer<typeof platformLoginRequestSchema>;
export type PlatformLoginResponse = z.infer<typeof platformLoginResponseSchema>;
export type PlatformMeResponse = z.infer<typeof platformMeResponseSchema>;
export type PlatformLogoutResponse = z.infer<typeof platformLogoutResponseSchema>;
export type AdminStore = z.infer<typeof adminStoreSchema>;
export type AdminStoreListResponse = z.infer<typeof adminStoreListResponseSchema>;
export type AdminStoreCreateRequest = z.infer<typeof adminStoreCreateRequestSchema>;
export type AdminStoreUpdateRequest = z.infer<typeof adminStoreUpdateRequestSchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanListResponse = z.infer<typeof planListResponseSchema>;
export type PlanCreateRequest = z.infer<typeof planCreateRequestSchema>;
export type PlanUpdateRequest = z.infer<typeof planUpdateRequestSchema>;
