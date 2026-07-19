import { Container, Skeleton } from "@commerce-os/ui";
import { ProductCardSkeleton } from "../../components/ui";
import { getStorefrontDict } from "../../lib/i18n";

/**
 * PLP/arama yüklenirken gösterilen premium iskelet (TODO-156B). SSR fetch çözülürken boş beyaz ekran yerine
 * editoryel yapının (başlık + araç çubuğu + 4:5 kart grid) önizlemesi. `aria-busy` + sr-only status ile ekran
 * okuyucuya bildirilir; iskelet kart ölçüsü gerçek kartla aynı (layout shift minimum). Tam ekran spinner YOK.
 */
export default async function ProductListingLoading() {
  const s = (await getStorefrontDict()).search;
  return (
    <Container className="py-16 lg:py-20" aria-busy="true">
      <span role="status" className="sr-only">
        {s.loadingLabel}
      </span>
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
