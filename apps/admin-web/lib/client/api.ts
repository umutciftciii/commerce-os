import type {
  AdminStore,
  AdminStoreCreateRequest,
  AdminStoreListResponse,
  AdminStoreUpdateRequest,
  ThemeBindingResponse,
  ThemeBindingAssignRequest,
  ThemeBindingListResponse,
  // TODO-164B Dilim 2 — Platform Theme Library / Designer / Rollout.
  LibraryListResponse,
  LibraryTemplateCreateRequest,
  ThemeDetail,
  ThemeUpdateRequest,
  ThemeDraftUpdateRequest,
  ThemePublishRequest,
  ThemeDuplicateRequest,
  ThemeRollbackRequest,
  ThemePolicyUpdateRequest,
  ThemeChangeSummary,
  TemplateUsageResponse,
  AssignableStoresResponse,
  ThemeAssignPreviewRequest,
  ThemeAssignPreviewResponse,
  ThemeAssignRequest,
  RolloutSummaryResponse,
  LibraryPreviewTokenRequest,
  ThemeStageAssetsRequest,
  ThemePreviewTokenResponse,
  HealthResponse,
  Plan,
  PlanCreateRequest,
  PlanListResponse,
  PlanUpdateRequest,
  PlanCapabilitiesResponse,
  PlanCapabilitiesUpdateRequest,
  PlanCapabilityPreviewResponse,
  PlatformMeResponse,
  SessionTiming,
  PlatformUserContract,
  // TODO-177 (ADR-289) — Ürün Desteği question-set yönetimi.
  PlatformSupportQuestionSetListResponse,
  PlatformSupportQuestionSetDetailResponse,
  PlatformSupportGraphValidationResponse,
  PlatformSupportQuestionSetCreateRequest,
  PlatformSupportQuestionSetUpdateRequest,
  PlatformSupportVersionCreateRequest,
  PlatformSupportVersionEditRequest,
  PlatformSupportMappingUpsertRequest,
  PlatformSupportTopicDefaultUpsertRequest,
  AdminProductSelectorResponse,
  AdminCategorySelectorResponse,
  // TODO-178 — Mağaza Talepleri (Store→Platform request inbox).
  PlatformRequestInboxQuery,
  PlatformRequestListResponse,
  PlatformRequestDetailResponse,
  PlatformRequestAssignRequest,
  PlatformRequestPriorityRequest,
  PlatformRequestStatusRequest,
  PlatformRequestRecategorizeRequest,
  PlatformRequestMessageCreateRequest,
  PlatformRequestAttachmentResponse,
  PlatformRequestCategoryListResponse,
  PlatformUserDirectoryQuery,
  PlatformUserDirectoryResponse,
} from "@commerce-os/api-client";

// TODO-178 — query → same-origin BFF query string (yalnız tanımlı alanlar).
function toQueryString(query: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * Tarayici -> ayni-origin BFF (/api/*) istemcisi. Gateway'e dogrudan gitmez
 * (CORS/secret yok); tum cagrilar admin-web route handler'lari uzerinden gecer.
 * Hata durumunda makine-okunur `code` tasiyan {@link UiError} firlatir.
 */
export class UiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "UiError";
    this.code = code;
  }
}

let csrfTokenCache: { token: string; headerName: string } | null = null;

export function resetCsrfTokenCacheForTest(): void {
  csrfTokenCache = null;
}

async function csrfHeaders(): Promise<Record<string, string>> {
  if (!csrfTokenCache) {
    let response: Response;
    try {
      response = await fetch("/api/auth/csrf");
    } catch {
      throw new UiError("NETWORK");
    }
    if (!response.ok) {
      throw new UiError("CSRF_TOKEN_INVALID");
    }
    const body = (await response.json()) as { csrfToken?: unknown; headerName?: unknown };
    if (typeof body.csrfToken !== "string" || typeof body.headerName !== "string") {
      throw new UiError("CSRF_TOKEN_INVALID");
    }
    csrfTokenCache = { token: body.csrfToken, headerName: body.headerName };
  }
  return { [csrfTokenCache.headerName]: csrfTokenCache.token };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  // FormData gövdesinde content-type SET EDİLMEZ — tarayıcı multipart boundary'yi kendisi koyar
  // (TODO-178 Faz E attachment upload). JSON gövdelerde eskisi gibi application/json.
  const isForm = init?.body instanceof FormData;
  try {
    response = await fetch(path, {
      ...init,
      headers: { ...(isForm ? {} : { "content-type": "application/json" }), ...(init?.headers ?? {}) },
    });
  } catch {
    throw new UiError("NETWORK");
  }

  if (!response.ok) {
    let code = "UNKNOWN";
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error?: { code?: unknown } }).error?.code === "string"
      ) {
        code = (body as { error: { code: string } }).error.code;
      }
    } catch {
      // Govde JSON degil — genel UNKNOWN kodu kullanilir.
    }
    throw new UiError(code);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function mutatingCall<T>(path: string, init: RequestInit): Promise<T> {
  const headers = await csrfHeaders();
  return call<T>(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
}

export type AdminUser = PlatformUserContract;

export interface SystemHealth {
  health: HealthResponse;
  version: { name: string; service: string; version: string };
  gatewayUrl: string;
}

export type InternalProbe = "ok" | "degraded" | "unknown";

export type SystemInternal =
  | { available: false }
  | { available: true; db: InternalProbe; redis: InternalProbe };

export const adminApi = {
  // Auth
  login: (email: string, password: string, rememberMe = false) =>
    call<{ user: AdminUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, rememberMe }),
    }),
  me: () => call<PlatformMeResponse>("/api/auth/me"),
  logout: () => mutatingCall<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  // ADR-271 — oturum uzatma (CSRF korumali; token rotate). Yeni zamanlama doner.
  extendSession: () =>
    mutatingCall<{ timing: SessionTiming }>("/api/auth/extend", { method: "POST" }),

  // Stores
  listStores: () => call<AdminStoreListResponse>("/api/admin/stores"),
  createStore: (input: AdminStoreCreateRequest) =>
    mutatingCall<AdminStore>("/api/admin/stores", { method: "POST", body: JSON.stringify(input) }),
  updateStore: (id: string, input: AdminStoreUpdateRequest) =>
    mutatingCall<AdminStore>(`/api/admin/stores/${id}`, { method: "PATCH", body: JSON.stringify(input) }),

  // TODO-164 (ADR-222) — "Tema ve Marka" (theme-binding).
  listThemeBindings: () => call<ThemeBindingListResponse>("/api/admin/theme-bindings"),
  getThemeBinding: (id: string) =>
    call<ThemeBindingResponse>(`/api/admin/stores/${id}/theme-binding`),
  assignThemeBinding: (id: string, input: ThemeBindingAssignRequest) =>
    mutatingCall<ThemeBindingResponse>(`/api/admin/stores/${id}/theme-binding`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  // TODO-164B Dilim 2 — Platform Tema Kütüphanesi + Designer + Rollout.
  listThemeLibrary: () => call<LibraryListResponse>("/api/admin/theme-library"),
  createTemplate: (input: LibraryTemplateCreateRequest) =>
    mutatingCall<ThemeDetail>("/api/admin/theme-library", { method: "POST", body: JSON.stringify(input) }),
  getTemplate: (id: string) => call<ThemeDetail>(`/api/admin/theme-library/${id}`),
  updateTemplateMeta: (id: string, input: ThemeUpdateRequest) =>
    mutatingCall<ThemeDetail>(`/api/admin/theme-library/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  saveTemplateDraft: (id: string, input: ThemeDraftUpdateRequest) =>
    mutatingCall<ThemeDetail>(`/api/admin/theme-library/${id}/draft`, { method: "PUT", body: JSON.stringify(input) }),
  setTemplatePolicy: (id: string, input: ThemePolicyUpdateRequest) =>
    mutatingCall<ThemeDetail>(`/api/admin/theme-library/${id}/policy`, { method: "PUT", body: JSON.stringify(input) }),
  publishTemplate: (id: string, input: ThemePublishRequest) =>
    mutatingCall<ThemeDetail>(`/api/admin/theme-library/${id}/publish`, { method: "POST", body: JSON.stringify(input) }),
  archiveTemplate: (id: string) =>
    mutatingCall<ThemeDetail>(`/api/admin/theme-library/${id}/archive`, { method: "POST", body: "{}" }),
  duplicateTemplate: (id: string, input: ThemeDuplicateRequest) =>
    mutatingCall<ThemeDetail>(`/api/admin/theme-library/${id}/duplicate`, { method: "POST", body: JSON.stringify(input) }),
  rollbackTemplate: (id: string, input: ThemeRollbackRequest) =>
    mutatingCall<ThemeDetail>(`/api/admin/theme-library/${id}/rollback`, { method: "POST", body: JSON.stringify(input) }),
  templatePreviewToken: (id: string, input: LibraryPreviewTokenRequest) =>
    mutatingCall<ThemePreviewTokenResponse>(`/api/admin/theme-library/${id}/preview-token`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  stageTemplateAssets: (id: string, input: ThemeStageAssetsRequest) =>
    mutatingCall<ThemeDetail>(`/api/admin/theme-library/${id}/stage-assets`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  templateDiff: (id: string, query: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (query.from) qs.set("from", query.from);
    if (query.to) qs.set("to", query.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call<ThemeChangeSummary>(`/api/admin/theme-library/${id}/diff${suffix}`);
  },
  templateUsage: (id: string) => call<TemplateUsageResponse>(`/api/admin/theme-library/${id}/usage`),
  assignableStores: () => call<AssignableStoresResponse>("/api/admin/theme-library/assignable-stores"),
  assignPreview: (id: string, input: ThemeAssignPreviewRequest) =>
    mutatingCall<ThemeAssignPreviewResponse>(`/api/admin/theme-library/${id}/assign/preview`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  assignTemplate: (id: string, input: ThemeAssignRequest) =>
    mutatingCall<RolloutSummaryResponse>(`/api/admin/theme-library/${id}/assign`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  applyTemplateUpdate: (id: string, input: ThemeAssignRequest) =>
    mutatingCall<RolloutSummaryResponse>(`/api/admin/theme-library/${id}/update/apply`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Plans
  listPlans: () => call<PlanListResponse>("/api/admin/plans"),
  createPlan: (input: PlanCreateRequest) =>
    mutatingCall<Plan>("/api/admin/plans", { method: "POST", body: JSON.stringify(input) }),
  updatePlan: (id: string, input: PlanUpdateRequest) =>
    mutatingCall<Plan>(`/api/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(input) }),

  // TODO-163 Faz 3 (TD-154) — Plan → Capability editörü.
  getPlanCapabilities: (id: string) =>
    call<PlanCapabilitiesResponse>(`/api/admin/plans/${id}/capabilities`),
  previewPlanCapabilities: (id: string, input: PlanCapabilitiesUpdateRequest) =>
    mutatingCall<PlanCapabilityPreviewResponse>(`/api/admin/plans/${id}/capabilities/preview`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  applyPlanCapabilities: (id: string, input: PlanCapabilitiesUpdateRequest) =>
    mutatingCall<PlanCapabilitiesResponse>(`/api/admin/plans/${id}/capabilities`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  // TODO-177 (ADR-289) — Ürün Desteği question-set yönetimi (platform-only).
  listQuestionSets: () =>
    call<PlatformSupportQuestionSetListResponse>("/api/admin/support/question-sets"),
  createQuestionSet: (input: PlatformSupportQuestionSetCreateRequest) =>
    mutatingCall<PlatformSupportQuestionSetDetailResponse>("/api/admin/support/question-sets", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getQuestionSet: (id: string) =>
    call<PlatformSupportQuestionSetDetailResponse>(`/api/admin/support/question-sets/${id}`),
  updateQuestionSet: (id: string, input: PlatformSupportQuestionSetUpdateRequest) =>
    mutatingCall<PlatformSupportQuestionSetDetailResponse>(
      `/api/admin/support/question-sets/${id}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  createQuestionSetVersion: (id: string, input: PlatformSupportVersionCreateRequest) =>
    mutatingCall<PlatformSupportQuestionSetDetailResponse>(
      `/api/admin/support/question-sets/${id}/versions`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  editQuestionSetVersion: (versionId: string, input: PlatformSupportVersionEditRequest) =>
    mutatingCall<{ ok: boolean }>(`/api/admin/support/versions/${versionId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  validateQuestionSetVersion: (versionId: string) =>
    mutatingCall<PlatformSupportGraphValidationResponse>(
      `/api/admin/support/versions/${versionId}/validate`,
      { method: "POST" },
    ),
  publishQuestionSetVersion: (versionId: string) =>
    mutatingCall<{ ok: boolean }>(`/api/admin/support/versions/${versionId}/publish`, {
      method: "POST",
    }),
  archiveQuestionSetVersion: (versionId: string) =>
    mutatingCall<{ ok: boolean }>(`/api/admin/support/versions/${versionId}/archive`, {
      method: "POST",
    }),
  upsertSupportMapping: (storeId: string, input: PlatformSupportMappingUpsertRequest) =>
    mutatingCall<{ ok: boolean }>(`/api/admin/support/mappings/${storeId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteSupportMapping: (
    storeId: string,
    input: Omit<PlatformSupportMappingUpsertRequest, "questionSetId">,
  ) =>
    mutatingCall<{ ok: boolean }>(`/api/admin/support/mappings/${storeId}`, {
      method: "DELETE",
      body: JSON.stringify(input),
    }),
  upsertSupportTopicDefault: (input: PlatformSupportTopicDefaultUpsertRequest) =>
    mutatingCall<{ ok: boolean }>("/api/admin/support/topic-defaults", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  searchStoreProducts: (storeId: string, search: string) =>
    call<AdminProductSelectorResponse>(
      `/api/admin/support/stores/${storeId}/products?search=${encodeURIComponent(search)}`,
    ),
  searchStoreCategories: (storeId: string, search: string) =>
    call<AdminCategorySelectorResponse>(
      `/api/admin/support/stores/${storeId}/categories?search=${encodeURIComponent(search)}`,
    ),

  // TODO-178 — Mağaza Talepleri (Store→Platform request inbox). Server-side query/pagination.
  listPlatformRequests: (query?: PlatformRequestInboxQuery) =>
    call<PlatformRequestListResponse>(`/api/admin/platform-requests${toQueryString(query as Record<string, string | number | undefined> | undefined)}`),
  listAssignablePlatformUsers: (query?: PlatformUserDirectoryQuery) =>
    call<PlatformUserDirectoryResponse>(`/api/admin/platform-users${toQueryString(query as Record<string, string | number | undefined> | undefined)}`),
  getPlatformRequest: (id: string) =>
    call<PlatformRequestDetailResponse>(`/api/admin/platform-requests/${id}`),
  assignPlatformRequest: (id: string, input: PlatformRequestAssignRequest) =>
    mutatingCall<PlatformRequestDetailResponse>(`/api/admin/platform-requests/${id}/assign`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  setPlatformRequestPriority: (id: string, input: PlatformRequestPriorityRequest) =>
    mutatingCall<PlatformRequestDetailResponse>(`/api/admin/platform-requests/${id}/priority`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  setPlatformRequestStatus: (id: string, input: PlatformRequestStatusRequest) =>
    mutatingCall<PlatformRequestDetailResponse>(`/api/admin/platform-requests/${id}/status`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  recategorizePlatformRequest: (id: string, input: PlatformRequestRecategorizeRequest) =>
    mutatingCall<PlatformRequestDetailResponse>(`/api/admin/platform-requests/${id}/category`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  addPlatformRequestMessage: (id: string, input: PlatformRequestMessageCreateRequest) =>
    mutatingCall<PlatformRequestDetailResponse>(`/api/admin/platform-requests/${id}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  uploadPlatformRequestAttachment: (
    id: string,
    visibility: "STORE_VISIBLE" | "INTERNAL",
    file: File,
  ) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return mutatingCall<PlatformRequestAttachmentResponse>(
      `/api/admin/platform-requests/${id}/attachments?visibility=${visibility}`,
      { method: "POST", body: form },
    );
  },
  listPlatformRequestCategories: () =>
    call<PlatformRequestCategoryListResponse>("/api/admin/platform-request-categories"),

  // System health
  systemHealth: () => call<SystemHealth>("/api/system/health"),
  systemInternal: () => call<SystemInternal>("/api/system/internal"),
};
