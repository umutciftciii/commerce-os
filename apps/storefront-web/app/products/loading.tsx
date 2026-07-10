import { Container, Skeleton } from "@commerce-os/ui";
import { ProductCardSkeleton } from "../../components/ui";

/**
 * Liste sayfasi yuklenirken gosterilen premium iskelet (Adim 3). Canli katalog
 * sunucu tarafinda cozulurken bos beyaz ekran yerine editoryel yapinin (baslik +
 * arac cubugu + 4:5 kart grid) onizlemesi gosterilir.
 */
export default function ProductListingLoading() {
  return (
    <Container className="py-16 lg:py-20">
      <div className="max-w-2xl">
        <Skeleton className="h-2.5 w-24 rounded-none" />
        <Skeleton className="mt-3 h-8 w-56 rounded-none" />
        <Skeleton className="mt-3 h-4 w-72 rounded-none" />
      </div>
      <div className="mt-10 flex items-center justify-between border-b border-line pb-5 lg:mt-12">
        <Skeleton className="h-3 w-20 rounded-none" />
        <Skeleton className="h-10 w-40 rounded-none" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:mt-10 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-14">
        {Array.from({ length: 8 }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </Container>
  );
}
