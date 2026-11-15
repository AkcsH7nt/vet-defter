# Vet Defter — tasarım belgesi

Tarih: 14.11.2026 · Durum: kullanıcı onayı bekliyor · Danışman incelemesi: Fable (14.11.2026) işlendi

## 1. Amaç ve neden

Sahada çalışan veteriner hekimin cebindeki "bilgi defteri". Hekim türü, yaş grubunu, bağlamı (doğum
sonrası mı, birden çok hayvan mı), vücut ısısını ve belirtileri girer; uygulama olası hastalıkları
**uyum yüzdesine** göre sıralar. Hastalığa dokununca protokol (ilaçlar, destekleyici tedavi,
bakım/yönetim, ihbar adımları) açılır. Protokoldeki bir etken maddeye dokununca **Türkiye'de ruhsatlı**
ürünler (ad, firma, form, yol, KÜB dozu, arınma süreleri, KÜB bağlantısı) listelenir.

Önce bağımsız uygulama olarak GitHub Pages'te yayınlanır; sonra AGRIVET Saha'ya (C:\AKCS\agrivet-saha)
modül olarak eklenir. AGRIVET'in Tedavi formunda şikâyet / ısı / teşhis / ilaç / arınma alanları var
(`src/eylemler/islemTanimlari.ts`); birleşmede bu zincir o formu dolduracak.

Kullanım anı (varsayım, kullanıcı aksini söylemedi): **ahırda, hayvanın başında, hızlı karar.**
Az adım, büyük dokunma alanları, kısa madde madde protokol, internetsiz.

## 2. Hedefler

- H1. Girdi → sıralı hastalık listesi, her birinde uyum yüzdesi ve "neden" (eşleşen / eksik / çelişen).
- H2. Puandan bağımsız **kırmızı bayrak** katmanı: ihbarı mecburi / zoonoz şüphesi her zaman en üstte.
- H3. Hastalık sayfası: kısa tanım, ayırıcı tanı, sahada doğrulama, tedavi kipi, protokol.
- H4. Protokoldeki her ilaç (antimikrobiyal, antiparaziter, NSAİİ, metabolik, diğer) → ruhsatlı ürünler.
- H4b. Her etken maddenin **etki mekanizması**: neyi bloke ettiği / neye etki ettiği, etkinin türü
  (ör. bakterisit / bakteriyostatik), spektrumu, önemli direnç ve etkileşim notları.
- H5. Tamamen çevrimdışı (PWA), ana ekrana eklenebilir.
- H6. Her tıbbi bilginin satır düzeyinde kaynağı ve onay kaydı veride tutulur.

## 3. Hedef dışı (bu sürümde yok)

Hasta/işletme kaydı ve tutanak (AGRIVET'te) · AGRIVET'e aktarım butonu (birleşmede) · hesap, sunucu,
senkron · pet, kanatlı, arı, su ürünleri · **etiket dışı kullanım ve ders kitabı dozları**.

## 4. Anti-hedefler (çalışsa bile başarısızlık)

- Uyum yüzdesinin olasılık gibi sunulması. Yüzde hastalıklar arasında normalize edilmez (bkz. §9);
  ekranda "uyum" yazar, "Hekim kararının yerine geçmez" notu sürekli durur.
- Bir ihbar şüphesinin puan sıralaması yüzünden görünmemesi.
- Tedavisi yasak bir hastalığa tedavi protokolü gösterilmesi.
- Doğrulanmamış (taslak) kayıtta doz gösterilmesi.
- Ruhsatsız / ruhsatı düşmüş ürünün ruhsatlı diye listelenmesi. Liste tarihi her ürün ekranında görünür.
- Gıda hayvanında yasak bir maddenin herhangi bir protokolde geçmesi.
- Sütte kullanılmayan bir ürünün süt arınma süresiyle gösterilmesi.

## 5. Kısıtlar

- GitHub Pages, açık depo `AkcsH7nt/vet-defter` → `akcsh7nt.github.io/vet-defter`. İçerik herkese açık
  (yalnız genel bilgi ve kamuya açık resmi ürün verisi, kişisel veri yok).
- Küpe Sayım ile aynı teknik: düz HTML + ES modülleri, derleme yok; `sw.js` (dosya değişince `SURUM`
  artar); `node --test`; Playwright (sistem Chromium) uçtan uca.
- 360–400 px öncelikli, WCAG AA, Türkçe arayüz.
- `veri/*.json` ve `lib/puan.js`, `lib/bayrak.js` ekran kodundan ayrı ve saf: AGRIVET'e aynen taşınır.

## 6. Yaklaşımlar (seçilen: A)

- **A. Düz HTML/JS PWA, GitHub Pages — kullanıcı kararı.** Derlemesiz, Küpe Sayım'da denenmiş, güncelleme
  tek push. Eksisi: AGRIVET'e geçerken ekranlar React'e yeniden yazılır (veri + motor aynen gider).
- B. React+Vite+TS: birleşme kolay ama derleme + Actions gerekir.
- C. Capacitor APK: yerel özellik gerekmiyor, güncelleme zahmetli.

## 7. Ekranlar

```
[1 Tanı girişi]                     [2 Sonuçlar]                       [3 Hastalık]
Tür: Sığır                          ⛔ ŞAP ŞÜPHESİ — İHBAR EDİN ▸       Buzağı pnömonisi  [taslak]
Yaş: Buzağı|Dana(besi)|Düve|İnek|Boğa Buzağı pnömonisi  Güçlü  78% ▸  ⚠ ihbar / zoonoz bandı (varsa)
Bağlam: □ Son 30 gün doğum            eşleşen: ateş, öksürük…          Tanım · Ayırıcı tanı
        □ Birden çok hayvan           eksik: hırıltı                   Sahada doğrula
        □ Ani ölüm                  Buzağı ishali      Orta   41% ▸    Tedavi kipi: normal
Isı: [ 40,6 ] °C → "ateş" (yaşa göre) Difteri            Zayıf  22% ▸    ▸ İlaçlar (1./2. seçenek)
Belirti ara: [öks…]                 ─ Hekim kararının yerine geçmez    ▸ Destekleyici
Sistem çipleri ▾ · Seçili: ✕ ✕       (3'ten az bulgu: "Yetersiz girdi")  ▸ Bakım / yönetim
[ Sonuçları göster ]

[4 Etken madde: Oksitetrasiklin]        AMEG: D
Nasıl çalışır
 Hedef: bakteri ribozomu (30S alt birimi)
 Etki: tRNA'nın bağlanmasını bloke eder → protein sentezi durur
 Tür: bakteriyostatik · Spektrum: geniş (Gram+, Gram−, Mycoplasma, Anaplasma…)
 Dikkat: Ca/Mg içeren ürünlerle ağızdan birlikte verilmez; direnç yaygın
Ruhsatlı ürünler (liste tarihi: GG.AA.YYYY)
 Ürün A — Firma — enj. çözelti, IM — KÜB dozu … — Et 28 g · Süt 7 g — KÜB ▸
 Ürün B — … — Et 21 g · Süt: sağmal inekte kullanılmaz — KÜB ▸
```

Alt gezinme: Tanı · Hastalıklar (A–Z) · İlaçlar (etken arama) · Hakkında (kaynaklar, liste tarihi,
sorumluluk notu).

Taslak (onaylanmamış) hastalıkta: tanım ve etken adları görünür, **doz yerine "KÜB'e bakın"**.

## 8. Veri modeli (`veri/`, JSON Schema `veri/sema/`, sürüm `meta.json`'da)

- `belirtiler.json`: `{ id, ad, sistem, esAnlamlilar[], tur[], genelSiklik }` — "ateş" ve "hipotermi"
  elle seçilmez, ısıdan türetilir (yaşa göre normal aralık).
- `hastaliklar.json`:
  `{ id, ad, tur[], yasGruplari[], baglam: { dogumSonrasi?, suru?, aniOlum? }, yayginlik: sik|orta|nadir,
  mevsim?: [aylar], ihbari: bool, zoonoz: bool, tedaviKipi: yasak|yok|semptomatik|normal,
  isi: { min, max } | null, belirtiler: [{ id, agirlik: kardinal|tipik|olasi, yoklugu_dusurur }],
  dislayicilar[], ayiriciTani[], sahadaDogrula[], uyarilar[] (ör. "nekropsi yapma"),
  protokol: { ilaclar[], destekleyici[], bakim[], ihbarAdimlari[] }, antibiyotikEndikeDegil: bool,
  agrivetAd, onay: { durum: taslak|onayli, kim, tarih, icerikOzeti } }`
  - `ilaclar[]`: `{ etkenId, sinif: antimikrobiyal|antiparaziter|nsaii|metabolik|diger, sira: 1|2,
    yol, not, kaynak: { tur: KUB, urun, bolum } }` — doz yapılandırılmış olarak **ürün KÜB'ünden** gelir.
  - `onay.icerikOzeti`: kaydın özeti; içerik değişince özet tutmaz → durum otomatik `taslak`.
- `etkenler.json`: `{ id, ad, sinif, atcvet, ameg: A|B|C|D, mekanizma: { hedef, etki, tur
  (bakterisit|bakteriyostatik|… / ilaç sınıfına uygun karşılığı), spektrum, kinetik? (zamana /
  konsantrasyona bağımlı), direnc?, etkilesimler[], kaynak }, onay }` — B: "antibiyogramsız ilk seçenek
  olmaz"; A: gıda hayvanında kullanılmaz. Mekanizma antimikrobiyal dışı sınıflarda da doldurulur
  (ör. imidokarb, NSAİİ'de COX inhibisyonu, kalsiyum boroglukonat). Mekanizma metni de §11 onay
  sürecinden geçer.
- `urunler.json`: `{ ad, firma, form, etkenler[], hedefTurler[], kubUrl, cekilmeTarihi,
  kub: [{ tur, yol, doz: { miktar, birim: mg/kg, aralik, sure }, et_gun | null,
  sut: { saat } | 'kullanilmaz' | 'belirtilmemis' }], kubDogrulandi: { kim, tarih } | null }`
  — 0 gün ile "bilinmiyor" (`null`) ayrıdır.
- `yasaklar.json`: gıda hayvanında yasak maddeler (kloramfenikol, nitrofuranlar, nitroimidazoller,
  klorpromazin, kolşisin, dapson, stilbenler, tireostatikler; MRL'si olmayan fenilbutazon) — yürürlükteki
  mevzuattan doğrulanarak, kaynak tarihli.
- `ihbar.json`: ihbarı mecburi hastalıklar listesi, yürürlükteki yönetmelik ekinden **kelimesi kelimesine**,
  kaynak ve tarih ile (yanıkara çıkarıldı; BSE, mavi dil, sığır vebası, CBPP gözden geçirilecek; KKKA
  belirti listesine girmez, yalnız kene / hekim güvenliği uyarısı).
- `meta.json`: şema sürümü, içerik sürümü, ürün listesi tarihi.

`scripts/dogrula.mjs` (testin parçası): kimlik bağları; yasak madde protokolde → hata; ihbari hastalıkta
`ihbarAdimlari` yok → hata; `tedaviKipi: yasak|yok` iken `ilaclar` dolu → hata; kaynaksız ilaç satırı
→ hata; onay özeti tutmayan "onayli" kayıt → hata.

## 9. Uyum yüzdesi ve kırmızı bayraklar

**Sıralama (`lib/puan.js`, saf fonksiyon):** toplamalı log-olabilirlik oranı.
- Belirti–hastalık duyarlılığı ağırlık sınıfından: kardinal ≈ 0,9 · tipik ≈ 0,6 · olası ≈ 0,25 ·
  listede yok ≈ 0,03; bölü belirtinin `genelSiklik`'i; üstüne yaygınlıktan log-ön ağırlık
  (kan parazitlerinde `mevsim` ayı içindeyse artırılır; ülke geneli değer — kullanıcı aksini demedi).
- Seçilmemiş belirti "bilinmiyor"; yalnız `yoklugu_dusurur` olanlar eksi getirir. `dislayicilar` büyük eksi.
- Aynı sistemden bağıntılı belirtilere tavan (çift sayım önlenir). Isı bir kez sayılır.
- Tür / yaş / bağlam uymayan hastalık liste dışı (bağlam "zorunlu" işaretliyse).

**Gösterim:** yüzde, hastalığın **kendi beklenen bulgularının ağırlıkça ne kadarının** bulunduğu
(mutlak kapsama, normalize edilmez; yeni hastalık eklemek başkasının yüzdesini değiştirmez) +
bant: Güçlü / Orta / Zayıf. 3'ten az bulguda "Yetersiz girdi — belirti ekleyin". Katsayılar uzman
tahminidir, kalibre olasılık değildir ("Hakkında"da yazılır).

**Kırmızı bayrak (`lib/bayrak.js`, puandan bağımsız):** kural tablosu, eşleşince sonuçların üstünde:
vezikül + salya + topallık → şap · ani ölüm + doğal deliklerden kan → şarbon, "nekropsi yapma" ·
sinirsel belirti + salya → kuduz, "ağzı çıplak elle muayene etme" · abort → brusella ·
deri nodülü + ateş → LSD. Kurallar `ihbar.json` ile birlikte kullanıcı onayından geçer.

**Testler:** hastalık başına 3–4 altın vaka (vinyet; motoru yazan model görmez, Fable taslaklar, hekim
onaylar) → ilk 3'te bulunma oranı; değişmezler: eşleşen bulgu eklemek puanı düşürmez, ilgisiz hastalık
eklemek başkasının yüzdesini değiştirmez.

## 10. Ruhsatlı ürün verisi

Kaynak: Tarım ve Orman Bakanlığı ruhsatlı veteriner ilaçları sorgusu
`https://hbs.tarbil.gov.tr/Receipt/SearchProduct` (filtre: etkin madde, terapötik grup, hedef tür;
sonuçta KÜB). Toplu indirme yok.
- `scripts/urun-cek.mjs`: hedef tür = sığır, protokollerde geçen etken maddeler için, **yavaş ve bir kez**
  (istekler arası bekleme) çeker; uygulama çalışırken siteye gitmez. Kamuya açık resmi veri, kaynak ve
  tarih belirtilerek yayımlanır (builder kararı).
- KÜB'den doz ve arınma yapılandırılmış olarak çıkarılır (tür + yol bazında). Çıkarılan her ürün
  `kubDogrulandi: null` başlar; **hekim onaylamadan doz ekranda görünmez**, yalnız KÜB bağlantısı.
- Betik çalışmazsa yedek: kullanıcı sorgu sonuçlarını kaydeder, betik o dosyadan üretir.

## 11. İçerik kapsamı ve onay süreci

Tür: **sığır** (model koyun/keçiye hazır). ~35 hastalık, sistem bazında partiler halinde: solunum,
sindirim/buzağı ishalleri, meme, üreme (abort dahil), metabolik/doğum sonrası, deri, ayak,
kan parazitleri, ihbarı mecburi, sık zehirlenmeler.

Süreç (her parti için): Opus taslaklar (kaynak sayfa / KÜB bölümüyle) → Fable ikinci okuma
(kaynak uydurma, yasak madde, ihbar, arınma) → **kullanıcı (hekim) onayı** → `onay` kaydı yazılır.
Yapay zekâ okuması bağımsız doğrulama sayılmaz; tek yetkili onay hekimindir.

## 12. Kararlaştırılanlar (kullanıcı)

- Ayrı modül, önce bağımsız; sonra AGRIVET Saha'ya eklenecek. HTML, GitHub Pages.
- Akış: belirti/ısı → yüzdeli hastalıklar → protokol → ilaç → Türkiye'de ruhsatlı ürünler.
- İçeriği kullanıcı onaylar; **taslakta doz gösterilmez.**
- **Doz yalnız KÜB'den**; etiket dışı kullanım ve ders kitabı dozları yok.
- Ürün listesi **protokolde geçen tüm ilaç gruplarına** bağlanır (yalnız antibiyotik değil).
- Her etken maddenin **çalışma şekli** (neyi bloke ettiği / neye etki ettiği) etken sayfasında anlatılır.
- Danışman Fable; programlama Sonnet ve Opus ile organize edilir.

## 13. Builder'ın verdiği kararlar (kullanıcı düzeltebilir)

- Yüzde = mutlak kapsama + bant (kullanıcının "yüzde" isteği korunur, olasılık izlenimi verilmez).
- Bağlam çipleri (doğum sonrası, birden çok hayvan, ani ölüm) ve "Dana (besi)" yaş grubu.
- Yaygınlık ülke geneli + kan parazitlerinde mevsim artırımı.
- Kritik antimikrobiyal sınıflaması EMA AMEG (A/B/C/D).
- AGRIVET sözleşmesi: `agrivetAd` eşlemesi + sözleşme testi; AGRIVET'te süt arınması gün cinsinden
  olduğundan "kullanılmaz"/saat bilgisi birleşmede ayrıca ele alınacak.
- Dosya düzeni, CSS, çip gruplaması, Türkçe karakter duyarsız arama, PWA ayrıntıları.

## 14. İş paketleri ve model iş bölümü

| # | Paket | Model | Kapı |
|---|---|---|---|
| P0 | Şema + JSON Schema + `dogrula.mjs` + `yasaklar.json` / `ihbar.json` iskeleti | Opus | **K1** Fable şema incelemesi |
| P1 | PWA iskeleti, `sw.js`, gezinme, CSS token'ları | Sonnet | — |
| P2 | Puan motoru `lib/puan.js` + değişmez testleri | Opus | **K2** vinyetler (Fable taslak, hekim onay) |
| P3 | Kırmızı bayrak katmanı `lib/bayrak.js` + ihbar listesi | Opus | **K3** Fable + kullanıcı onayı |
| P4 | Belirti sözlüğü, eş anlamlılar, arama | Sonnet | hafif Fable bakışı |
| P5 | Hastalık içeriği, partiler halinde + etken madde mekanizmaları | Opus | **K4** her parti: Fable → kullanıcı |
| P6 | Ürün çekme betiği (Sonnet) + etken eşleme ve KÜB doz/arınma çıkarımı (Opus) | Sonnet + Opus | **K5** örneklem + "sütte kullanılmaz" ve AMEG B'nin tamamı |
| P7 | Ekranlar 1–4, bayrak bandı, taslak etiketi | Sonnet | — |
| P8 | Uçtan uca, çevrimdışı, erişilebilirlik, AGRIVET sözleşme testi | Sonnet | — |
| P9 | Yayın öncesi anti-hedef denetimi, GitHub Pages yayını | Sonnet (yayın) | **K6** Fable denetim, son onay kullanıcı |

Sıra: P0 → (P1, P2, P4 paralel) → P3 → (P5, P6 paralel) → P7 → P8 → P9.
İlk yayın, onaylı içerik oranından bağımsız yapılabilir (taslaklar dozsuz görünür).

## 15. Ek (15.11.2026): KÜB'den doz ve arınma, hekim onayı — kullanıcı kararları

- **KÜB alıntısı:** Ürünlerin KÜB PDF'leri bir kez indirilir (Bakanlık, ≥ 2,5 sn aralıkla); her PDF'ten
  **4.9 Dozaj ve kullanım yolu** ve **4.11 Kalıntı arınma süreleri** bölümleri **kelimesi kelimesine** alınır
  (`pdftotext`, yapay zekâ yeniden yazımı yok). Metin çıkarılamazsa "KÜB'e bakın" + bağlantı.
- **Gösterim kuralı (değişti):** Etken sayfasında KÜB alıntısı ürün onayı olmadan görünür ve
  "KÜB'den alıntı" diye etiketlenir (resmî belgenin metni). Hastalık sayfasında ilaç satırının altında ürünler ve
  KÜB doz alıntıları **yalnız hastalık onaylıysa** görünür. Ürün ürün onay yok (`kubDogrulandi` artık doz
  gösterimini kapılamaz; alan geriye uyumluluk için kalır).
- **Arınma sayıları:** 4.11 metninden sığır için et (gün) ve süt (saat/gün, "kullanılmaz") otomatik okunur;
  her biri `guven: yuksek|dusuk` taşır, yalnız `yuksek` sayı etiket olarak gösterilir, yanında
  "KÜB'den otomatik okundu — metinle karşılaştırın". Okunamazsa sayı yok.
- **Hekim onayı:** Hekim sohbetten "X onaylı" der; `npm run onayla -- <id>` onay kaydını (kim, tarih, içerik özeti)
  yazar; içerik değişince onay kendiliğinden düşer (mevcut `onayliMi`). `npm run onay-durumu` liste verir.
- Anti-hedef §4 "Doğrulanmamış (taslak) kayıtta doz gösterilmesi" bu ekle şöyle okunur: taslak **hastalıkta**
  doz/ürün alıntısı gösterilmez; etken sayfasındaki KÜB alıntısı resmî metin olarak serbesttir.
