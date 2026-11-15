# Vet Defter — Kiloya göre tedavi önerisi (tasarım)

Tarih: 15.11.2026 · Ana tasarım: `2026-11-14-vet-defter-design.md` (§4, §7, §15 bu belgeyle güncellenir)

## 1. Amaç ve neden

Hekim (kullanıcı) hastalık sayfasının yalnız seçenek listesi olmasını yetersiz buldu: "tedavi protokolünü de
önermen gerek". Sahada istenen şey, belirtiler ve hayvanın **kilosu / yaşı** girildikten sonra hastalığa
tıklanınca **ne verileceğinin** hazır görünmesi: 1. seçenek ilaç → uygun ruhsatlı ürün → **o hayvan için
hesaplanmış ml** → KÜB'deki uygulama talimatı, yanında ağrı-yangı ilacı ve destek/bakım.

## 2. Hedefler

- Tanı ekranına **kilo (kg)** ve isteğe bağlı **yaş (ay)** girişi.
- Hastalık sayfasının en üstünde **"Önerilen tedavi"** kartı; her hastalıkta görünür.
- Doz **yalnız ürünün KÜB'ünden** hesaplanır: KÜB'de sığır için tek ve net bir ml/kg oranı varsa
  `ml = oran × kilo` gösterilir; yoksa sayı yok, KÜB doz metni aynen.
- Taslak hastalıkta kartın üstünde turuncu şerit: "Taslak öneri — hekim onayından geçmedi". Hekim "X onaylı"
  dedikçe şerit kalkar (mevcut onay akışı).

## 3. Hedef dışı

- Literatürden etken bazında mg/kg dozu yazmak (kullanıcı **A** yolunu seçti: yalnız KÜB).
- Tedavi süresini / tekrar aralığını ayrıştırıp ayrı alan yapmak: süre ve sıklık KÜB cümlesinde aynen okunur.
- Koyun/keçi, AGRIVET Saha birleşmesi.

## 4. Anti-hedefler (çalışsa bile başarısızlık)

- **Yanlış ml.** Belirsiz oran (birden çok sığır dozu, endikasyona göre değişen doz, koyun dozu, aralık
  "1–2 ml/10 kg") için sayı üretmek. Kural: emin değilsen sayı yok.
- Hesaplanan sayının kaynağı görünmeden gösterilmesi: her ml'nin yanında oran ("1 ml / 10 kg") ve KÜB cümlesi.
- Kartın protokoldeki alternatifleri "hepsini verin" gibi okutması: aynı sınıftaki 1. seçenekler
  **seçenek** olarak sunulur.
- Yasak madde / AMEG A'nın kartta görünmesi (mevcut iki savunma hattı korunur).
- Hayvan yaşına/türüne uymayan ürünün öneri olarak seçilmesi (yalnız-buzağı ürünü inekte, sığır hedefi olmayan ürün).

## 5. Kısıtlar

- Mevcut yapı: düz HTML + ES modülleri, derlemesiz, çevrimdışı PWA; `sw.js` SURUM artar.
- KÜB metni kelimesi kelimesine (§15); oran okuması saf fonksiyon (`lib/kub.js`), PDF'ler
  `.superpowers/kub-pdf/` (git dışı), yeniden üretim `npm run kub-ayikla`.
- Bakanlık sitesine yeni istek gerekmez (854 PDF elde).

## 6. Yaklaşımlar

- **A — KÜB'den oran (seçildi).** `kub-ayikla` her ürünün 4.9 metninden sığır ml/kg oranını okur; tek ve net ise
  `guven: yuksek`. Ürüne özel, şişedeki talimatla aynı; kapsam başta kısmi (doğrudan ml/kg yazan ~170–200 ürün;
  "mg/kg" yazanlar için KÜB §2'deki yoğunluk okunursa kapsam artar).
- **B — Literatürden etken dozu.** Her etkene mg/kg yazıp ürün yoğunluğuyla ml'ye çevirmek. Her ilaçta sayı çıkar
  ama ürün talimatından sapabilir ve 86 etkenin dozunu hekimin tek tek doğrulamasını gerektirir. Reddedildi.
- Gösterim kapısı: **1 — her hastalıkta, taslak şeridiyle (seçildi)**; 2 — yalnız onaylı hastalıkta (reddedildi:
  0/48 onaylıyken özellik işe yaramaz).

## 7. Kullanıcının verdiği kararlar

- Kilo ve yaş tanı ekranında, belirtilerle birlikte girilir.
- Doz yalnız KÜB'den hesaplanır (A).
- Kart her hastalıkta görünür; taslakta turuncu uyarı şeridi (1). Bu, §15'teki "hastalık sayfasında ürün/doz
  yalnız onaylıysa" kuralını **değiştirir**: ürün + KÜB doz alıntısı + hesaplanan ml taslak hastalıkta da
  görünür, taslak olduğu açıkça yazılır.

## 8. Tasarım

### 8.1 Girdi

- Tanı ekranı, Yaş bölümünün altında: **Kilo** (sayı, kg; `inputmode=decimal`, "450" / "450,5") ve
  **Yaş (ay)** (isteğe bağlı sayı). Yaş grubu düğmeleri kalır.
- Akla yatkınlık: kilo 15–1200 kg dışında uyarı ("kilo olağan dışı, kontrol edin"), hesap yapılmaz.
  Buzağı seçili + kilo > 250 ya da inek seçili + kilo < 150 → yumuşak uyarı, hesap yapılır.
- `girdi.kilo`, `girdi.yasAy` mevcut girdi kaydına (oturum depolaması) eklenir; `girdiNormalize` geçersizi null yapar.
  Puanlama bu alanları kullanmaz.
- Sonuç ekranının özet satırında kilo görünür. Hastalık sayfasına kilo girilmeden (Hastalıklar listesinden)
  gelinirse kartın içinde küçük bir kilo kutusu vardır; girilen değer aynı `girdi.kilo`ya yazılır.

### 8.2 KÜB'den oran okuma (`lib/kub.js`, `scripts/kub-ayikla.mjs`, `veri/kub.json`)

- Yeni saf fonksiyon `dozOrani(doz, bilesim?)` →
  `{ mlPerKg: number|null, ifade: string|null, cumle: string|null, kaynak: 'ml_kg'|'mg_kg'|null, guven: 'yuksek'|'dusuk' }`.
  - `ifade`: KÜB'deki oranın kendisi (ör. "1 ml/10 kg"), `cumle`: oranın geçtiği cümle (aynen).
  - **ml_kg:** "X ml/Y kg", "X ml / Y kg canlı ağırlık", "X ml ürün/Y kg", "X ml/kg" → `mlPerKg = X/Y`.
  - **mg_kg (kapsam artırımı):** 4.9'da tek "Z mg/kg" + KÜB §2 bileşiminden tek etkenli ürünün
    "1 ml'de W mg" yoğunluğu → `mlPerKg = Z/W`; yalnız tek etkenli enjektabl/oral çözeltide.
    `kub-ayikla` §2 metnini PDF'ten okur (yeni `bilesimAyir`), `kub.json`'a yalnız sonuç yazılır.
  - **yuksek** yalnız: sığıra ait (ya da tür belirtmeyen tek türlü metin) **tek** ayırt edici oran; birden çok
    farklı oran, aralık ("1–2 ml"), endikasyona göre değişen doz, yalnız koyun/keçi oranı, tablo (`tablo: true`),
    `eskiBicim`, `belgeUyumsuz`, `metinYok` → `dusuk` (sayı gösterilmez).
  - Aynı oranın tekrarı (ör. "1 ml/10 kg … yani 10 ml/100 kg") tek oran sayılır.
- Kilosuz dozlar (meme içi tüp, bolus/tablet "hayvan başına") hesaplanmaz; kartta KÜB cümlesi aynen.
- Enjeksiyon yeri sınırı ("bir enjeksiyon yerine X ml'den fazla uygulanmamalı") okunursa
  `yerBasinaMaxMl`; hesaplanan ml bunu aşarsa "N ayrı yere bölün" notu. (Okunamazsa not yok.)
- `veri/kub.json` ürün kaydına `oran` alanı eklenir; şema ve `dogrula` güncellenir.

### 8.3 Önerilen tedavi kartı (`ui/hastalik.js`, yeni `ui/oneri.js`)

Hastalık sayfasının başlığından hemen sonra, mevcut protokol bölümünün üstünde:

```
┌ Önerilen tedavi ────────────────────────────┐
│ ▌Taslak öneri — hekim onayından geçmedi      │  (onaylıysa yok)
│ Hayvan: İnek · 450 kg  [kilo değiştir]       │
│ Antimikrobiyal — 1. seçenekler               │
│  • Penetamat · IM — sistemik seçenek…        │
│    Ürün: Xyz 10 g  → 45 ml  (1 ml / 10 kg)   │
│    "Derin kas içi … 3 gün" (KÜB cümlesi)     │
│    Et 4 gün · Süt 4 gün   [diğer ürünler]    │
│  • Amoksisilin+klav. · İntramammer           │
│    Ürün: Abc LC → kilo hesabı yok            │
│    "Etkilenen her meme lobuna 1 enjektör…"   │
│ Ağrı-yangı — 1. seçenekler                   │
│  • Meloksikam … → 11,3 ml (2,5 ml / 100 kg)  │
│ Destek: … · Bakım: …                         │
│ KÜB'den hesaplandı — uygulamadan önce ürün    │
│ etiketiyle karşılaştırın.                     │
└──────────────────────────────────────────────┘
```

- Satırlar: protokoldeki `sira: 1` ilaçlar, **sınıfa göre gruplu**, grup başlığı "<sınıf> — 1. seçenekler"
  (alternatif oldukları anlaşılsın). `sira: 2` kartta yok; aşağıdaki mevcut protokol listesinde kalır.
- Her satırda **tek önerilen ürün**: sığır hedefli, `sigirHedefDegil` değil, yaşa uygun (yalnız-buzağı ürünü
  buzağı dışında seçilmez; `yasAy` varsa KÜB 4.1'deki yaş kısıtı okunabiliyorsa uygulanır — okunamıyorsa
  yaş süzmesi yalnız yaş grubuna göre), protokoldeki `yol` ile uyumlu (IM/IV/SC/İntramammer/oral eşleşmesi),
  tercih sırası: `oran.guven==='yuksek'` > arınma `yuksek` > kombinesiz (tek etkenli) > ada göre.
  Altında "diğer ürünler (N)" etken sayfasına bağlantı.
- Hesap: kilo varsa `ml = mlPerKg × kilo`, 0,1 ml'ye yuvarlanır (≥ 10 ml ise 1 ml'ye değil, 0,5'e); yanında
  oran ifadesi; altında KÜB `cumle` aynen ve tüm 4.9 metni açılır kutuda. Kilo yoksa oran gösterilir, ml yok.
- Arınma etiketi (mevcut `arinmaEtiketi`), kombine ürün uyarısı (mevcut `kombineBilgisi`), AMEG rozeti korunur.
- Destekleyici ve bakım maddeleri kartta kısa liste; ihbari hastalıkta kartın yerinde **ihbar adımları** önce
  gelir ve `tedaviKipi` "yasak"/"yok" ise kart **hiç ilaç önermez** ("Tedavi önerilmez — ihbar adımları").
- `antibiyotikEndikeDegil: true` → antimikrobiyal grubu kartta yok, "Antibiyotik endike değil" satırı.
- Alt not her zaman: "Doz ürünün KÜB'ünden otomatik hesaplandı — uygulamadan önce ürün etiketi/KÜB ile
  karşılaştırın."

### 8.4 Mevcut sayfa ile ilişki

- Mevcut "Protokol" bölümü (tüm seçenekler, sira 1–2, notlar) kartın altında aynen kalır.
- §15'teki "onaylı hastalıkta ilaç satırı altında 5 ürün" görünümü kartla birleşir: ürün listesi artık taslakta da
  görünür (kullanıcı kararı 1); taslak etiketi hem başlıkta hem kartta.
- Onay özeti (`icerikOzeti`) hastalık içeriğinden hesaplanır; kart eklemesi onayları düşürmez.

## 9. Doğrulama

- Birim testler: `dozOrani` için gerçek KÜB örnek cümleleri (tek oran, çift tür, aralık, endikasyona göre farklı,
  mg/kg + yoğunluk, yer başına sınır, tekrar eden eşdeğer oran); ürün seçici; kilo okuma/akla yatkınlık.
- e2e: kilo gir → hastalık sayfası → kartta ml; kilo yok → oran var ml yok; taslak şerit görünür, onaylı
  örnekte yok; ihbari/yasak hastalıkta ilaç önerilmez; yalnız-buzağı ürünü inekte seçilmez.
- **Fable denetimi:** `guven: yuksek` oranların **hepsi** PDF'le karşılaştırılır (oran, tür, yoğunluk); yanlış
  sıfır olmadan yayın yok. 48 hastalığın kartı bir kez gözden geçirilir (yanlış ürün seçimi, yol uyumsuzluğu).
- Canlıda: kilo girilmiş bir mastitis ve bir pnömoni vakasında kart ekran görüntüsü.

## 10. Gözden geçirmede netleşenler (Claude'un kararları — kullanıcı düzeltebilir)

- **Yaşa/kiloya/yola göre değişen doz:** KÜB'de sığır için birden çok farklı oran varsa (buzağı/yetişkin, kilo
  sınıfı, IV/SC ayrı, endikasyon ayrı) → `dusuk`, sayı yok. Hepsi "birden çok farklı oran" kuralına girer.
  Kapsam düşer; anti-hedef "emin değilsen sayı yok" önce gelir.
- **Ruhsatlı ürünü olmayan 1. seçenek** (oral elektrolit, izotonik sıvı, bikarbonat, dekstroz vb.): satır
  gösterilir, protokol notu ve yol ile; "Listede ruhsatlı sığır ürünü yok" yazar, hesap yok. Gizlenmez.
- **Yol uyumu:** Ürün, protokol `yol`'u ile en az bir ortak yolu (eşleme tablosuyla) yoksa önerilmez. Oran
  KÜB'de yola göre ayrışıyorsa zaten `dusuk`.
- **Ürün sıralaması:** hesaplanabilir oran tercih edilir; kartta "Dozu hesaplanabilen ürün seçildi · diğer
  ürünler (N)" yazar.
- **Aşamalama:** önce yalnız `ml_kg` yolu. `mg_kg` (KÜB §2 yoğunluğu) ayrı görev; kendi Fable denetimi geçmeden
  yayına girmez (gerekirse ilk sürüm yalnız ml_kg ile çıkar).
- **Yuvarlama:** en yakın değere (10 ml altı 0,1; üstü 0,5). Hesaplanan ham değer KÜB oranından türediği için
  ±0,25 ml fark kabul; ham değer küçük yazıyla da gösterilir. Yer başına sınır okunamazsa yalnız toplam ml.
- **Sürü hastalıkları:** kart yine hayvan başına hesaplar; suya/yeme katılan ürünlerin dozu (ml/L, g/ton)
  kilo oranı değildir → hesap yok, KÜB cümlesi.
- **Kilo kaydı:** kartta değiştirilen kilo aynı `girdi.kilo`'ya yazılır (tanı ekranında da görünür).

## 11. Builder'a kalanlar

- Yol eşleştirme tablosu (KÜB "kas içi" ↔ protokol "IM" vb.), yuvarlama ayrıntısı, kart görsel düzeni,
  "diğer ürünler" bağlantısının hedefi, `yasAy`'ın KÜB 4.1'den okunup okunamayacağı (okunamıyorsa yalnız yaş grubu).
