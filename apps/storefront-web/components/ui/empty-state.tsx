import type { ReactNode } from "react";
import { cn } from "@commerce-os/ui";
import { Heading, Text } from "./typography";

/**
 * Vitrin editoryel bos durum (Adim 3). Paylasilan @commerce-os/ui `EmptyState`'ten
 * AYRI, vitrine-ozel premium dille: hairline cerceve, serif baslik, bol bosluk.
 * Hem "katalog bos / hata" (sayfa) hem "filtre sonucu bos" (PLP araci) icin.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center border border-line bg-surface px-6 py-20 text-center sm:py-28",
        className,
      )}
    >
      <Heading as="p" className="text-xl sm:text-2xl">
        {title}
      </Heading>
      {description ? <Text className="mt-2 max-w-md">{description}</Text> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
