import { request, type APIRequestContext } from "@playwright/test";
import { GATEWAY_URL } from "./env";
import { ids } from "./ids";

export class Api {
  constructor(private ctx: APIRequestContext) {}
  static async create() {
    return new Api(await request.newContext({ baseURL: GATEWAY_URL }));
  }
  async storeInfo() {
    const r = await this.ctx.get(`/public/stores/${ids.storeSlug}/store-info`);
    if (!r.ok()) throw new Error(`storeInfo ${r.status()}`);
    return r.json();
  }
  async productBySlug(slug: string) {
    const r = await this.ctx.get(`/public/stores/${ids.storeSlug}/products/${slug}`);
    if (!r.ok()) throw new Error(`product ${slug} ${r.status()}`);
    return r.json();
  }
  async dispose() {
    await this.ctx.dispose();
  }
}
