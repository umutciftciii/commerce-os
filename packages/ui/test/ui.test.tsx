import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, Button, EmptyState, SidebarNav, StatCard } from "../src/index";

describe("ui primitives", () => {
  it("renders a primary button with its label and brand styling", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toContain("Save");
    expect(html).toContain("bg-brand-600");
  });

  it("renders an empty state with title and description", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No stores yet" description="Stores will appear here." />,
    );
    expect(html).toContain("No stores yet");
    expect(html).toContain("Stores will appear here.");
  });

  it("marks the active nav item with aria-current", () => {
    const html = renderToStaticMarkup(
      <SidebarNav
        items={[
          { href: "/", label: "Dashboard", active: true },
          { href: "/stores", label: "Stores" },
        ]}
      />,
    );
    expect(html).toContain('aria-current="page"');
  });

  it("renders a stat card label and value", () => {
    const html = renderToStaticMarkup(<StatCard label="Stores" value="—" />);
    expect(html).toContain("Stores");
  });

  it("renders a toned badge", () => {
    const html = renderToStaticMarkup(<Badge tone="success">Active</Badge>);
    expect(html).toContain("Active");
    expect(html).toContain("emerald");
  });
});
