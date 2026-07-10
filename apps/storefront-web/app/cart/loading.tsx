import { Skeleton } from "@commerce-os/ui";
import { Container } from "../../components/ui";

/**
 * Sepet sayfasi yuklenirken gosterilen premium iskelet (PLP loading.tsx dili).
 * Sepet `force-dynamic` sunucu-otoriter cozulurken (fiyat/stok/kargo gateway'de)
 * bos beyaz ekran yerine iki-kolon yapinin (kupon + satirlar / ozet) onizlemesi
 * gosterilir. Skeleton pulse notrdur; keskin koseler (rounded-none) DS ile hizali.
 */
export default function CartLoading() {
  return (
    <Container className="py-12">
      <Skeleton className="h-8 w-40 rounded-none" />
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* Kuponlar alani */}
          <Skeleton className="h-28 w-full rounded-none" />
          {/* Sepet satirlari */}
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-none" />
          ))}
        </div>
        {/* Ozet karti */}
        <Skeleton className="h-80 w-full rounded-none" />
      </div>
    </Container>
  );
}
