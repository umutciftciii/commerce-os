import type { AdminDictionary } from "../tr/admin";

/** Platform admin console (admin-web) — English mirror of the TR source. */
export const enAdmin: AdminDictionary = {
  meta: {
    title: "commerce-os · Platform Admin",
    description: "Central administration console for the commerce-os multi-tenant SaaS platform.",
  },
  shell: {
    brandName: "commerce-os",
    brandSubtitle: "Platform Admin",
    topbarTitle: "Platform console",
    userName: "Super Admin",
    userRole: "Platform administrator",
  },
  nav: {
    heading: "Management",
    dashboard: "Platform Overview",
    stores: "Stores",
    plans: "Plans",
    systemHealth: "System Health",
    settings: "Settings",
  },
  dashboard: {
    eyebrow: "Platform",
    title: "Platform Overview",
    description: "Central management for stores, plans and system status.",
    exportReport: "Export report",
    stats: {
      activeStores: "Active stores",
      activeStoresHint: "Provisioning lands in Phase 2",
      plans: "Plans",
      plansHint: "Billing to be wired",
      mrr: "Monthly recurring revenue",
      mrrHint: "Analytics in progress",
      systemStatus: "System status",
    },
    storesCard: {
      title: "Stores",
      description: "Tenant stores onboarded to the platform",
      emptyTag: "Phase 1",
      emptyTitle: "No stores yet",
      emptyDescription:
        "Onboarded tenant stores will be listed here with their plan and status. Store management connects to the live API in Phase 1.",
      emptyAction: "Go to stores",
    },
    plansCard: {
      title: "Plans",
      description: "Subscription plans offered to tenants",
      emptyTag: "Phase 1",
      emptyTitle: "No plans defined yet",
      emptyDescription:
        "Subscription plans and usage limits are managed here; definable once billing is connected.",
    },
    healthCard: {
      title: "System Health",
      description: "Gateway, worker, database and cache",
      emptyTag: "Phase 1",
      emptyTitle: "Live checks pending",
      emptyDescription:
        "Health of the API Gateway, Worker, PostgreSQL and Redis will be summarised here.",
      emptyAction: "Open system health",
    },
  },
  stores: {
    eyebrow: "Platform",
    title: "Stores",
    description: "Provision, suspend and inspect every tenant store on the platform.",
    newStore: "New store",
    cardTitle: "All stores",
    cardDescription: "Tenant directory",
    emptyTag: "Phase 1",
    emptyTitle: "No stores yet",
    emptyDescription:
      "Store provisioning, plan assignment and tenant lifecycle controls will live here. Store management connects to the live API in Phase 1.",
    emptyAction: "Create the first store",
  },
  plans: {
    eyebrow: "Platform",
    title: "Plans",
    description: "Subscription tiers, usage limits and pricing offered to tenants.",
    newPlan: "New plan",
    cardTitle: "Subscription plans",
    cardDescription: "Plans and limits",
    emptyTag: "Phase 1",
    emptyTitle: "No plans defined yet",
    emptyDescription:
      "Subscription plans and usage limits are managed here. Once the billing module is connected, tiers, entitlements and pricing become definable.",
    emptyAction: "Define a plan",
  },
  systemHealth: {
    eyebrow: "Operations",
    title: "System Health",
    description: "Live status of the platform runtime components.",
    breadcrumb: "Platform · Operations",
    cardTitle: "Runtime components",
    cardDescriptionPrefix: "Health checks will call the gateway at:",
    components: [
      { name: "API Gateway", detail: "Fastify HTTP gateway" },
      { name: "Worker", detail: "BullMQ background jobs" },
      { name: "PostgreSQL", detail: "Primary database" },
      { name: "Redis", detail: "Queue and cache" },
    ],
    emptyTag: "Phase 1",
    emptyTitle: "Live checks not wired yet",
    emptyDescription:
      "This page will monitor API Gateway, Worker, PostgreSQL and Redis; it will poll the gateway's internal health endpoints (DB and Redis) and show worker queue depth. The API client placeholder resolves the gateway URL from API_GATEWAY_URL.",
  },
  settings: {
    eyebrow: "Platform",
    title: "Settings",
    description: "Platform-wide security, limit and operations settings will be gathered here.",
    cardTitle: "General",
    cardDescription: "Platform identity (read-only placeholder)",
    platformName: "Platform name",
    supportEmail: "Support email",
    note: "Editable platform settings and persistence will be wired in a later phase.",
  },
};
