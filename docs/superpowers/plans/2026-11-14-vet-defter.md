# Vet Defter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Belirti/ısıdan hastalık uyum yüzdesi → protokol → etken mekanizması → Türkiye'de ruhsatlı ürün zincirini sunan, çevrimdışı çalışan düz HTML PWA'yı GitHub Pages'te yayınlamak.

**Architecture:** Derlemesiz ES modülleri. Saf mantık `lib/` (puan, bayrak, arama, onay), içerik `veri/*.json`, ekranlar `ui/*.js` (hash yönlendirme). `sw.js` tüm dosyaları önbelleğe alır. Veri + `lib/` AGRIVET'e aynen taşınacak biçimde ekran kodundan bağımsız.

**Tech Stack:** HTML, CSS, vanilla JS (ES2022 modülleri), `node --test`, Playwright (sistem Chromium / yüklü `playwright`), GitHub Pages (main kökü).

**Spec:** `docs/superpowers/specs/2026-11-14-vet-defter-design.md`

## Global Constraints

- Arayüz dili Türkçe; kod tanımlayıcıları Türkçe ASCII (Küpe Sayım geleneği: `puanla`, `bayraklar`).
- Harici CDN yok; her şey depoda. Uygulama çalışırken ağ isteği yalnız kendi dosyalarına.
- 360–400 px öncelikli; WCAG AA kontrast; dokunma hedefi ≥ 44 px.
- Ekranda "olasılık" kelimesi geçmez; "uyum" ve sürekli "Hekim kararının yerine geçmez" notu.
- `onay.durum !== 'onayli'` olan hastalıkta ya da `kubDogrulandi === null` olan üründe **doz gösterilmez**; yerine "KÜB'e bakın" + bağlantı.
- Doz yalnız KÜB'den; etiket dışı / ders kitabı dozu yok.
- `sw.js` içindeki `SURUM` her yayında artar; dosya listesi tüm uygulama ve veri dosyalarını içerir.
- Tür ilk sürümde yalnız `sigir`; yaş grupları `buzagi | dana | duve | inek | boga`.
- Belirti sistemleri (enum): `genel, solunum, sindirim, meme, ureme, metabolik, deri, ayak, sinir, kan, goz`.

## Review Focus

1. **Isı girişi virgüllü ("40,6") ya da saçma (4, 406)** → virgül kabul edilir; 30–45 °C dışı reddedilir, puana katılmaz. Test: Task 4 `isiOku`.
2. **Hiç belirti seçilmeden "Sonuçları göster"** → liste yerine "Yetersiz girdi" mesajı; kırmızı bayrak kuralları yine çalışır. Test: Task 4 + Task 7 e2e.
3. **Doğrudan URL ile var olmayan hastalık/etken (`#/hastalik/yok`)** → "Bulunamadı" + Tanı'ya dönüş; boş beyaz ekran yok. Test: Task 7 e2e.
4. **Ürün listesi boş ya da etken için ürün yok** → "Bu etken için listede ruhsatlı ürün bulunamadı (liste tarihi …)"; uygulama çökmez. Test: Task 7 e2e.
5. **Çevrimdışı ikinci açılış** → tüm ekranlar ve veri ağsız açılır. Test: Task 9 e2e.

---

## Dosya düzeni

```
index.html  style.css  app.js  sw.js  manifest.webmanifest  ikon.svg ikon-192.png ikon-512.png apple-touch-icon.png
lib/ veri.js  puan.js  bayrak.js  arama.js  onay.js
ui/  tani.js  sonuc.js  hastalik.js  etken.js  listeler.js  hakkinda.js  ortak.js
veri/ meta.json belirtiler.json etkenler.json bayraklar.json ihbar.json yasaklar.json urunler.json
      hastaliklar/index.json hastaliklar/<grup>.json   (gruplar: solunum, sindirim, meme_ureme, metabolik, deri_ayak, kan_parazit, ihbar_zehir)
      sema/*.schema.json
scripts/ sunucu.mjs  dogrula.mjs  urun-cek.mjs
test/ *.test.js  vinyetler.json  tarayici/*.e2e.mjs
```

---

### Task 1: İskelet, PWA, gezinme (Sonnet)

**Files:** Create `package.json`, `index.html`, `style.css`, `app.js`, `ui/ortak.js`, `sw.js`, `manifest.webmanifest`, ikonlar, `scripts/sunucu.mjs` (Küpe Sayım'dan kopya), `.gitignore`, `README.md`, `test/tarayici/iskelet.e2e.mjs`.

**Interfaces:**
- Produces: `app.js` hash yönlendirici; rotalar `#/tani` (varsayılan), `#/sonuc`, `#/hastalik/<id>`, `#/etken/<id>`, `#/hastaliklar`, `#/ilaclar`, `#/hakkinda`. Her ekran modülü `export function render(kok: HTMLElement, veri: Veri, durum: Durum): void`. `durum` = `{ girdi: Girdi }` (Task 4 `Girdi`), `sessionStorage`'da tutulur (try/catch).
- Produces: `ui/ortak.js`: `el(tag, attrs, ...cocuklar)`, `bulunamadi(kok, mesaj)`, `sorumlulukNotu()` → "Hekim kararının yerine geçmez" öğesi.
- Alt gezinme: Tanı · Hastalıklar · İlaçlar · Hakkında. Ekranlar Task 7 gelene kadar yer tutucu.
- `package.json` scriptleri: `test` = `node --test "test/*.test.js"`, `test:tarayici` = `node --test "test/tarayici/*.e2e.mjs"`, `dogrula` = `node scripts/dogrula.mjs`, `sunucu` = `node scripts/sunucu.mjs`, `urun-cek` = `node scripts/urun-cek.mjs`.

- [ ] Step 1: e2e testi yaz: sunucuyu başlat, sayfayı 390×844'te aç; 4 gezinme düğmesi görünür; `#/hastalik/yok` → "Bulunamadı" metni; konsolda hata yok.
- [ ] Step 2: Çalıştır, FAIL gör.
- [ ] Step 3: Dosyaları yaz. `sw.js` Küpe Sayım deseninde (`SURUM = 'vet-defter-v1'`, `cache: 'reload'`, eski önbellekleri sil, navigate → `./`).
- [ ] Step 4: `npm run test:tarayici` PASS.
- [ ] Step 5: Commit `feat: iskelet, gezinme ve çevrimdışı kabuk`.

### Task 2: Veri şeması, yükleyici, onay özeti, doğrulayıcı (Opus)

**Files:** Create `veri/sema/*.schema.json`, `veri/meta.json`, `veri/yasaklar.json`, `veri/ihbar.json`, `lib/veri.js`, `lib/onay.js`, `scripts/dogrula.mjs`, `test/dogrula.test.js`, `test/onay.test.js`, `test/ornek/` (küçük tutarlı örnek veri seti).

**Interfaces:**
- Produces şekiller (spec §8 aynen; alan adları oradaki gibi). Ek: `Hastalik.grup`, `Belirti.genelSiklik ∈ (0,1)`.
- `lib/veri.js`: `export async function veriYukle(oku = (yol) => fetch(yol).then(r => r.json())): Promise<Veri>` — `Veri = { meta, belirtiler, etkenler, hastaliklar (index.json'daki tüm grup dosyaları birleşik), bayraklar, ihbar, yasaklar, urunler }`. Node testleri `oku`'yu `fs` ile verir.
- `lib/onay.js`: `export function icerikOzeti(kayit): string` — `onay` alanı hariç, anahtarları sıralı JSON'un FNV-1a 32-bit onaltılığı. `export function onayliMi(kayit): boolean` — `onay.durum === 'onayli' && onay.icerikOzeti === icerikOzeti(kayit)`.
- `scripts/dogrula.mjs`: `export function dogrula(veri: Veri): string[]` (hata listesi) + CLI (hata varsa çıkış 1). Kurallar: spec §8 sonundaki altı kural + belirti/etken/hastalık kimlik bağları + `yasaklar` içindeki etken kimliği herhangi bir `protokol.ilaclar[].etkenId`'de → hata.
- `veri/ihbar.json` / `yasaklar.json`: `{ kaynak, kaynakTarihi, ogeler: [...] }`; içerik Opus tarafından yürürlükteki mevzuattan derlenir, her ögede `dogrulandi: false`.

- [ ] Step 1: Testler: örnek veri temiz → `dogrula` boş dizi; yasak etken protokole konunca hata metni etken adını içerir; `ihbari: true` + boş `ihbarAdimlari` → hata; `tedaviKipi: 'yasak'` + dolu `ilaclar` → hata; kaynaksız ilaç satırı → hata; `onayli` ama özet tutmuyor → hata. `onay.test.js`: alan sırası değişince özet aynı, içerik değişince farklı; `onayliMi` buna uyar.
- [ ] Step 2: FAIL gör.
- [ ] Step 3: Yaz.
- [ ] Step 4: `npm test` PASS.
- [ ] Step 5: Commit `feat: veri şeması, doğrulayıcı ve onay özeti`.

### Task 3: Belirti sözlüğü, etkenler ve mekanizmalar (Opus — tıbbi içerik)

**Files:** Create `veri/belirtiler.json`, `veri/etkenler.json`, `lib/arama.js`, `test/arama.test.js`.

**Interfaces:**
- Consumes: Task 2 şemaları.
- Produces: belirti kimlikleri (ASCII snake, ör. `oksuruk`, `burun_akintisi`, `vezikul_agiz`, `salya`, `topallik`, `ani_olum`, `dogal_deliklerden_kan`, `sinirsel_belirti`, `abort`, `deri_nodulu`); `ates` ve `hipotermi` sözlükte var ama `secilebilir: false`. ~120 belirti, her biri `esAnlamlilar` ve `genelSiklik`.
- `etkenler.json`: protokollerde geçecek tüm etkenler (antimikrobiyal, antiparaziter, NSAİİ, metabolik), her birinde `ameg` (antimikrobiyalde), `mekanizma` (spec §8), `kaynak`, `onay: { durum: 'taslak' }`.
- `lib/arama.js`: `export function normalize(s: string): string` (tr küçük harf; ı/i, ş/s, ğ/g, ü/u, ö/o, ç/c birleşir), `export function belirtiAra(sorgu: string, belirtiler): Belirti[]` (ad ve eş anlamlılarda kelime başı eşleşme önce, sonra içerir; yalnız `secilebilir !== false`).

- [ ] Step 1: `arama.test.js`: `belirtiAra('oks')` ilk sonuç `oksuruk`; `belirtiAra('ÖKSÜ')` aynı; `belirtiAra('ishal')` eş anlamlıdan `diare` kaydını bulur; `ates` hiç dönmez.
- [ ] Step 2–4: FAIL → yaz → `npm test` ve `npm run dogrula` PASS.
- [ ] Step 5: Commit `feat: belirti sözlüğü, etken maddeler ve etki mekanizmaları (taslak)`.

**Fable kapısı K1:** şema + belirti sözlüğü + etken mekanizmaları incelemesi; bulgular düzeltilir, ayrı commit.

### Task 4: Uyum puanı motoru (Opus)

**Files:** Create `lib/puan.js`, `test/puan.test.js`.

**Interfaces:**
- `Girdi = { tur: 'sigir', yas: 'buzagi'|'dana'|'duve'|'inek'|'boga', baglam: { dogumSonrasi: boolean, suru: boolean, aniOlum: boolean }, isi: number|null, belirtiler: string[] }`
- `export function isiOku(metin: string): number|null` — virgül/nokta kabul; 30–45 dışı → `null`.
- `export function isiBulgusu(isi: number|null, yas): 'ates'|'hipotermi'|null` — ateş: buzağıda > 39,8, diğerlerinde > 39,3; hipotermi: < 37,8.
- `export function bulgular(girdi): string[]` — seçili belirtiler + ısı bulgusu (tekrarsız).
- `export function yetersizMi(girdi): boolean` — `bulgular(girdi).length < 3`.
- `export function puanla(girdi, veri): Sonuc[]` — `Sonuc = { id, ad, uyum: 0..100 tam sayı, bant: 'guclu'|'orta'|'zayif', skor: number, eslesen: string[], eksik: string[], celisen: string[] }`, `skor` azalan; tür/yaş uymayan ve `baglam` zorunluluğu tutmayan hastalık listede yok.

Algoritma (spec §9; katsayılar burada sabit):
- duyarlılık: kardinal 0,9 · tipik 0,6 · olasi 0,25 · listede yok 0,03.
- `skor = ln(ön) + Σ_bulgu katkı + Σ ceza`; ön: sik 3, orta 1, nadir 0,3; hastalığın `mevsim` dizisi bu ayı içeriyorsa ön ×2 (ay `veri`ye değil `puanla`ya `simdi` parametresiyle verilir: `puanla(girdi, veri, simdi = new Date())`).
- bulgu katkısı = `ln(duyarlilik / genelSiklik)`; aynı sistemdeki pozitif katkılar büyükten küçüğe 1, 0,5, 0,25… ile çarpılır (bağıntı tavanı).
- `yoklugu_dusurur` olup bulgularda olmayan beklenen belirti: `ln(0,1 / (1 − genelSiklik))`.
- `dislayicilar`dan biri bulgularda: −5 ve `celisen`'e eklenir.
- `uyum` = eşleşen beklenen belirtilerin ağırlık toplamı / tüm beklenenlerinki × 100 (kardinal 3, tipik 2, olasi 1); `celisen` doluysa bant en fazla `zayif`. Bant: ≥ 60 güçlü, 35–59 orta, < 35 zayıf.

- [ ] Step 1: Testler (`test/ornek/` verisiyle): `isiOku('40,6') === 40.6`, `isiOku('406') === null`; `isiBulgusu(39.6,'buzagi') === null`, `isiBulgusu(39.6,'inek') === 'ates'`; `yetersizMi` 2 bulguda true; **değişmez 1:** bir hastalığın beklenen belirtisini eklemek o hastalığın `skor` ve `uyum`unu düşürmez; **değişmez 2:** veri setine ilgisiz yeni hastalık eklemek mevcut hastalıkların `uyum` ve `skor`unu değiştirmez; dışlayıcı seçilince bant `zayif` ve `celisen` dolu; yaşa uymayan hastalık sonuçta yok; mevsim içi ön ağırlık sırayı öne alır.
- [ ] Step 2–4: FAIL → yaz → PASS.
- [ ] Step 5: Commit `feat: uyum puanı motoru`.

### Task 5: Kırmızı bayrak katmanı (Opus)

**Files:** Create `lib/bayrak.js`, `veri/bayraklar.json`, `test/bayrak.test.js`.

**Interfaces:**
- `veri/bayraklar.json`: `[{ id, hastalikId, kosul: { hepsi: string[], herhangi?: string[], baglam?: { aniOlum?: true, suru?: true } }, baslik, uyarilar: string[] }]` — spec §9'daki beş kural (şap, şarbon, kuduz, brusella, LSD) + gerekli gördüklerin; `onay: { durum: 'taslak' }`.
- `export function bayraklar(girdi, veri): Bayrak[]` — `Bayrak = { id, hastalikId, baslik, uyarilar }`; `bulgular(girdi)` (Task 4) üzerinden; puandan bağımsız; yetersiz girdide de çalışır.

- [ ] Step 1: Testler: `vezikul_agiz + salya + topallik` → şap bayrağı; `ani_olum` bağlamı + `dogal_deliklerden_kan` → şarbon ve uyarılarda "nekropsi" geçer; tek belirti `abort` → brusella; hiçbir kural tutmuyorsa boş dizi; kural `hastalikId`si hastalık verisinde var (dogrula kuralı olarak da eklenir).
- [ ] Step 2–5: FAIL → yaz → PASS → commit `feat: puandan bağımsız kırmızı bayrak kuralları`.

### Task 6: Hastalık içeriği (Opus ×3 paralel, gruplara bölünmüş)

**Files:** Create `veri/hastaliklar/index.json` ve yedi grup dosyası; her ajan yalnız kendi grup dosyalarına yazar. `belirtiler.json` / `etkenler.json` eksiği çıkarsa ajan dosyayı değiştirmez, eksik listesini raporlar; koordinatör tek seferde ekler.

**Interfaces:**
- Consumes: Task 2 şeması, Task 3 kimlikleri.
- Dağılım: Ajan A `solunum`, `sindirim` · Ajan B `meme_ureme`, `metabolik`, `deri_ayak` · Ajan C `kan_parazit`, `ihbar_zehir` (spec §11 listesi; ihbar listesi `veri/ihbar.json` ile tutarlı; yanıkara ihbar değil; KKKA belirti listesinde yok).
- Her hastalık: `onay: { durum: 'taslak' }`; `protokol.ilaclar[].kaynak` KÜB'e değil etkenin genel kullanımına işaret eder (`{ tur: 'KUB', urun: null, bolum: null }` → doz yok); viral/metabolikte `antibiyotikEndikeDegil: true`; `agrivetAd` (AGRIVET `islemTanimlari.ts` teşhis metnine uygun Türkçe ad).
- Uydurma kaynak yasak: kaynak bilinmiyorsa `kaynaklar: []` ve `notlar`a "kaynak eklenecek".

- [ ] Step 1: Her ajan kendi grubunu yazar; `npm run dogrula` ve `npm test` PASS.
- [ ] Step 2: Commit `content: <grup> hastalıkları (taslak)`.

**Fable kapısı K2 + K4:** (a) Fable hastalık başına 3 altın vaka yazar → `test/vinyetler.json` (`[{ ad, girdi, beklenenIlk3: hastalikId }]`); motoru yazan ajan bu dosyayı görmez. (b) Fable içerik ikinci okuması (yasak madde, ihbar, tedavi kipi, uydurma kaynak). Bulgular düzeltilir.

### Task 7: Ekranlar (Sonnet)

**Files:** Create `ui/tani.js`, `ui/sonuc.js`, `ui/hastalik.js`, `ui/etken.js`, `ui/listeler.js`, `ui/hakkinda.js`; Modify `app.js`, `style.css`; Test `test/tarayici/ekranlar.e2e.mjs`.

**Interfaces:**
- Consumes: `veriYukle`, `puanla`, `bulgular`, `yetersizMi`, `isiOku`, `bayraklar`, `belirtiAra`, `onayliMi`, `ui/ortak.js`.
- Tanı (spec §7 ekran 1): yaş düğmeleri, üç bağlam kutusu, ısı alanı (`inputmode="decimal"`), arama + sistem çipleri, seçili çipler ✕, "Sonuçları göster".
- Sonuç: bayraklar en üstte kırmızı; ardından ilk 5 `puanla` sonucu (ad, bant, `uyum%`, eşleşen/eksik); yetersiz girdide "Yetersiz girdi — belirti ekleyin"; sorumluluk notu.
- Hastalık: taslakta "taslak" etiketi; ihbar/zoonoz bandı; tedavi kipi; ilaç satırı etken sayfasına bağlanır; **doz yalnız `onayliMi(hastalik) && urun.kubDogrulandi`**.
- Etken: "Nasıl çalışır" (hedef, etki, tür, spektrum, direnç, etkileşimler), AMEG uyarısı (A: gıda hayvanında kullanılmaz; B: antibiyogramsız ilk seçenek olmaz), ruhsatlı ürünler (`urunler` içinde `etkenler` bu kimliği içeren ve `hedefTurler` sığırı içerenler), liste tarihi; ürün yoksa Review Focus 4 metni.
- Hastalıklar A–Z (arama kutulu), İlaçlar (etken arama), Hakkında (kaynaklar, liste tarihi, katsayıların uzman tahmini olduğu, sorumluluk).

- [ ] Step 1: e2e: 3 belirti seç → Sonuçlar'da en az bir sonuç ve "uyum" metni, sayfada "olasılık" yok; `vezikul_agiz + salya + topallik` → üstte şap bandı; belirti seçmeden → "Yetersiz girdi"; taslak hastalıkta "mg/kg" metni yok; etken sayfasında "Nasıl çalışır"; `#/etken/yok` → "Bulunamadı"; 390 px'te yatay kaydırma yok.
- [ ] Step 2–4: FAIL → yaz → PASS.
- [ ] Step 5: Commit `feat: tanı, sonuç, hastalık, etken ve liste ekranları`.

### Task 8: Ruhsatlı ürün listesi çekme (Sonnet)

**Files:** Create `scripts/urun-cek.mjs`, `veri/urunler.json`; Modify `veri/meta.json` (`urunListesiTarihi`).

**Interfaces:**
- Kaynak `https://hbs.tarbil.gov.tr/Receipt/SearchProduct`; önce sayfanın arama isteğini incele (form POST / JSON uç noktası). Hedef tür sığır + `etkenler.json`'daki her etken için sorgu; istekler arası ≥ 2 sn; tek seferlik.
- Çıktı spec §8 `urunler` şekli; `kub: []`, `kubDogrulandi: null`, `kubUrl` sonuçtaki KÜB bağlantısı, `cekilmeTarihi` ISO.
- Site erişilemez/engelliyse: `urunler.json = []`, `meta.urunListesiTarihi = null`, raporla; betik `--dosya <kaydedilmis.html>` ile elle kaydedilmiş sonuçtan da üretebilir.

- [ ] Step 1: Betik yaz, çalıştır; `npm run dogrula` PASS (ürün etken kimlikleri `etkenler.json`'da var).
- [ ] Step 2: Commit `data: ruhsatlı ürün listesi (<tarih>)`.

### Task 9: Vinyet testi, uçtan uca, çevrimdışı, yayın (Sonnet)

**Files:** Create `test/vinyet.test.js`, `test/tarayici/cevrimdisi.e2e.mjs`; Modify `sw.js` (`DOSYALAR` tam liste, `SURUM` artır), `README.md`.

- [ ] Step 1: `vinyet.test.js`: `test/vinyetler.json`'daki vakaların ≥ %80'inde `beklenenIlk3` ilk 3'te; her başarısız vaka adıyla raporlanır. Altında kalırsa katsayılar değil **içerik** (belirti ağırlıkları) Opus'a geri gider.
- [ ] Step 2: `cevrimdisi.e2e.mjs`: ilk açılış → SW hazır → ağ kesik → yeniden yükle → Tanı, bir hastalık ve bir etken sayfası açılır.
- [ ] Step 3: `npm test`, `npm run dogrula`, `npm run test:tarayici` hepsi PASS.
- [ ] Step 4: GitHub'da `AkcsH7nt/vet-defter` (public) oluştur, `main`'i it, Pages'i `main` / kök olarak aç; yayın adresinde sayfa 200 döner ve Tanı ekranı görünür.
- [ ] Step 5: Commit + push `chore: ilk yayın`.

**Fable kapısı K6:** yayındaki sürümde spec §4 anti-hedef denetimi; bulgular düzeltilip yeniden yayınlanır. Son tıbbi onay kullanıcıda.

## Sonraki sürüm (bu planın dışı)

KÜB'den doz/arınma çıkarımı (Opus) + K5 örneklem denetimi; hekim onay ekranı/iş akışı; koyun-keçi; AGRIVET birleşmesi.
