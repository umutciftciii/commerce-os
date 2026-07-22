// @vitest-environment jsdom
/**
 * TODO-159B (ADR-090) — Ortak aranabilir seçici bileşen testleri.
 *
 * Kanıtlananlar: debounce'lu sunucu araması, sonraki sayfa, yükleme / boş /
 * filtreli-boş / hata+yeniden dene, tekli ve çoklu seçim, seçim kaldırma,
 * SEÇİLİ KAYDIN ARAMA SONUCU DIŞINDA DA KORUNMASI (TD-093'ün özü), modal
 * yeniden açıldığında seçimlerin görünmesi, 100. kaydın ötesindeki kaydın
 * seçilebilmesi, klavye navigasyonu ve Escape/odak davranışı.
 */

import React, { useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@commerce-os/ui";
import { EntitySelectorField } from "../components/selector";
import type { SelectorPresenter, SelectorSource } from "../components/selector";
import { buildSelectorLabels } from "../components/selector";
import { getDictionary } from "@commerce-os/i18n";

interface Row {
  id: string;
  title: string;
}

/** 120 kayıtlık katalog: "ilk sayfada olmayan kayıt" senaryosunu mümkün kılar. */
const CATALOG: Row[] = Array.from({ length: 120 }, (_, index) => ({
  id: `p${index + 1}`,
  title: `Ürün ${index + 1}`,
}));

function makeSource(overrides?: Partial<SelectorSource<Row>>): SelectorSource<Row> {
  return {
    keyOf: (row) => row.id,
    fetchPage: vi.fn(async ({ search, page, pageSize }) => {
      const matched = search
        ? CATALOG.filter((row) => row.title.toLowerCase().includes(search.toLowerCase()))
        : CATALOG;
      return {
        data: matched.slice((page - 1) * pageSize, page * pageSize),
        pagination: {
          page,
          pageSize,
          totalItems: matched.length,
          totalPages: matched.length === 0 ? 0 : Math.ceil(matched.length / pageSize),
        },
      };
    }),
    resolveByIds: vi.fn(async (ids: string[]) => CATALOG.filter((row) => ids.includes(row.id))),
    ...overrides,
  };
}

const presenter: SelectorPresenter<Row> = {
  primaryText: (row) => row.title,
};

function Harness({
  source,
  multiple = true,
  initial = [],
}: {
  source: SelectorSource<Row>;
  multiple?: boolean;
  initial?: string[];
}) {
  const [value, setValue] = useState<string[]>(initial);
  const dict = getDictionary("en").storeAdmin;
  return (
    <LocaleProvider locale="en">
      <EntitySelectorField
        label="Products"
        multiple={multiple}
        value={value}
        onChange={setValue}
        source={source}
        presenter={presenter}
        labels={buildSelectorLabels(dict, {
          searchPlaceholder: "Search products",
          listLabel: "Products",
        })}
        toMessage={(error) => (error instanceof Error ? error.message : "error")}
        modalTitle="Select product"
      />
    </LocaleProvider>
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Select" }));

const dialog = () => screen.findByRole("dialog");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EntitySelectorField — arama ve sayfalama", () => {
  it("modal kapalıyken sunucuya HİÇ istek atılmaz", () => {
    const source = makeSource();
    render(<Harness source={source} />);
    expect(source.fetchPage).not.toHaveBeenCalled();
  });

  it("açılışta ilk sayfayı yükler ve toplam kaydı gösterir", async () => {
    const user = userEvent.setup();
    render(<Harness source={makeSource()} />);
    await open(user);

    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByText("Ürün 1")).toBeTruthy());
    expect(within(modal).getByText("1–25 of 120")).toBeTruthy();
  });

  it("arama DEBOUNCE edilir: her tuş vuruşunda istek atılmaz", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    render(<Harness source={source} />);
    await open(user);
    await waitFor(() => expect(source.fetchPage).toHaveBeenCalledTimes(1));

    const modal = await dialog();
    await user.type(within(modal).getByRole("combobox", { name: "Search" }), "Ürün 119");

    // 8 tuş vuruşu → tek ek istek (debounce sonrası).
    await waitFor(() => expect(source.fetchPage).toHaveBeenCalledTimes(2));
    expect(source.fetchPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "Ürün 119", page: 1 }),
    );
  });

  it("sonraki sayfaya geçer ve sunucudan yeni dilimi ister", async () => {
    const user = userEvent.setup();
    const source = makeSource();
    render(<Harness source={source} />);
    await open(user);

    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByText("Ürün 1")).toBeTruthy());
    await user.click(within(modal).getByRole("button", { name: "Next" }));

    await waitFor(() => expect(within(modal).getByText("Ürün 26")).toBeTruthy());
    expect(source.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("yükleme durumunu duyurur", async () => {
    const user = userEvent.setup();
    const source = makeSource({
      // Hiç çözülmeyen promise: yükleme durumu ekranda kalır.
      fetchPage: vi.fn(() => new Promise<never>(() => {})),
    });
    render(<Harness source={source} />);
    await open(user);

    const modal = await dialog();
    expect(within(modal).getByRole("status", { name: "Loading records…" })).toBeTruthy();
  });

  it("hiç kayıt yokken BOŞ, arama sonuç vermezken FİLTRELİ-BOŞ metni gösterilir", async () => {
    const user = userEvent.setup();
    const source = makeSource({
      fetchPage: vi.fn(async ({ search }) => ({
        data: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
        ...(search ? {} : {}),
      })),
    });
    render(<Harness source={source} />);
    await open(user);

    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByText("No records found")).toBeTruthy());

    await user.type(within(modal).getByRole("combobox", { name: "Search" }), "zzz");
    await waitFor(() => expect(within(modal).getByText("No matching records")).toBeTruthy());
  });

  it("hata durumunda mesaj + 'Try again' gösterilir ve yeniden dene isteği tekrarlar", async () => {
    const user = userEvent.setup();
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({
        data: [CATALOG[0]!],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      });
    render(<Harness source={makeSource({ fetchPage })} />);
    await open(user);

    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByText("boom")).toBeTruthy());

    await user.click(within(modal).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(within(modal).getByText("Ürün 1")).toBeTruthy());
  });
});

describe("EntitySelectorField — seçim", () => {
  it("çoklu seçim: birden fazla kayıt seçilir ve çipler alanda görünür", async () => {
    const user = userEvent.setup();
    render(<Harness source={makeSource()} />);
    await open(user);

    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByText("Ürün 1")).toBeTruthy());
    await user.click(within(modal).getByRole("option", { name: /Ürün 1$/ }));
    await user.click(within(modal).getByRole("option", { name: /Ürün 2$/ }));
    await user.click(within(modal).getByRole("button", { name: "Done" }));

    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Ürün 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Ürün 2" })).toBeTruthy();
  });

  it("tekli seçim: ikinci seçim öncekinin YERİNE geçer", async () => {
    const user = userEvent.setup();
    render(<Harness source={makeSource()} multiple={false} />);
    await open(user);

    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByText("Ürün 1")).toBeTruthy());
    await user.click(within(modal).getByRole("option", { name: /Ürün 1$/ }));
    await user.click(within(modal).getByRole("option", { name: /Ürün 2$/ }));
    await user.click(within(modal).getByRole("button", { name: "Done" }));

    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Ürün 2" })).toBeTruthy();
  });

  it("seçim kaldırma: çipteki ✕ değeri düşürür", async () => {
    const user = userEvent.setup();
    render(<Harness source={makeSource()} initial={["p1"]} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Ürün 1" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Remove Ürün 1" }));

    expect(screen.getByText("0 selected")).toBeTruthy();
    expect(screen.getByText("Nothing selected yet.")).toBeTruthy();
  });

  it("100. kaydın ÖTESİNDEKİ seçili kayıt, arama sonucunda olmasa bile gösterilir (TD-093)", async () => {
    const source = makeSource();
    render(<Harness source={source} initial={["p119"]} />);

    // Katalog sayfası HİÇ çekilmeden, yalnız `ids` çözümüyle gelir.
    await waitFor(() => expect(screen.getByText("Ürün 119")).toBeTruthy());
    expect(source.resolveByIds).toHaveBeenCalledWith(["p119"]);
    expect(source.fetchPage).not.toHaveBeenCalled();
  });

  it("100. kaydın ötesindeki kayıt aranıp SEÇİLEBİLİR", async () => {
    const user = userEvent.setup();
    render(<Harness source={makeSource()} />);
    await open(user);

    const modal = await dialog();
    await user.type(within(modal).getByRole("combobox", { name: "Search" }), "Ürün 119");
    await waitFor(() => expect(within(modal).getByText("Ürün 119")).toBeTruthy());
    await user.click(within(modal).getByRole("option", { name: /Ürün 119/ }));
    await user.click(within(modal).getByRole("button", { name: "Done" }));

    expect(screen.getByRole("button", { name: "Remove Ürün 119" })).toBeTruthy();
  });

  it("modal yeniden açıldığında seçimler işaretli gelir", async () => {
    const user = userEvent.setup();
    render(<Harness source={makeSource()} initial={["p1"]} />);
    await open(user);

    let modal = await dialog();
    await waitFor(() =>
      expect(within(modal).getByRole("option", { name: /Ürün 1$/ })).toHaveProperty(
        "ariaSelected",
        "true",
      ),
    );
    await user.click(within(modal).getByRole("button", { name: "Done" }));

    await open(user);
    modal = await dialog();
    await waitFor(() =>
      expect(within(modal).getByRole("option", { name: /Ürün 1$/ })).toHaveProperty(
        "ariaSelected",
        "true",
      ),
    );
  });

  it("çözülemeyen seçili id sessizce yutulmaz, kullanıcıya bildirilir", async () => {
    const user = userEvent.setup();
    render(<Harness source={makeSource()} initial={["silinmis"]} />);
    await waitFor(() =>
      expect(
        screen.getByText("1 selected records could not be found (they may have been deleted)."),
      ).toBeTruthy(),
    );
    // Kullanıcı yine de seçimi temizleyebilir.
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByText("0 selected")).toBeTruthy();
  });
});

describe("EntitySelectorField — erişilebilirlik", () => {
  it("arama kutusu combobox'tır ve açılışta ODAKLANIR", async () => {
    const user = userEvent.setup();
    render(<Harness source={makeSource()} />);
    await open(user);

    const modal = await dialog();
    const input = within(modal).getByRole("combobox", { name: "Search" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.getAttribute("aria-controls")).toBeTruthy();
  });

  it("klavye: ArrowDown imleci ilerletir, Enter seçer", async () => {
    const user = userEvent.setup();
    render(<Harness source={makeSource()} />);
    await open(user);

    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByText("Ürün 1")).toBeTruthy());
    const input = within(modal).getByRole("combobox", { name: "Search" });
    await waitFor(() => expect(document.activeElement).toBe(input));

    // İlk satır etkin; bir aşağı → ikinci satır.
    await user.keyboard("{ArrowDown}");
    const second = within(modal).getByRole("option", { name: /Ürün 2$/ });
    await waitFor(() => expect(input.getAttribute("aria-activedescendant")).toBe(second.id));

    await user.keyboard("{Enter}");
    await waitFor(() => expect(second.getAttribute("aria-selected")).toBe("true"));

    // Yukarı → ilk satır; Enter onu da seçer (çoklu mod).
    await user.keyboard("{ArrowUp}{Enter}");
    await waitFor(() =>
      expect(
        within(modal).getByRole("option", { name: /Ürün 1$/ }).getAttribute("aria-selected"),
      ).toBe("true"),
    );
  });

  it("Escape modalı kapatır; seçim korunur", async () => {
    const user = userEvent.setup();
    render(<Harness source={makeSource()} />);
    await open(user);

    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByText("Ürün 1")).toBeTruthy());
    await user.click(within(modal).getByRole("option", { name: /Ürün 1$/ }));
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Remove Ürün 1" })).toBeTruthy();
  });
});
