/**
 * TODO-156D (brief §15/§16) — Erişilebilir görünür breadcrumb. Trail lib/seo/breadcrumb'dan (JSON-LD ile
 * TEK KAYNAK). Semantik: `nav[aria-label]` > `ol` > `li`; ara düğümler `<Link>`, geçerli sayfa (path=null)
 * link DEĞİL + `aria-current="page"`. Ayraç `/` yalnız görsel (`aria-hidden`) → ekran okuyucu temiz okur.
 */
import Link from "next/link";
import type { BreadcrumbItem } from "../../lib/seo/breadcrumb";

export function Breadcrumb({
  items,
  label,
  className,
}: {
  items: readonly BreadcrumbItem[];
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={className ?? "text-[11px] uppercase tracking-wideish text-ink-subtle"}
    >
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {item.path ? (
                <Link href={item.path} className="transition-colors hover:text-ink">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-ink">
                  {item.label}
                </span>
              )}
              {!isLast ? (
                <span aria-hidden className="text-line-strong">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
