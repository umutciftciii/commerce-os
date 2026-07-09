import {
  Badge,
  Button,
  ButtonLink,
  Container,
  Display,
  Eyebrow,
  Field,
  Heading,
  Input,
  Lead,
  Muted,
  ProductMedia,
  Section,
  Select,
  Subheading,
  Text,
  Textarea,
} from "../../components/ui";

/**
 * ADIM 1 — Design System onizleme route'u (izole). Token'lari ve premium vitrin
 * bilesenlerini tek sayfada gosterir; canli veriye bagimli DEGILDIR. Sadece
 * gorsel inceleme/onay icindir (production nav'ina eklenmez).
 */
export const dynamic = "force-static";

const SWATCHES: { name: string; varName: string; className: string; border?: boolean }[] = [
  { name: "paper", varName: "--paper", className: "bg-paper", border: true },
  { name: "surface", varName: "--surface", className: "bg-surface", border: true },
  { name: "surface-muted", varName: "--surface-muted", className: "bg-surface-muted" },
  { name: "ink", varName: "--ink", className: "bg-ink" },
  { name: "ink-muted", varName: "--ink-muted", className: "bg-ink-muted" },
  { name: "ink-subtle", varName: "--ink-subtle", className: "bg-ink-subtle" },
  { name: "line", varName: "--line", className: "bg-line" },
  { name: "line-strong", varName: "--line-strong", className: "bg-line-strong" },
  { name: "accent", varName: "--accent", className: "bg-accent" },
  { name: "accent-ink", varName: "--accent-ink", className: "bg-accent-ink" },
];

export default function DesignSystemPage() {
  return (
    <Container className="py-16">
      <div className="max-w-2xl space-y-3">
        <Eyebrow>Design System · Adım 1</Eyebrow>
        <Display>Vitrin tasarım dili</Display>
        <Lead>
          Tema-edilebilir token'lar (CSS custom property) ve premium/editoryel bileşen katmanı.
          Renk, tipografi ve bileşenler burada izole gösterilir.
        </Lead>
      </div>

      {/* Renk */}
      <Block title="Renk paleti" note="Tüm renkler var(--…) — [data-theme] ile override edilebilir.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {SWATCHES.map((sw) => (
            <div key={sw.name} className="space-y-2">
              <div
                className={`h-20 w-full rounded-sm ${sw.className} ${sw.border ? "border border-line" : ""}`}
              />
              <div>
                <p className="text-xs font-medium text-ink">{sw.name}</p>
                <Muted className="font-mono">{sw.varName}</Muted>
              </div>
            </div>
          ))}
        </div>
      </Block>

      {/* Tipografi */}
      <Block title="Tipografi" note="Serif (Playfair) başlık + Sans (Inter) gövde.">
        <div className="space-y-5">
          <Display>Display — büyük hero başlık</Display>
          <Heading>Heading — bölüm başlığı</Heading>
          <Subheading>Subheading — kart başlığı</Subheading>
          <Eyebrow>Eyebrow — bölüm üstü etiket</Eyebrow>
          <Lead>Lead — öne çıkan giriş paragrafı, biraz daha büyük ve rahat.</Lead>
          <Text>
            Text — gövde metni. Günlük yaşamın özenle üretilmiş parçaları; sade tipografi, bol
            beyaz alan ve disiplinli hizalama.
          </Text>
          <Muted>Muted — ikincil küçük metin.</Muted>
        </div>
      </Block>

      {/* Buton */}
      <Block
        title="Buton"
        note="Keskin köşe, geniş kerning. Accent YALNIZCA 'cta' (sayfa başına tek birincil eylem); diğerleri nötr ink."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="cta">Birincil CTA · accent</Button>
          <Button variant="primary">Primary · ink</Button>
          <Button variant="secondary">İkincil</Button>
          <Button variant="ghost">Ghost</Button>
          <ButtonLink href="/products" variant="link">
            Bağlantı
          </ButtonLink>
          <Button variant="primary" disabled>
            Pasif
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button size="sm">Küçük</Button>
          <Button size="md">Orta</Button>
          <Button size="lg">Büyük</Button>
        </div>
      </Block>

      {/* Rozet */}
      <Block title="Rozet / etiket" note="Nötr tonlar — rozet aksan taşımaz.">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="ink">İndirim</Badge>
          <Badge tone="outline">Yeni</Badge>
          <Badge tone="outline">Kuponlu</Badge>
          <Badge tone="muted">Son birkaç</Badge>
        </div>
      </Block>

      {/* Form */}
      <Block title="Form elemanları" note="Additive — checkout/auth mantığına dokunmaz.">
        <div className="grid max-w-xl gap-5 sm:grid-cols-2">
          <Field label="Ad Soyad" htmlFor="ds-name">
            <Input id="ds-name" placeholder="Örn. Ada Lovelace" />
          </Field>
          <Field label="Şehir" htmlFor="ds-city" hint="Teslimat için gerekli.">
            <Select id="ds-city" defaultValue="">
              <option value="" disabled>
                Seçiniz
              </option>
              <option>İstanbul</option>
              <option>Ankara</option>
              <option>İzmir</option>
            </Select>
          </Field>
          <Field label="Not" htmlFor="ds-note" className="sm:col-span-2">
            <Textarea id="ds-note" placeholder="Sipariş notu (opsiyonel)" />
          </Field>
        </div>
      </Block>

      {/* Medya */}
      <Block title="Ürün medyası (MOCK)" note="Görsel altyapısı yok — deterministik yer tutucu; bkz. todo.md (P0).">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {["demo-hoodie", "keten-gomlek", "deri-canta", "yun-atki"].map((handle) => (
            <div key={handle} className="aspect-[4/5] overflow-hidden border border-line bg-surface">
              <ProductMedia handle={handle} title={handle.replace("-", " ")} />
            </div>
          ))}
        </div>
      </Block>
    </Container>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Section spacing="sm" className="border-t border-line">
      <div className="mb-8">
        <Heading as="h2">{title}</Heading>
        {note ? <Muted className="mt-1">{note}</Muted> : null}
      </div>
      {children}
    </Section>
  );
}
