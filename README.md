# Vet Defter

Saha veterinerleri için çevrimdışı çalışan bir cep defteri: belirtiler → hastalık eşleşme yüzdesi → tedavi
protokolü → etken madde → ruhsatlı Türk ürünleri. Düz HTML + ES modülleri, derleme yok, harici CDN yok.

**Hekim kararının yerine geçmez.** Uygulama yalnızca bilgi ve hatırlatma amaçlıdır; tanı ve tedavi kararı
hekime aittir.

## Çalıştırma

```
npm install
npm run sunucu        # http://localhost:5180
```

## Testler

```
npm test              # birim testleri (test/*.test.js)
npm run test:tarayici # uçtan uca testler (Playwright, sistem Chrome)
npm run dogrula       # veri/ doğrulaması (spec §8 kuralları); başka kök: node scripts/dogrula.mjs test/ornek
```

## Notlar

- Dosya değişince `sw.js` içindeki `SURUM` artırılır; yeni dosyalar `DOSYALAR` listesine eklenir.
- Simgeler: `node scripts/ikon.mjs` (`ikon.svg` kaynağından PNG üretir).
- Tasarım: `docs/superpowers/specs/2026-11-14-vet-defter-design.md`.
