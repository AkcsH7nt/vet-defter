# Vet Defter

Saha veterinerleri için (sığır) çevrimdışı çalışan bir cep defteri: belirtiler → hastalık uyum yüzdesi →
tedavi protokolü → etken madde → ruhsatlı Türk ürünleri. Düz HTML + ES modülleri, derleme yok, harici CDN yok.

**Hekim kararının yerine geçmez.** Uygulama yalnızca bilgi ve hatırlatma amaçlıdır; tanı ve tedavi kararı
hekime aittir.

Yayın adresi: https://akcsh7nt.github.io/vet-defter/

## Akış

1. **Tanı**: gözlenen belirtiler seçilir (isteğe bağlı ateş vb.).
2. **Sonuçlar**: kırmızı bayraklar (ihbarı zorunlu hastalık, zoonoz, acil durum) puandan bağımsız olarak en üstte;
   ardından ilk 5 hastalık uyum yüzdesiyle. Sıralama hastalığın sıklığını da hesaba katar; yüzde, o hastalıkta
   beklenen bulguların ne kadarının görüldüğüdür (olasılık değildir). Türkiye'de görülmeyen hastalıklar
   (`turkiyedeGorulmez`) ilk 5'e girmez, ayrı kapalı bölümde durur; kendi bayrağı tutarsa normal sıralanır.
   Her ihbari hastalığın en az bir bayrak kuralı vardır (`npm run dogrula` denetler).
3. **Hastalık**: ayırıcı tanı, protokol, ihbar ve koruma notları.
4. **Etken madde**: nasıl çalışır, AMEG uyarıları, bu etkeni içeren ruhsatlı sığır / buzağı ürünleri; kombine
   ürünlerde öteki etkenler ve AMEG A/B uyarısı ürün satırında yazar.
5. **Hastalıklar / İlaçlar**: A-Z listeler ve arama. **Hakkında**: sürüm, liste tarihi, uyarılar.

## Tıbbi içerik durumu: TASLAK

Tüm tıbbi içerik, hekim onaylayana kadar **TASLAK**tır ve ekranda öyle etiketlenir. Doz (mg/kg), hastalık
onaylanıp protokol satırının kaynak ürünü (`kaynak.urunId` ya da tam ad; ürün o etkeni içermeli) bulunmadan ve o
ürünün KÜB bilgisi doğrulanmadan (`kubDogrulandi.icerikOzeti` `kub[]` ile tutmalı) **gizli** tutulur; KÜB
satırı protokoldeki uygulama yoluyla eşleşmelidir. Et / süt arınma süresi, etken madde ekranında ürünün KÜB'ü
doğrulanmışsa (hastalık onayından bağımsız) gösterilir. Son tıbbi onay hekimdedir.

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

Liste değişince `veri/meta.json` tarihi güncellenir; ardından `npm run surum`. Yenileme, önceki `kub[]` ve
`kubDogrulandi` bilgisini `urunId` ile yeni listeye taşır (hekim doğrulaması silinmez).

## Yayın (GitHub Pages)

`main` dalı, kök dizin. `.nojekyll` dosyası dosya ve dizinlerin olduğu gibi sunulmasını sağlar. Tüm yollar
göreceli (`./`), manifest `start_url`/`scope` `./`, service worker `sw.js` göreceli kaydedilir; bu yüzden
`/vet-defter/` alt yolunda çalışır (uçtan uca testle doğrulanır).

## Notlar

- Önbellekteki bir dosya değişince `npm run surum` çalıştırılır: `sw.js` içindeki içerik özetini yazar ve
  `SURUM`'u artırır. `npm test` özet eskiyse hata verir. Yeni dosyalar `DOSYALAR` listesine eklenir.
- `baglam: "destekler"` yalnız bilgi amaçlıdır, puanı değiştirmez. "Ani ölüm" bağlam kutusu `ani_olum` bulgusu sayılır.
- GitHub Actions (`.github/workflows/test.yml`) her push'ta `npm run dogrula` ve `npm test` çalıştırır; kırmızıysa
  yayına almayın. Uçtan uca testler (`npm run test:tarayici`) sistem Chrome'u ister, yerelde çalıştırılır.
- Simgeler: `node scripts/ikon.mjs` (`ikon.svg` kaynağından PNG üretir).
- Tasarım: `docs/superpowers/specs/2026-11-14-vet-defter-design.md`.
