import { Skeleton } from "@commerce-os/ui";

/**
 * PLP urun karti iskeleti (Adim 3). Gercek kartin yerlesimini (4:5 gorsel + sade
 * bilgi bloklari) aynalar; keskin kose + hairline cerceve (editoryel dil). Canli
 * katalog sunucuda cozulurken bos ekran yerine yapinin onizlemesini gosterir.
 */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="aspect-[4/5] w-full rounded-none border border-line" />
      <div className="flex flex-col gap-2 pt-4">
        <Skeleton className="h-2.5 w-16 rounded-none" />
        <Skeleton className="h-3.5 w-full rounded-none" />
        <Skeleton className="h-3.5 w-2/3 rounded-none" />
        <Skeleton className="mt-1 h-3.5 w-20 rounded-none" />
      </div>
    </div>
  );
}
