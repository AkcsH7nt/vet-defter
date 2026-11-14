# Vet Defter

Saha veterinerleri için (sığır) çevrimdışı çalışan bir cep defteri: belirtiler → hastalık eşleşme yüzdesi →
tedavi protokolü → etken madde → ruhsatlı Türk ürünleri. Düz HTML + ES modülleri, derleme yok, harici CDN yok.

**Hekim kararının yerine geçmez.** Uygulama yalnızca bilgi ve hatırlatma amaçlıdır; tanı ve tedavi kararı
hekime aittir.

Yayın adresi: https://akcsh7nt.github.io/vet-defter/ (yayınlanacak)

## Akış

1. **Tanı**: gözlenen belirtiler seçilir (isteğe bağlı ateş vb.).
2. **Sonuçlar**: hastalıklar eşleşme yüzdesiyle sıralanır; kırmızı bayraklar (ihbarı zorunlu hastalık, zoonoz, acil durum) üstte uyarılır.
3. **Hastalık**: ayırıcı tanı, protokol, ihbar ve koruma notları.
4. **Etken madde**: nasıl çalışır, AMEG uyarıları, bu etkeni içeren ruhsatlı ürünler.
5. **Hastalıklar / İlaçlar**: A-Z listeler ve arama. **Hakkında**: sürüm, liste tarihi, uyarılar.

## Tıbbi içerik durumu: TASLAK

Tüm tıbbi içerik, hekim onaylayana kadar **TASLAK**tır ve ekranda öyle etiketlenir. Doz (mg/kg) ve arınma
süreleri, hastalık onaylanıp ilgili KÜB bilgisi doğrulanmadan **gizli** tutulur. Son tıbbi onay hekimdedir.

## Veri kaynakları

- Ürün listesi: T.C. Tarım ve Orman Bakanlığı ruhsatlı veteriner ilaçları sorgusu. Liste tarihi
  `veri/meta.json` içindeki `urunListesiTarihi` alanındadır ve Hakkında ekranında görünür.
- Belirti, hastalık ve etken içeriği `veri/` altındaki JSON dosyalarındadır (şema: `veri/sema/`).

## Çalıştırma

```
npm install
npm run sunucu        # http://localhost:5180
```

## Testler

```
npm test              # birim testleri (test/*.test.js)
npm run dogrula       # veri/ doğrulaması (spec §8 kuralları); başka kök: node scripts/dogrula.mjs test/ornek
npm run test:tarayici # uçtan uca testler (Playwright, sistem Chrome): ekranlar, çevrimdışı, /vet-defter/ alt yolu
```

## Ürün listesini yenileme

```
npm run urun-cek          # bakanlık sorgusundan çeker; nazik davranır, seyrek çalıştırın
npm run urun-cek -- --ham <klasor> # ağa çıkmadan, kayıtlı ham veriden yeniden üretir (çevrimdışı yeniden kurma)
```

Liste değişince `veri/meta.json` tarihi güncellenir; ardından `sw.js` içindeki `SURUM` artırılır.

## Yayın (GitHub Pages)

`main` dalı, kök dizin. `.nojekyll` dosyası dosya ve dizinlerin olduğu gibi sunulmasını sağlar. Tüm yollar
göreceli (`./`), manifest `start_url`/`scope` `./`, service worker `sw.js` göreceli kaydedilir; bu yüzden
`/vet-defter/` alt yolunda çalışır (uçtan uca testle doğrulanır).

## Notlar

- Dosya değişince `sw.js` içindeki `SURUM` artırılır; yeni dosyalar `DOSYALAR` listesine eklenir.
- Simgeler: `node scripts/ikon.mjs` (`ikon.svg` kaynağından PNG üretir).
- Tasarım: `docs/superpowers/specs/2026-11-14-vet-defter-design.md`.
