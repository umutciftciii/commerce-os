import { test as base, expect } from "@playwright/test";
import { Api } from "./api";
import { ids } from "./ids";

export const test = base.extend<{ api: Api }>({
  api: async ({}, use) => {
    const api = await Api.create();
    await use(api);
    await api.dispose();
  },
});
export { expect, ids };
