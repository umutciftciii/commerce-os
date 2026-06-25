import { Container, Skeleton } from "@commerce-os/ui";

/**
 * Liste sayfasi yuklenirken gosterilen premium iskelet. Canli katalog sunucu
 * tarafinda cozulurken kullaniciya bos beyaz ekran yerine yapinin onizlemesi
 * gosterilir.
 */
export default function ProductListingLoading() {
  return (
    <Container className="py-12">
      <div className="mb-8 border-b border-slate-200 pb-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-5 sm:gap-6 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-slate-200">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
