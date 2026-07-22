/**
 * TODO-159B (ADR-090) — Aranabilir seçici testleri için paylaşılan yardımcılar.
 *
 * Seçim artık işaretli-kutu listesinden değil, sunucu-taraflı arayan bir modaldan
 * yapılır. Testlerin DOĞRULADIĞI DAVRANIŞ değişmedi (ana kategori kuralları,
 * submit payload'ı…); yalnız etkileşim yolu değişti — bu dosya o yolu tek yerde
 * toplar ki her test kendi modal senaryosunu yeniden yazmasın.
 */

import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

export interface FakeCategory {
  id: string;
  name: string;
  slug?: string;
  parentId?: string | null;
  status?: "ACTIVE" | "ARCHIVED";
  /** Kökten kendisine ad zinciri; verilmezse [name]. */
  path?: string[];
}

/**
 * `storeApi.listCategorySelector` sahtesi. Gerçek ucun iki modunu da taklit eder:
 * `ids` verilirse ÇÖZÜM modu (arama/sayfalama yok), aksi halde arama + sayfalama.
 */
export function makeCategorySelectorFake(categories: FakeCategory[]) {
  const toOption = (category: FakeCategory) => ({
    id: category.id,
    name: category.name,
    slug: category.slug ?? category.id,
    status: category.status ?? "ACTIVE",
    parentId: category.parentId ?? null,
    path: category.path ?? [category.name],
  });

  return async (query?: Record<string, string | number | undefined>) => {
    const rawIds = query?.ids;
    if (typeof rawIds === "string") {
      const ids = rawIds.split(",").filter(Boolean);
      const data = ids
        .map((id) => categories.find((category) => category.id === id))
        .filter((category): category is FakeCategory => category !== undefined)
        .map(toOption);
      return {
        data,
        pagination: {
          limit: Math.max(1, data.length),
          offset: 0,
          total: data.length,
          page: 1,
          pageSize: Math.max(1, data.length),
          totalItems: data.length,
          totalPages: data.length === 0 ? 0 : 1,
        },
      };
    }
    const search = typeof query?.search === "string" ? query.search.toLowerCase() : "";
    const matched = categories.filter(
      (category) => !search || category.name.toLowerCase().includes(search),
    );
    const pageSize = Number(query?.pageSize ?? 25);
    const page = Number(query?.page ?? 1);
    const slice = matched.slice((page - 1) * pageSize, page * pageSize);
    return {
      data: slice.map(toOption),
      pagination: {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        total: matched.length,
        page,
        pageSize,
        totalItems: matched.length,
        totalPages: matched.length === 0 ? 0 : Math.ceil(matched.length / pageSize),
      },
    };
  };
}

/** `storeApi.listProductSelector` sahtesi (aynı iki modlu sözleşme). */
export function makeProductSelectorFake(
  products: { id: string; title: string; slug?: string; status?: "DRAFT" | "ACTIVE" | "ARCHIVED" }[],
) {
  const toOption = (product: (typeof products)[number]) => ({
    id: product.id,
    title: product.title,
    slug: product.slug ?? product.id,
    status: product.status ?? "ACTIVE",
    sku: null,
    imageUrl: null,
    priceMinor: null,
    currency: null,
    stockAvailable: null,
    variantCount: 1,
  });

  return async (query?: Record<string, string | number | undefined>) => {
    const rawIds = query?.ids;
    if (typeof rawIds === "string") {
      const ids = rawIds.split(",").filter(Boolean);
      const data = ids
        .map((id) => products.find((product) => product.id === id))
        .filter((product): product is (typeof products)[number] => product !== undefined)
        .map(toOption);
      return {
        data,
        pagination: {
          limit: Math.max(1, data.length),
          offset: 0,
          total: data.length,
          page: 1,
          pageSize: Math.max(1, data.length),
          totalItems: data.length,
          totalPages: data.length === 0 ? 0 : 1,
        },
      };
    }
    const search = typeof query?.search === "string" ? query.search.toLowerCase() : "";
    const matched = products.filter(
      (product) => !search || product.title.toLowerCase().includes(search),
    );
    const pageSize = Number(query?.pageSize ?? 25);
    const page = Number(query?.page ?? 1);
    const slice = matched.slice((page - 1) * pageSize, page * pageSize);
    return {
      data: slice.map(toOption),
      pagination: {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        total: matched.length,
        page,
        pageSize,
        totalItems: matched.length,
        totalPages: matched.length === 0 ? 0 : Math.ceil(matched.length / pageSize),
      },
    };
  };
}

/** Seçici modalını açar (alanın "Select" düğmesi). */
export async function openSelector(user: UserEvent, index = 0): Promise<void> {
  const buttons = screen.getAllByRole("button", { name: "Select" });
  await user.click(buttons[index]!);
}

/** Modaldaki bir seçeneği tıklar (seçer / seçimi kaldırır). */
export async function toggleOption(user: UserEvent, label: string | RegExp): Promise<void> {
  const dialog = await screen.findByRole("dialog");
  const option = await within(dialog).findByRole("option", { name: label });
  await user.click(option);
}

/** Modalı kapatır ("Done"). */
export async function closeSelector(user: UserEvent): Promise<void> {
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Done" }));
}

/** Aç → seç → kapat (en sık kullanılan akış). */
export async function pickInSelector(
  user: UserEvent,
  label: string | RegExp,
  index = 0,
): Promise<void> {
  await openSelector(user, index);
  await toggleOption(user, label);
  await closeSelector(user);
}
