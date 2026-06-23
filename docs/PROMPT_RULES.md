# Prompt Rules

## AI Calisma Kurallari

- Her prompt, ilgili ise docs guncelleme zorunlulugu icerecek.
- Yeni teknik borc `docs/TECHNICAL_DEBT.md` dosyasina yazilacak.
- Yeni karar `docs/DECISIONS.md` dosyasina ADR olarak yazilacak.
- Yeni yapilacak is `docs/TODO.md` dosyasina yazilacak.
- Faz notu `docs/PHASE_LOG.md` dosyasina yazilacak.
- Secret, token, credential veya gercek musteri verisi dokumanlara yazilmayacak.
- Feature sisirmesi yapilmayacak; istenmeyen yeni ozellik eklenmeyecek.
- Test, lint, typecheck ve build sonuclari raporlanacak.
- Kod mimarisi veya runtime davranisi degistirildiginde ilgili mimari ve servis siniri dokumanlari
  ayni degisiklikte guncellenecek.
- Faz kapanisi, docs guncelligi dogrulanmadan tamamlanmis sayilmayacak.

## Design-First Kurali (Frontend/UI)

Yeni bir page, layout, dashboard, panel, shell veya onemli UI ekrani olustururken once kisa bir
"Claude Design Plan" cikarilir, sonra koda gecilir. Plan pratik ve uygulanabilir olur; uzun manifesto
olmaz. Kod, plan ile celismez.

Claude Design Plan icerigi:

- Sayfanin amaci
- Kullanici rolu
- Bilgi hiyerarsisi
- Layout yapisi
- Ana componentler
- Empty/loading/error state yaklasimi
- Responsive davranis
- Gorsel ton: acik, premium, sade, kurumsal SaaS

Kacinilacaklar: dark theme, neon/AI look, asiri gradient, gereksiz animasyon, dashboard kalabaligi.

Ek kurallar:

- Birden fazla page olusturulurken her page icin kisa design plan eklenir.
- Placeholder ekranlar bile gercek urun kalitesine yakin app shell hissi verir; "bos ekran" yapilmaz,
  her placeholder sayfada baglam, beklenen gelecek modul ve anlasilir empty state bulunur.
- Ortak component kullanilabilecek yerde tekrar eden markup yazilmaz; `packages/ui` primitive'leri
  tercih edilir.
- Light-first premium SaaS gorunumu korunur; ortak Tailwind preset kullanilir.
