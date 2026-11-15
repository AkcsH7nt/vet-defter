# Kiloya Göre Tedavi Önerisi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tanı ekranına kilo/yaş(ay) eklemek; hastalık sayfasının üstünde, KÜB'deki sığır ml/kg oranından o hayvana hesaplanmış ml'yi gösteren "Önerilen tedavi" kartı.

**Architecture:** `kub-ayikla` her ürünün 4.9 metninden saf `dozOrani` ile oranı ve KÜB yollarını okuyup `veri/kub.json` kaydına `oran` + `yollar` yazar. Saf `lib/oneri.js` hastalık + veri + girdiden öneri nesnesi kurar (ürün seçimi, ml hesabı). `ui/oneri.js` kartı çizer; `ui/hastalik.js` kartı başa koyar.

**Tech Stack:** Mevcut: düz HTML + ES modülleri, `node --test`, Playwright, `pdftotext` (Xpdf, `-simple`).

**Spec:** `docs/superpowers/specs/2026-11-15-tedavi-onerisi-design.md` (+ ana tasarım §15)

## Global Constraints

- Önceki planların Global Constraints'i aynen geçerli (`2026-11-14-vet-defter.md`, `2026-11-15-kub-onay.md`).
- Doz yalnız ürünün KÜB'ünden; literatür dozu yok. Emin değilsen sayı yok.
- Ekranda her doz/oran metni KÜB kaynaklı bir öğenin içinde ve `data-kub` özniteliği taşır; `data-kub` dışında hiçbir
  hastalık/etken sayfası metninde `mg/kg` ya da `ml/kg` geçmez.
- Taslak hastalıkta kartın başında: "Taslak öneri — hekim onayından geçmedi" (turuncu şerit, `.bant.taslak-oneri`).
- Kartın sonunda her zaman: "Doz ürünün KÜB'ünden otomatik hesaplandı — uygulamadan önce ürün etiketi/KÜB ile karşılaştırın."
- Yuvarlama: ham < 10 ml → en yakın 0,1; ham ≥ 10 → en yakın 0,5; ondalık virgülle yazılır ("11,3 ml"); ham değer küçük yazıyla.
- Kilo 15–1200 kg dışı → "Kilo olağan dışı, kontrol edin", ml hesaplanmaz. Buzağı + kilo > 250 ya da inek/boğa + kilo < 150 → yumuşak uyarı, hesap yapılır.
- Bu planda yalnız `kaynak: 'ml_kg'`; `mg_kg` Task 6 (ayrı Fable denetimi geçmeden yayına girmez).
- `sw.js` `DOSYALAR` yeni modülleri içerir; `SURUM` artar (`npm run surum`).
- Commit mesajlarında model adı / atıf satırı yok.

## Review Focus

1. **Tek oran ama yalnız buzağıya ait** ("Buzağılarda 1 ml/10 kg") → `kapsam: 'buzagi'`; inekte hesap yok, buzağıda var. Test: Task 1 + Task 3.
2. **Aynı oranın eşdeğer tekrarı** ("1 ml/10 kg (10 ml/100 kg)") tek oran sayılır, `yuksek`; gerçekten farklı iki oran (IV ve IM ayrı) `dusuk`. Test: Task 1.
3. **Kart kilosuz açılır** (Hastalıklar listesinden) → oran görünür, ml yok, kart içi kilo kutusu; yazılan kilo tanı ekranında da görünür. Test: Task 4 e2e.
4. **Protokol yolu ile ürün yolu çakışmaz** (protokol "İntramammer", ürün yalnız IM) → o ürün önerilmez. Test: Task 3.
5. **Hesaplanan ml enjeksiyon yeri sınırını aşar** ("bir enjeksiyon yerine 20 ml'den fazla uygulanmamalı", 450 kg → 45 ml) → "3 ayrı yere bölün". Test: Task 1 (okuma) + Task 3 (hesap).

---

### Task 1: KÜB'den oran ve yol okuma (Opus)

**Files:**
- Create: `lib/oran.js`, `test/oran.test.js`, `test/ornek/kub/oran/*.txt` (gerçek KÜB 4.9 metinlerinden kısa kesitler; `veri/kub.json`'dan alınır)
- Modify: `scripts/kub-ayikla.mjs` (kayda `oran`, `yollar`), `scripts/dogrula.mjs` (`kubKaydi` isteğe bağlı alanlar + oran denetimi), `veri/sema/kub.schema.json`, `veri/kub.json` (yeniden üret)

**Interfaces:**
- Produces (`lib/oran.js`):
  - `export function dozOrani(doz: string|null, { tablo = false, eskiBicim = false } = {}): Oran`
    `Oran = { mlPerKg: number|null, ifade: string|null, cumle: string|null, kaynak: 'ml_kg'|null, kapsam: 'sigir'|'buzagi'|null, guven: 'yuksek'|'dusuk', yerBasinaMaxMl: number|null }`
  - `export function yolKodlari(metin: string|null): string[]` — sıralı, tekrarsız; kodlar `IM, IV, SC, ORAL, IMM (meme içi), IU (uterus içi), TOPIKAL`. Eşlemeler: kas içi/intramüsküler/i.m./IM → IM; damar içi/intravenöz/i.v./IV → IV; deri altı/subkutan/s.c./SC → SC; ağız/oral/içme suyu/süt ikame/sonda/rumen → ORAL; meme içi/intramammer/meme kanal/meme lobu/meme başı kanalı → IMM; uterus içi/intrauterin → IU; dökme/pour-on/sprey/banyo/püskürt/deri üzeri/lokal/topikal → TOPIKAL. Hem KÜB metnine hem protokol `yol` metnine uygulanır.
- `veri/kub.json` ürün kaydı (metinYok değilse): `oran: Oran`, `yollar: string[]`.

Kurallar (`dozOrani`):
- Oran kalıpları: `X ml/Y kg`, `X ml / Y kg canlı ağırlık|vücut ağırlığı`, `X ml ürün/Y kg`, `X ml/kg` (Y=1); sayılarda virgül/nokta ondalık. `mlPerKg = X/Y`.
- Cümle türü: cümle koyun/keçi/kuzu/at/köpek/kedi/domuz/kanatlı geçiyor ve sığır/buzağı/inek/dana/düve geçmiyorsa → yok sayılır. Sığır sözcüğü olmayan buzağı/dana cümlesi → `kapsam: 'buzagi'`; aksi → `'sigir'`.
- Kalan oranlar `mlPerKg` değerine göre %1 toleransla tekilleştirilir. Tam bir ayırt edici değer → `yuksek`; sıfır → `{ mlPerKg: null, guven: 'dusuk' }`; birden fazla → `dusuk`, `mlPerKg: null`.
- Hepsi `dusuk` (mlPerKg null): aralık (`1-2 ml`, `1–2 ml`, `1 ila 2 ml`), `tablo`, `eskiBicim`, oranlı cümlede "en fazla/maksimum/üzerindeki hayvan" + ml sınırı (yer başı sınırı hariç).
- Hem `sigir` hem `buzagi` kapsamlı cümle aynı tek değeri veriyorsa `kapsam: 'sigir'`.
- `yerBasinaMaxMl`: "(bir) enjeksiyon yerine/bölgesine … X ml('den|den) fazla" → X; yoksa null.
- `ifade`: eşleşen oran metni aynen ("1 ml/10 kg canlı ağırlık"); `cumle`: oranın geçtiği cümle aynen (nokta/satır sonuna kadar).

- [ ] **Step 1: Failing tests** (`test/oran.test.js`)
  - `tekOranYuksek`: "Derin kas içi yolla 1 ml/10 kg canlı ağırlık dozunda tek doz uygulanır." → `{ mlPerKg: 0.1, kapsam: 'sigir', guven: 'yuksek', kaynak: 'ml_kg' }`, `ifade` "1 ml/10 kg" ile başlar, `cumle` tam cümle.
  - `esdegerTekrarTekOran`: "6 mg/kg (1 ml/30 kg vücut ağırlığı)" + aynı metinde "10 ml/300 kg" → `mlPerKg ≈ 0.0333`, `yuksek`.
  - `farkliIkiOranDusuk`: "IV: 1 ml/10 kg … IM: 2 ml/10 kg" → `{ mlPerKg: null, guven: 'dusuk' }`.
  - `koyunCumlesiSayilmaz`: "Sığır: 1 ml/10 kg. Koyun ve keçi: 1 ml/5 kg." → `0.1`, `yuksek`.
  - `yalnizBuzagi`: "Buzağılarda 1 ml/20 kg …" → `kapsam: 'buzagi'`, `yuksek`.
  - `aralikDusuk`: "1-2 ml/10 kg" → `dusuk`.
  - `tabloDusuk`: tablo bayrağı → `dusuk`.
  - `kilosuzDoz`: "Etkilenen her meme lobuna bir enjektör" → `{ mlPerKg: null, guven: 'dusuk' }`.
  - `yerSiniri`: "Bir enjeksiyon yerine 20 ml'den fazla uygulanmamalıdır." → `yerBasinaMaxMl: 20`.
  - `yolKodlari`: "Derin kas içi ya da deri altı" → `['IM','SC']`; "İntramammer (kuru dönem)" → `['IMM']`; "SC / IV (yavaş, kombine çözelti)" → `['IV','SC']`; "Ağızdan / sonda ile" → `['ORAL']`; null → `[]`.
  - En az 6 testte metin `test/ornek/kub/oran/` altındaki gerçek KÜB kesitinden okunur.
- [ ] **Step 2:** `node --test test/oran.test.js` → FAIL (modül yok).
- [ ] **Step 3:** `lib/oran.js`'i yaz; `kub-ayikla` kayda `oran: dozOrani(doz, { tablo, eskiBicim })`, `yollar: yolKodlari(doz)` ekler (belgeUyumsuz kayıtta `oran.guven = 'dusuk'`, `mlPerKg: null`). Rapora oran dağılımı: yuksek/dusuk sayısı, kapsam buzagi sayısı, yerBasinaMaxMl sayısı.
- [ ] **Step 4:** `dogrula`: `oran` varsa alanları ve tipleri; `guven==='yuksek'` ⇒ `0 < mlPerKg ≤ 50` (dışı = hata) ve `ifade`, `cumle` dolu; `yollar` yalnız bilinen kodlar.
- [ ] **Step 5:** `npm run kub-ayikla` → `npm run dogrula` temiz → `npm test` PASS. Rapordaki dağılımı ledger'a yaz.
- [ ] **Step 6:** Commit `feat: KÜB'den sığır ml/kg oranı ve uygulama yolu okuma`.

### Task 2: Kilo ve yaş girdisi (Sonnet) — Task 1 ile paralel

**Files:**
- Create: `lib/hayvan.js`, `test/hayvan.test.js`
- Modify: `ui/ortak.js` (`girdiNormalize`), `ui/tani.js`, `ui/sonuc.js`, `test/tarayici/ekranlar.e2e.mjs`

**Interfaces:**
- Produces (`lib/hayvan.js`):
  - `export function kiloOku(metin: string|number|null): number|null` — "450", "450,5", " 450 kg " → sayı; boş/geçersiz/≤0 → null.
  - `export function yasAyOku(metin): number|null` — 0–360 tam/ondalık ay; dışı → null.
  - `export function kiloUyarisi(kilo: number|null, yas: string): { tur: 'gecersiz'|'yumusak', metin: string } | null` — Global Constraints eşikleri; `gecersiz` metni "Kilo olağan dışı, kontrol edin"; `yumusak` metni "Kilo yaş grubuyla uyumsuz görünüyor, kontrol edin".
- `girdi.kilo: number|null`, `girdi.yasAy: number|null` (`girdiNormalize` `kiloOku`/`yasAyOku` ile; yoksa null). Puanlama bu alanları kullanmaz.

- [ ] **Step 1: Failing tests:** `kiloOku('450,5') === 450.5`, `kiloOku('abc') === null`, `kiloOku('0') === null`; `kiloUyarisi(10,'inek').tur === 'gecersiz'`, `kiloUyarisi(1300,'inek').tur === 'gecersiz'`, `kiloUyarisi(300,'buzagi').tur === 'yumusak'`, `kiloUyarisi(120,'inek').tur === 'yumusak'`, `kiloUyarisi(450,'inek') === null`, `kiloUyarisi(null,'inek') === null`; `girdiNormalize({kilo:'x'}).kilo === null`, `girdiNormalize({kilo:450}).kilo === 450`.
- [ ] **Step 2:** FAIL → **Step 3:** yaz. Tanı ekranı: "Yaş" düğmelerinin altında aynı satırda `#kilo` (etiket "Kilo (kg)", `inputmode=decimal`) ve `#yas-ay` (etiket "Yaş (ay, isteğe bağlı)"); altında `kiloUyarisi` metni (`.ipucu`). Sonuç ekranının başlığı altına girdi özeti satırı: "İnek · 450 kg" (kilo yoksa yalnız yaş grubu). "Yeni vaka" kilo ve yaşAy'ı da temizler.
- [ ] **Step 4:** e2e: `#kilo`'ya "450" yaz → sonuç ekranında "450 kg"; sayfa yenilenince değer korunur; "Yeni vaka" sonrası boş. `npm test`, `npm run test:tarayici` PASS.
- [ ] **Step 5:** Commit `feat: tanı ekranında kilo ve yaş (ay)`.

### Task 3: Öneri motoru (Opus)

**Files:**
- Create: `lib/oneri.js`, `test/oneri.test.js`, örnek veri eklemeleri `test/ornek/veri/` (gerekirse)
- Modify: `ui/hastalik.js` (`gosterilebilirMi`'yi `lib/oneri.js`'ten içe al; davranış aynı)

**Interfaces:**
- Consumes: `yolKodlari` (Task 1), `kiloUyarisi` (Task 2), `onayliMi` (`lib/onay.js`), `sigirListesindeMi`, `yalnizBuzagiMi` (`ui/kub.js` — DOM'suz saf fonksiyonlar; gerekirse `lib/`'e taşı ve `ui/kub.js` yeniden dışa aktarsın).
- Produces (`lib/oneri.js`):
  - `export function gosterilebilirMi(ilac, veri): boolean` (ui/hastalik.js'teki ile aynı davranış).
  - `export function mlHesapla(mlPerKg: number, kilo: number, yerBasinaMaxMl: number|null): { ml: number, ham: number, yerSayisi: number }` — yuvarlama Global Constraints; `yerSayisi = yerBasinaMaxMl && ham > yerBasinaMaxMl ? ceil(ham / yerBasinaMaxMl) : 1`.
  - `export function urunSec(ilac, veri, yas: string): { urun, kayit, hesaplanabilir: boolean, digerSayisi: number } | null`
    Uygun: etkeni içerir, `sigirListesindeMi`, `!kayit?.belgeUyumsuz`, yas ≠ 'buzagi' ise `!yalnizBuzagiMi(u)`, `yolKodlari(ilac.yol)` ile `kayit.yollar` kesişir (iki taraftan biri boşsa elenmez). `hesaplanabilir` = `oran.guven==='yuksek'` ve (`oran.kapsam==='sigir'` ya da yas==='buzagi'). Sıra: hesaplanabilir → arınma `guven==='yuksek'` → daha az etken → metinYok sona → `ad` (tr `localeCompare`). Uygun yoksa null. `digerSayisi` = uygun sayısı − 1.
  - `export function tedaviOnerisi(h, veri, girdi): Oneri`
    `Oneri = { taslak: boolean, ilacOnerilmez: boolean, antibiyotikEndikeDegil: boolean, kilo: number|null, kiloUyari: {tur,metin}|null, gruplar: [{ sinif: string, satirlar: Satir[] }], destekleyici: string[], bakim: string[] }`
    `Satir = { ilac, etken, secim: (urunSec sonucu)|null, hesap: (mlHesapla sonucu & { ifade, cumle })|null, neden: null|'urun_yok'|'oran_yok'|'kilo_yok'|'kilo_gecersiz' }`
    - `ilacOnerilmez` = `tedaviKipi` 'yasak' ya da 'yok' → `gruplar: []`.
    - Satırlar: `sira===1` ve `gosterilebilirMi`; `antibiyotikEndikeDegil` ise `sinif==='antimikrobiyal'` atlanır. Gruplar sınıfa göre, ilk görünme sırasıyla; `antimikrobiyal` grubu varsa önce.
    - `hesap` yalnız `secim.hesaplanabilir` ve kilo geçerli (`kiloUyari?.tur !== 'gecersiz'`) iken; aksi hâlde `neden`.

- [ ] **Step 1: Failing tests** (`test/oneri.test.js`, örnek veriyle):
  - `mlHesapla(0.1, 450, null)` → `{ ml: 45, ham: 45, yerSayisi: 1 }`; `mlHesapla(0.025, 450, null).ml === 11.5` (ham 11,25 → 0,5'e); `mlHesapla(0.0333, 95, null).ml === 3.2`; `mlHesapla(0.1, 450, 20).yerSayisi === 3`.
  - `urunSec`: hesaplanabilir ürün, hesaplanamayan tek etkenliden önce gelir; yalnız-buzağı ürünü `yas:'inek'` iken seçilmez, `'buzagi'` iken seçilebilir; `kapsam:'buzagi'` oranlı ürün inekte `hesaplanabilir:false`; protokol `İntramammer` + ürün `yollar:['IM']` → seçilmez; belgeUyumsuz seçilmez.
  - `tedaviOnerisi`: taslak hastalıkta `taslak:true`, onaylıda false; tedaviKipi 'yasak' → `ilacOnerilmez:true, gruplar:[]`; sira 2 satır yok; AMEG A / yasak etken yok; kilo null → `neden:'kilo_yok'`, kilo 5 → `'kilo_gecersiz'`; ürünü olmayan etken → `secim:null, neden:'urun_yok'`; antimikrobiyal grup ilk sırada.
- [ ] **Step 2:** FAIL → **Step 3:** yaz → **Step 4:** `npm test` PASS.
- [ ] **Step 5:** Commit `feat: kiloya göre tedavi önerisi motoru`.

### Task 4: Önerilen tedavi kartı (Sonnet)

**Files:**
- Create: `ui/oneri.js`
- Modify: `ui/hastalik.js`, `style.css`, `sw.js` (`DOSYALAR`: `lib/oran.js`, `lib/hayvan.js`, `lib/oneri.js`, `ui/oneri.js`; SURUM), `test/tarayici/ekranlar.e2e.mjs`, `test/sw.test.js` (gerekirse)

**Interfaces:**
- Consumes: `tedaviOnerisi` (Task 3), `urunKarti`/`arinmaEtiketi`/`kombineBilgisi`/`AMEG` (`ui/kub.js`), `durum.girdi`, `durum.kaydet`.
- Produces: `export function oneriKarti(h, veri, durum, { yenidenCiz }): HTMLElement` (`section.oneri-kart`).

Kart (spec §8.3 taslağı): başlık "Önerilen tedavi"; taslakta `.bant.taslak-oneri` şerit; "Hayvan: İnek · 450 kg" + kart içi `#kart-kilo` (değişince `durum.girdi.kilo = kiloOku(v)`, `durum.kaydet()`, kart yeniden çizilir); grup başlığı "<sınıf adı> — 1. seçenekler" (sınıf adları: antimikrobiyal "Antimikrobiyal", nsaii "Ağrı-yangı", metabolik "Metabolik / sıvı", antiparaziter "Antiparaziter", diger "Diğer"); satır: etken adı (etken sayfasına bağlantı) · yol · not; ürün adı + `→ 45 ml` (büyük) + `(1 ml/10 kg canlı ağırlık)` + ham değer küçük + `yerSayisi>1` ise "N ayrı yere bölün"; KÜB `cumle` aynen; `urunKarti` açılır kutuları (tüm 4.9/4.11) ve arınma etiketi, kombine bilgisi; "Dozu hesaplanabilen ürün seçildi · diğer ürünler (N) ▸" (etken sayfası). `neden` metinleri: urun_yok "Listede ruhsatlı sığır ürünü yok", oran_yok "KÜB'de kiloya göre tek oran yok — KÜB metnine bakın", kilo_yok "Kilo girin, ml hesaplansın", kilo_gecersiz `kiloUyari.metin`. `ilacOnerilmez` → kart yalnız "Tedavi önerilmez — ihbar adımlarını izleyin". `antibiyotikEndikeDegil` → "Antibiyotik endike değil" satırı. Destek ve bakım kısa liste. Kapanış notu (Global Constraints). Doz/oran/cümle taşıyan her öğe `data-kub`.

`ui/hastalik.js`: kart ihbar/zoonoz/uyarı bantlarından sonra, "Tedavi kipi" satırından önce. Eski onaylı-yalnız `urunBolumu` kaldırılır; ilaç satırlarında "Doz: KÜB'e bakın …" yerine "Doz: önerilen tedavi kartında ya da ürünün KÜB'ünde" + "Ruhsatlı ürünler (N) ▸". Sayfa sonu notu: "Bu kayıt henüz hekim onayından geçmedi; öneri taslaktır."

- [ ] **Step 1: e2e testleri güncelle/ekle** (`ekranlar.e2e.mjs`, örnek veri):
  - Değişen kural: 'taslak hastalikta urun ve KUB alintisi yok' (s.232), 'hastalik: taslakta urun ve KUB Doz yok…' (s.336), 'onayli hastalikta ilac satirinin altinda urun…' (s.321), kombine (s.349) testleri kart üzerinden yeniden yazılır: taslakta kart + şerit + ürün var; onaylıda şerit yok; içerik değişince şerit geri gelir; kombine üründe "Birlikte" notu ve AMEG uyarısı kartta.
  - Yeni: kilo 450 + oranı 0,1 olan örnek ürün → kartta "45 ml" ve oran ifadesi; kilo yok → "Kilo girin" ve oran var ml yok; kart içi kiloya 300 yaz → "30 ml" ve `#/tani`'de `#kilo` değeri 300; tedaviKipi 'yasak' örnekte "Tedavi önerilmez"; yalnız-buzağı ürünü inekte kartta yok.
  - 'gercek veri: …olasilik ya da doz yok' (s.696): `mg/kg|ml/kg` denetimi `[data-kub]` öğeleri çıkarılmış metne uygulanır; "olasılı|ihtimal" denetimi aynen.
- [ ] **Step 2:** FAIL → **Step 3:** yaz (+ `style.css`: kart, şerit, büyük ml; 375 px'te yatay kaydırma yok) → **Step 4:** `npm run surum`, `npm test`, `npm run test:tarayici`, `npm run dogrula` PASS.
- [ ] **Step 5:** Commit `feat: hastalık sayfasında kiloya göre önerilen tedavi kartı`.

### Task 5: Denetim ve yayın (koordinatör + Fable K8)

- [ ] **Fable K8a — oranlar:** `oran.guven==='yuksek'` olan **tüm** ürünler için PDF (`.superpowers/kub-pdf/<urunId>.pdf`) 4.9 ile `mlPerKg`, `kapsam`, `ifade`, `cumle`, `yerBasinaMaxMl` karşılaştırılır. Ölçüt: yanlış oran = 0, sığır dışı türe ait oranın `sigir` sayılması = 0. Ayrıca rastgele 40 `dusuk` kayıttan kaçan net oran sayısı (bilgi amaçlı).
- [ ] **Fable K8b — kartlar:** 48 hastalığın kartı (inek 450 kg ve buzağı 45 kg) metin dökümüyle: yanlış ürün seçimi, yol uyumsuzluğu, yaşa uymayan ürün, protokolde 1. seçenek olmayan bir şeyin kartta görünmesi.
- [ ] Bulgular düzeltilir (Opus), Fable yeniden kontrol "YAYINLANABİLİR" der.
- [ ] Push; canlıda SURUM, kilo 450 ile akut mastitis ve sığır solunum kompleksi kartı ekran görüntüsü (375 px), konsol hatası yok.

### Task 6 (sonraki adım): mg/kg + KÜB §2 yoğunluğu (Opus) — ayrı denetim

- `lib/oran.js`: `bilesimAyir(metin)` (KÜB §2 "Her ml'de/1 ml'de W mg <etken>") ve `dozOrani(doz, { bilesim })` → `kaynak: 'mg_kg'`; yalnız tek etkenli, çözelti/süspansiyon/enjektabl, tek mg/kg değeri, birim mg (IU, tuz/baz eşdeğeri belirsizse `dusuk`).
- Testler gerçek KÜB kesitleriyle; `kub-ayikla` yeniden; Fable K9 tüm yeni `mg_kg` yüksek kayıtları PDF'le; yanlış = 0 olmadan yayın yok.
