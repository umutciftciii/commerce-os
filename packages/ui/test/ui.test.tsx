import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AppShell,
  Badge,
  Button,
  EmptyState,
  Modal,
  SidebarNav,
  StatCard,
  Topbar,
  UserChip,
} from "../src/index";

describe("ui primitives", () => {
  it("renders a primary button with its label and brand styling", () => {
    const html = renderToStaticMarkup(<Button>Kaydet</Button>);
    expect(html).toContain("Kaydet");
    expect(html).toContain("bg-brand-600");
  });

  it("renders an empty state with title, description and phase tag", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        tag="Faz 1"
        title="Henüz mağaza yok"
        description="Mağazalar burada listelenecek."
      />,
    );
    expect(html).toContain("Henüz mağaza yok");
    expect(html).toContain("Mağazalar burada listelenecek.");
    expect(html).toContain("Faz 1");
  });

  it("marks the active nav item with aria-current and renders a section heading", () => {
    const html = renderToStaticMarkup(
      <SidebarNav
        heading="Yönetim"
        items={[
          { href: "/", label: "Platform Özeti", active: true },
          { href: "/stores", label: "Mağazalar" },
        ]}
      />,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Yönetim");
    expect(html).toContain("Mağazalar");
  });

  it("renders a stat card label and value", () => {
    const html = renderToStaticMarkup(<StatCard label="Mağazalar" value="—" />);
    expect(html).toContain("Mağazalar");
  });

  it("renders a toned badge with an optional status dot", () => {
    const html = renderToStaticMarkup(
      <Badge tone="success" dot>
        Canlı
      </Badge>,
    );
    expect(html).toContain("Canlı");
    expect(html).toContain("emerald");
  });

  it("renders a localized user chip with name and role", () => {
    const html = renderToStaticMarkup(
      <UserChip name="Süper Yönetici" role="Platform yöneticisi" />,
    );
    expect(html).toContain("Süper Yönetici");
    expect(html).toContain("Platform yöneticisi");
    // İlk harf rozeti
    expect(html).toContain(">S<");
  });
});

describe("modal · viewport-constrained scroll layout", () => {
  it("renders a flex-column panel that stays within the viewport", () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={() => {}} title="Ürünü düzenle" closeLabel="Vazgeç">
        <p>Form içeriği</p>
      </Modal>,
    );
    // Panel viewport yuksekligine gore sinirli ve dikey flex kolon olmali.
    expect(html).toContain("max-h-[calc(100vh-2rem)]");
    expect(html).toContain("flex-col");
  });

  it("makes the body scrollable so long forms and the footer stay reachable", () => {
    const html = renderToStaticMarkup(
      <Modal
        open
        onClose={() => {}}
        title="Ürünü düzenle"
        closeLabel="Vazgeç"
        footer={<Button>Kaydet</Button>}
      >
        <p>Uzun form içeriği</p>
      </Modal>,
    );
    // Govde kendi icinde kayar; footer aksiyonlari erisilebilir kalir.
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("Kaydet");
    expect(html).toContain("Uzun form içeriği");
  });
});

describe("app shell · visible turkish labels", () => {
  it("renders brand, topbar and footer with Turkish shell copy", () => {
    const html = renderToStaticMarkup(
      <AppShell
        brand={{ name: "commerce-os", subtitle: "Platform Yönetimi" }}
        nav={<SidebarNav heading="Yönetim" items={[{ href: "/", label: "Platform Özeti" }]} />}
        topbar={
          <Topbar title="Platform konsolu">
            <Badge tone="info">Altyapı</Badge>
            <UserChip name="Süper Yönetici" role="Platform yöneticisi" />
          </Topbar>
        }
        footer={<span>Altyapı sürümü · örnek veriler</span>}
      >
        <p>içerik</p>
      </AppShell>,
    );

    // Görünür kabuk etiketleri Türkçe olmalı; İngilizce sızıntı olmamalı.
    expect(html).toContain("Platform Yönetimi");
    expect(html).toContain("Platform konsolu");
    expect(html).toContain("Altyapı");
    expect(html).toContain("Platform Özeti");
    expect(html).toContain("Altyapı sürümü · örnek veriler");
    expect(html).not.toContain("Foundation");
    expect(html).not.toContain("placeholder data");
  });
});
