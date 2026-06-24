import type { CommonDictionary } from "../tr/common";

/** Shared visible copy — English mirror of the TR source (key parity enforced). */
export const enCommon: CommonDictionary = {
  badges: {
    foundation: "Foundation",
  },
  footer: "UI foundation · placeholder data",
  actions: {
    save: "Save",
    export: "Export",
    manage: "Manage",
    view: "View",
    viewAll: "View all",
    connect: "Connect",
    preview: "Preview",
    customize: "Customise",
    cancel: "Cancel",
    create: "Create",
    update: "Update",
    edit: "Edit",
    retry: "Try again",
    refresh: "Refresh",
    logout: "Sign out",
    signIn: "Sign in",
    dismiss: "Dismiss",
  },
  states: {
    loading: "Loading…",
    saving: "Saving…",
    loadErrorTitle: "Couldn’t load data",
    loadErrorBody: "Something went wrong while fetching content. Please try again.",
  },
  status: {
    live: "Live",
    healthy: "Healthy",
    pending: "Pending",
    idle: "Idle",
    notConnected: "Not connected",
    notWired: "Not wired",
    active: "Active",
    ok: "Operational",
    degraded: "Degraded",
    unknown: "Unknown",
  },
  language: {
    ariaLabel: "Interface language",
    turkish: "Turkish",
    english: "English",
  },
};
