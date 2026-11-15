// Ekranlar e2e: örnek veri (test/ornek/veri) ile Tanı → Sonuç → Hastalık → Etken akışı.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { sunucuBaslat } from '../../scripts/sunucu.mjs';

const KOK = fileURLToPath(new URL('../..', import.meta.url));
const ORNEK = join(KOK, 'test/ornek/veri');
let sunucu, tarayici, adres;

before(async () => {
  sunucu = await sunucuBaslat(0);
  adres = `http://localhost:${sunucu.address().port}/`;
  tarayici = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await tarayici?.close();
  sunucu?.close();
});

/**
 * Yeni sayfa. ornek: veri/* istekleri örnek veriye yönlenir; degistir(yol, json) → json ile değiştirilmiş yanıt.
 */
async function sayfaAc({ ornek = true, degistir = () => undefined, genislik = 390 } = {}) {
  const baglam = await tarayici.newContext({ viewport: { width: genislik, height: 844 }, serviceWorkers: 'block' });
  const sayfa = await baglam.newPage();
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(String(e)));
  sayfa.on('console', (m) => { if (m.type() === 'error') hatalar.push(m.text()); });
  if (ornek) {
    await sayfa.route('**/veri/**', async (r) => {
      const yol = new URL(r.request().url()).pathname.replace(/^.*\/veri\//, '');
      const dosya = join(ORNEK, yol);
      if (!existsSync(dosya)) return r.fulfill({ status: 404, body: 'yok' });
      let json = JSON.parse(readFileSync(dosya, 'utf8'));
      json = degistir(yol, json) ?? json;
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(json) });
    });
  }
  sayfa.hatalar = hatalar;
  sayfa.git = async (hash) => { await sayfa.goto(adres + hash); await sayfa.waitForSelector('main h1'); };
  return sayfa;
}

const metin = (s) => s.locator('main').innerText();

async function belirtiSec(sayfa, sorgu, id) {
  await sayfa.fill('#ara', sorgu);
  await sayfa.click(`.belirti-dugme[data-belirti="${id}"]`);
  await sayfa.fill('#ara', '');
}

test('uc belirti secince sonuc ve uyum gorunur, olasilik yok', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  await s.click('[data-yas="buzagi"]');
  await belirtiSec(s, 'öksürük', 'oksuruk');
  await belirtiSec(s, 'burun', 'burun_akintisi');
  await belirtiSec(s, 'solunum güç', 'solunum_guclugu');
  assert.equal(await s.locator('.cip-secili').count(), 3);
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  const t = await metin(s);
  assert.match(t, /uyum \d+%/);
  assert.doesNotMatch(t, /null|undefined/);
  assert.ok(await s.locator('.sonuc').count() >= 1);
  assert.match(t, /Örnek solunum/);
  assert.doesNotMatch((await s.locator('body').innerText()).toLocaleLowerCase('tr'), /olasılı|ihtimal/);
  assert.match(await s.locator('.sabit-not').innerText(), /Hekim kararının yerine geçmez/);
  assert.deepEqual(s.hatalar, []);
});

test('secili cipin x dugmesi belirtiyi kaldirir; isi virgullu okunur', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  await belirtiSec(s, 'öksürük', 'oksuruk');
  await s.click('.cip-secili[data-secili="oksuruk"]');
  assert.equal(await s.locator('.cip-secili').count(), 0);
  await s.fill('#isi', '40,6');
  assert.match(await s.locator('#isi-ipucu').innerText(), /ateş/);
  assert.equal(await s.getAttribute('#isi', 'inputmode'), 'decimal');
  await s.fill('#isi', '406');
  assert.match(await s.locator('#isi-ipucu').innerText(), /30–45/);
});

test('sap belirtileri ustte kirmizi bayrak gosterir', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  await belirtiSec(s, 'kabarcık', 'vezikul_agiz');
  await belirtiSec(s, 'salya', 'salya');
  await belirtiSec(s, 'topallık', 'topallik');
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  // Başlık ve tek satırlık sıralama açıklamasından hemen sonra bayrak bölümü gelir; sonuç listesinden önce.
  const sira = await s.evaluate(() => [...document.querySelectorAll('main > *:not(#girdi-ozeti)')].map((e) => e.className || e.tagName));
  assert.deepEqual(sira.slice(0, 3), ['H1', 'aciklama soluk', 'bayraklar']);
  assert.match(await s.locator('.bayraklar').innerText(), /ŞAP ŞÜPHESİ — İHBAR EDİN/);
  assert.ok(await s.locator('.bayrak').count() >= 1);
  await s.click('.bayrak >> nth=0');
  await s.waitForSelector('main h1:has-text("ihbarlı")');
  assert.match(await metin(s), /İhbarı mecburi — bildirin/);
});

test('ayni hastalikta birden cok bayrak tek bant, uyarilar tekrarsiz', async () => {
  const ikinci = (yol, json) => (yol === 'bayraklar.json' ? [...json, {
    id: 'ornek_ihbar_bayragi_2',
    hastalikId: 'ornek_ihbar',
    kosul: { herhangi: ['vezikul_agiz'] },
    baslik: 'ÖRNEK VEZİKÜLER HASTALIK ŞÜPHESİ',
    uyarilar: ['Örnek uyarı: hayvanı ayırın', 'Örnek uyarı: veziküller her zaman ihbar şüphesidir'],
    onay: { durum: 'taslak' },
  }] : undefined);
  const s = await sayfaAc({ degistir: ikinci });
  await s.git('#/tani');
  await belirtiSec(s, 'kabarcık', 'vezikul_agiz');
  await belirtiSec(s, 'salya', 'salya');
  await belirtiSec(s, 'topallık', 'topallik');
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  assert.equal(await s.locator('.bayrak').count(), 1);
  const bant = await s.locator('.bayrak').innerText();
  assert.match(bant, /ÖRNEK ŞAP ŞÜPHESİ — İHBAR EDİN/);
  assert.doesNotMatch(bant, /VEZİKÜLER HASTALIK ŞÜPHESİ/);
  assert.equal(bant.split('Örnek uyarı: hayvanı ayırın').length - 1, 1);
  assert.match(bant, /hayvan hareketini durdurun/);
  assert.match(bant, /veziküller her zaman ihbar şüphesidir/);
  assert.equal(await s.locator('.bayrak li').count(), 3);
  assert.deepEqual(s.hatalar, []);
});

test('gercek veri: yalniz Ani olum kutusu sarbon bandini gosterir', async () => {
  const s = await sayfaAc({ ornek: false });
  await s.git('#/tani');
  await s.click('[data-yas="dana"]');
  await s.check('[data-baglam="aniOlum"]');
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  const bant = await s.locator('.bayraklar').innerText();
  assert.match(bant, /ŞARBON|ANİ ÖLÜM/);
  assert.match(bant, /[Nn]ekropsi/);
  assert.match(await metin(s), /Yetersiz girdi/);
  assert.deepEqual(s.hatalar, []);
});

test('sonuc: siralama aciklamasi ve Yeni vaka girdiyi temizleyip Taniya doner', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  await s.click('[data-yas="buzagi"]');
  await s.check('[data-baglam="suru"]');
  await s.fill('#isi', '40,6');
  await belirtiSec(s, 'öksürük', 'oksuruk');
  await belirtiSec(s, 'burun', 'burun_akintisi');
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  assert.match(await metin(s), /Sıralama hastalığın sıklığını da hesaba katar; yüzde, o hastalıkta beklenen bulguların ne kadarının görüldüğüdür\./);
  await s.click('#yeni-vaka');
  await s.waitForSelector('main h1:text-is("Tanı")');
  assert.equal(await s.locator('.cip-secili').count(), 0);
  assert.equal(await s.inputValue('#isi'), '');
  assert.equal(await s.isChecked('[data-baglam="suru"]'), false);
  assert.equal(await s.locator('.secenek[data-yas="inek"][aria-pressed="true"]').count(), 1);
  // Yenilemeden sonra da boş (sessionStorage temizlendi).
  await s.reload();
  await s.waitForSelector('main h1:text-is("Tanı")');
  assert.equal(await s.locator('.cip-secili').count(), 0);
  assert.deepEqual(s.hatalar, []);
});

test('gercek veri: Sonuclari goster kaydirmadan gorunur, sistem listesi acikken de', async () => {
  const s = await sayfaAc({ ornek: false });
  await s.git('#/tani');
  const gorunurMu = async () => s.evaluate(() => {
    const k = document.querySelector('#goster').getBoundingClientRect();
    const not = document.querySelector('.sabit-not').getBoundingClientRect();
    return k.top >= 0 && k.bottom <= not.top + 0.5 && k.height >= 44;
  });
  assert.ok(await gorunurMu(), 'boş formda görünmüyor');
  await s.click('.cipler .secenek:text-is("Genel")');
  assert.ok(await s.locator('.belirti-liste.iki-sutun .belirti-dugme').count() > 10);
  assert.ok(await gorunurMu(), 'Genel listesi açıkken görünmüyor');
  await s.mouse.wheel(0, 600);
  assert.ok(await gorunurMu(), 'kaydırınca görünmüyor');
  // Seçili bulgu sayısı düğmede yazar; aramadan seçince kutu temizlenir.
  await s.fill('#ara', 'öksürük');
  await s.click('.belirti-dugme[data-belirti="oksuruk"]');
  assert.equal(await s.inputValue('#ara'), '');
  assert.match(await s.locator('#goster').innerText(), /Sonuçları göster \(1 bulgu\)/);
  const [sw, iw] = await s.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(sw <= iw, `scrollWidth ${sw} > ${iw}`);
  assert.deepEqual(s.hatalar, []);
});

test('ates aranirsa isidan hesaplandigi soylenir; gecersiz isi metni geri donunce kalir', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  await s.fill('#ara', 'ateş');
  assert.match(await s.locator('#isi-notu').innerText(), /vücut ısısından hesaplanır/);
  await s.fill('#ara', '');
  await s.fill('#isi', '406');
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  await s.click('text=◂ Girdiyi düzenle');
  await s.waitForSelector('main h1:text-is("Tanı")');
  assert.equal(await s.inputValue('#isi'), '406');
  assert.match(await s.locator('#isi-ipucu').innerText(), /30–45/);
});

test('gercek veri: Rift bulgulari surusuz de ihbar bandi gosterir', async () => {
  // final-review C1: "Birden çok hayvan" işaretsizken Rift sıralamadan düşer; ihbar şüphesi yine bantta.
  const s = await sayfaAc({ ornek: false });
  await s.git('#/tani');
  await s.fill('#isi', '41');
  for (const [q, id] of [['yavru', 'abort'], ['kanlı ishal', 'kanli_diare'], ['sarılık', 'sarilik']]) await belirtiSec(s, q, id);
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  assert.ok(await s.locator('.bayrak').count() >= 1);
  assert.match(await s.locator('.bayraklar').innerText(), /İHBAR|BİLDİR|bildirin/);
  assert.deepEqual(s.hatalar, []);
});

test('belirti secmeden yetersiz girdi', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  assert.match(await metin(s), /Yetersiz girdi — belirti ekleyin/);
});

test('taslak hastalikta taslak etiketi ve oneri karti serit var, onayli hastalikta serit yok', async () => {
  const s = await sayfaAc();
  await s.git('#/hastalik/ornek_ishal');
  assert.doesNotMatch(await metin(s), /mg\/kg/);
  assert.ok(await s.locator('h1 .etiket').isVisible());
  assert.match(await s.locator('.oneri-kart .bant.taslak-oneri').innerText(), /Taslak öneri — hekim onayından geçmedi/);
  // onaylı hastalık: etiket ve şerit yok
  await s.git('#/hastalik/ornek_solunum');
  assert.equal(await s.locator('h1 .etiket').count(), 0);
  assert.equal(await s.locator('.taslak-oneri').count(), 0);
});

// --- KÜB alıntıları ve arınma etiketleri (spec §15) ---
const kubDegis = (urunKub) => (yol, j) => (yol === 'kub.json'
  ? { ...j, urunler: { ...j.urunler, ...(typeof urunKub === 'function' ? urunKub(j.urunler) : urunKub) } } : undefined);
const ornekKayit = (j, sigir, ekstra = {}) => ({ ...j['ornek-u1'], sigir: { ...j['ornek-u1'].sigir, ...sigir }, ...ekstra });
const taslakYap = (yol, j) => (yol === 'hastaliklar/solunum.json'
  ? j.map((h) => ({ ...h, onay: { durum: 'taslak' } })) : undefined);

test('etken: KUB Doz kutusu kapali gelir, acilinca metin aynen ve paragrafli', async () => {
  const s = await sayfaAc();
  await s.git('#/etken/ornek_antibiyotik');
  const kutu = s.locator('details.kub-kutu:has(summary:text-is("KÜB: Doz"))');
  assert.equal(await kutu.getAttribute('open'), null);
  assert.equal(await s.locator('details.kub-kutu:has(summary:text-is("KÜB: Arınma"))').count(), 1);
  await kutu.locator('summary').click();
  const alinti = kutu.locator('.kub-metin');
  assert.match(await alinti.innerText(), /Kas içi yolla 10 mg\/kg canlı ağırlık dozda uygulanır\.\nİlk uygulamadan 24 saat/);
  assert.equal(await alinti.evaluate((n) => getComputedStyle(n).whiteSpace), 'pre-line');
  assert.match(await alinti.evaluate((n) => n.textContent), /sonra tekrarlanabilir\.\n\nTedavi 3-5 gün/);
  assert.match(await metin(s), /KÜB'den alıntı/);
  assert.ok((await kutu.locator('summary').boundingBox()).height >= 44);
  assert.deepEqual(s.hatalar, []);
});

test('etken: KUB metni HTML olarak yorumlanmaz', async () => {
  const s = await sayfaAc({ degistir: kubDegis((u) => ({ 'ornek-u1': { ...u['ornek-u1'], doz: '<img src=x onerror=window.xss=1><b>kalın</b>' } })) });
  await s.git('#/etken/ornek_antibiyotik');
  assert.equal(await s.locator('.kub-metin img, .kub-metin b').count(), 0);
  assert.equal(await s.evaluate(() => window.xss), undefined);
  assert.match(await s.locator('.kub-metin').first().evaluate((n) => n.textContent), /<img src=x/);
});

test('etken: yuksek guvende arinma etiketi ve otomatik okundu notu', async () => {
  const s = await sayfaAc();
  await s.git('#/etken/ornek_antibiyotik');
  const e = await s.locator('.arinma-etiket').innerText();
  assert.match(e, /Et 28 gün/);
  assert.match(e, /Süt 7 gün/);
  assert.match(e, /KÜB'den otomatik okundu — metinle karşılaştırın/);
});

test('etken: etiket bicimleri (0 gun, saat, kullanilmaz, belirtilmemis, null)', async () => {
  const oku = async (sigir) => {
    const s = await sayfaAc({ degistir: kubDegis((u) => ({ 'ornek-u1': ornekKayit(u, sigir) })) });
    await s.git('#/etken/ornek_antibiyotik');
    return (await s.locator('.arinma-etiket').count()) ? s.locator('.arinma-etiket').innerText() : '';
  };
  assert.match(await oku({ et_gun: 0 }), /Et 0 gün/);
  assert.match(await oku({ sut: { saat: 36 } }), /Süt 36 saat/);
  assert.match(await oku({ sut: { saat: 0 } }), /Süt 0 gün/);
  assert.match(await oku({ sut: 'kullanilmaz' }), /Süt: sağmal inekte kullanılmaz/);
  assert.match(await oku({ sut: 'belirtilmemis' }), /Süt: KÜB'de belirtilmemiş/);
  const sutsuz = await oku({ sut: null });
  assert.match(sutsuz, /Et 28 gün/);
  assert.doesNotMatch(sutsuz, /Süt/);
});

test('etken: dusuk guvende sayi yok, KUB metni var', async () => {
  const s = await sayfaAc({ degistir: kubDegis((u) => ({ 'ornek-u1': ornekKayit(u, { guven: 'dusuk' }) })) });
  await s.git('#/etken/ornek_antibiyotik');
  assert.equal(await s.locator('.arinma-etiket').count(), 0);
  const t = await metin(s);
  assert.doesNotMatch(t, /Et 28 gün|Süt 7 gün|otomatik okundu/);
  assert.equal(await s.locator('details.kub-kutu').count(), 2);
});

test('etken: metinYok urunde KUBe bakin, kutu yok; kayitsiz urunde de', async () => {
  const s = await sayfaAc({ degistir: kubDegis((u) => ({ 'ornek-u1': ornekKayit(u, {}, { doz: null, arinma: null, metinYok: true }) })) });
  await s.git('#/etken/ornek_antibiyotik');
  assert.match(await metin(s), /KÜB'e bakın/);
  assert.equal(await s.locator('details.kub-kutu').count(), 0);
  assert.equal(await s.locator('.arinma-etiket').count(), 0);
  const s2 = await sayfaAc({ degistir: (yol, j) => (yol === 'kub.json' ? { ...j, urunler: {} } : undefined) });
  await s2.git('#/etken/ornek_antibiyotik');
  assert.match(await metin(s2), /KÜB'e bakın/);
  assert.equal(await s2.locator('details.kub-kutu').count(), 0);
});

// Oran (ml/kg) taşıyan örnek KÜB kaydı: 0,1 ml/kg → 450 kg'da 45 ml.
const ORAN = { mlPerKg: 0.1, kaynak: 'ml_kg', guven: 'yuksek', kapsam: 'sigir', ifade: '1 ml/10 kg canlı ağırlık',
  cumle: 'Her 10 kg canlı ağırlık için 1 ml, kas içi yolla uygulanır.' };
const oranli = kubDegis((u) => ({ 'ornek-u1': { ...u['ornek-u1'], yollar: ['IM'], oran: ORAN } }));
// ornek_solunum yaş grupları buzağı / dana: ml beklenen testler dana seçer (inek seçiliyken kart "yaş uymuyor" der).
const kiloGir = async (s, k, yas = 'dana') => {
  await s.git('#/tani');
  if (yas) await s.click(`[data-yas="${yas}"]`);
  await s.fill('#kilo', String(k));
};
const kartaGec = async (s, id = 'ornek_solunum') => {
  await s.evaluate((h) => { location.hash = h; }, `#/hastalik/${id}`);
  await s.waitForSelector('.oneri-kart');
};
const kartDisiMetin = (s) => s.evaluate(() => { const m = document.querySelector('main').cloneNode(true); m.querySelectorAll('[data-kub], details.kub-kutu').forEach((n) => n.remove()); return m.innerText; });

test('hastalik: onayli hastalikta kartta urun, KUB Doz ve arinma var; ilac satirinda yonlendirme', async () => {
  const s = await sayfaAc();
  await s.git('#/hastalik/ornek_solunum');
  const kart = s.locator('.oneri-kart');
  // B12: tek açılır "KÜB ▸" (Doz ve Arınma alt başlıklı); firma adı kartta yok
  assert.equal(await kart.locator('details.kub-kutu').count(), 1);
  assert.ok(await kart.locator('details.kub-kutu:has(summary:text-is("KÜB ▸"))').isVisible());
  assert.match(await kart.innerText(), /Antimikrobiyal — aşağıdakilerden BİRİ/);
  assert.match(await kart.innerText(), /Örnek Ürün %10 \(test\)/);
  assert.doesNotMatch(await kart.innerText(), /Örnek Firma/);
  assert.match(await kart.innerText(), /Et 28 gün/);
  assert.match(await kart.innerText(), /Doz ürünün KÜB'ünden otomatik hesaplandı — uygulamadan önce ürün etiketi\/KÜB ile karşılaştırın\./);
  await kart.locator('summary:text-is("KÜB ▸")').click();
  assert.deepEqual(await kart.locator('details.kub-kutu h4').allInnerTexts(), ['Doz', 'Arınma']);
  assert.match(await kart.locator('.kub-metin').first().innerText(), /10 mg\/kg/);
  assert.match(await kart.locator('.kub-metin').nth(1).innerText(), /Süt için: sığırlarda 7 gün/);
  // onaylı hastalıkta grup başlığında taslak rozeti yok
  assert.equal(await kart.locator('h3.grup-baslik .etiket').count(), 0);
  // ilaç satırı: doz kartta ya da KÜB'de, ürün kartı yok
  const satir = s.locator('li.ilac').first();
  assert.match(await satir.innerText(), /Doz: önerilen tedavi kartında ya da ürünün KÜB'ünde/);
  assert.match(await satir.innerText(), /Ruhsatlı ürünler \(1\) ▸/);
  assert.equal(await satir.locator('details').count(), 0);
  assert.doesNotMatch(await kartDisiMetin(s), /mg\/kg|ml\/kg/);
  assert.deepEqual(s.hatalar, []);
});

test('hastalik: taslakta kart, serit ve urun var; icerik degisince serit geri gelir', async () => {
  const s = await sayfaAc({ degistir: taslakYap });
  await s.git('#/hastalik/ornek_solunum');
  const kart = s.locator('.oneri-kart');
  assert.match(await kart.locator('.bant.taslak-oneri').innerText(), /Taslak öneri — hekim onayından geçmedi/);
  assert.match(await kart.innerText(), /Örnek Ürün %10 \(test\)/);
  assert.equal(await kart.locator('details.kub-kutu').count(), 1);
  // B12: taslakta grup başlıklarında küçük "taslak" rozeti
  const gruplar = await kart.locator('h3.grup-baslik').count();
  assert.ok(gruplar > 0);
  assert.equal(await kart.locator('h3.grup-baslik .etiket').count(), gruplar);
  assert.equal((await kart.locator('h3.grup-baslik .etiket').first().innerText()).trim(), 'taslak');
  assert.match(await metin(s), /Bu kayıt henüz hekim onayından geçmedi; öneri taslaktır\./);
  assert.doesNotMatch(await kartDisiMetin(s), /mg\/kg|ml\/kg/);
  // onaylı hastalık bozulunca (içerik değişti) onay düşer, şerit geri gelir
  const bozuk = (yol, j) => (yol === 'hastaliklar/solunum.json' ? j.map((h) => ({ ...h, ad: `${h.ad} değişti` })) : undefined);
  const s2 = await sayfaAc({ degistir: bozuk });
  await s2.git('#/hastalik/ornek_solunum');
  assert.match(await s2.locator('.oneri-kart .bant.taslak-oneri').innerText(), /Taslak öneri/);
  assert.match(await metin(s2), /taslak/);
});

test('hastalik: kombine urunde Birlikte notu ve AMEG uyarisi kartta; ikinci satir ayni urun', async () => {
  const degis = (yol, j) => {
    if (yol === 'etkenler.json') return j.map((e) => (e.id === 'ornek_nsaii' ? { ...e, ameg: 'B' } : e));
    if (yol === 'urunler.json') {
      return [{ ...j[0], urunId: 'ornek-komb', ad: 'Kombine Ürün (test)', etkenler: ['ornek_antibiyotik', 'ornek_nsaii'], hedefTurler: ['sigir'] }];
    }
    // KÜB metni olmayan ürün kartta seçilmez (B2): kombine ürüne örnek KÜB kaydı
    if (yol === 'kub.json') return { ...j, urunler: { ...j.urunler, 'ornek-komb': j.urunler['ornek-u1'] } };
    return undefined;
  };
  const s = await sayfaAc({ degistir: degis });
  await s.git('#/hastalik/ornek_solunum');
  const urun = s.locator('.oneri-kart li.urun', { hasText: 'Kombine Ürün (test)' });
  assert.equal(await urun.count(), 1);
  const t = await urun.innerText();
  assert.match(t, /Birlikte: Örnek NSAİİ \(test\) \(AMEG B\)/);
  assert.match(t, /AMEG B .*Antibiyogramsız ilk seçenek olmaz/);
  // NSAİİ satırı aynı ürünle verilir: ml yok, ürün kartı ikinci kez yok
  assert.match(await s.locator('.oneri-kart').innerText(), /Aynı ürün: Örnek antibiyotik \(test\) satırındaki ürün bu etkeni de içerir — ayrıca verilmez/);
});

test('hastalik: kartta satir basina tek urun, digerleri etken sayfasina yonlendirilir', async () => {
  const cok = (yol, j) => (yol === 'urunler.json'
    ? [...j, ...Array.from({ length: 6 }, (_, i) => ({ ...j[0], urunId: `ek-${i}`, ad: `Ek Ürün ${i}` }))] : undefined);
  const s = await sayfaAc({ degistir: cok });
  await s.git('#/hastalik/ornek_solunum');
  assert.equal(await s.locator('.oneri-kart li.urun').count(), 1);
  assert.match(await s.locator('.oneri-kart').innerText(), /Diğer ürünler \(6\) ▸/);
  assert.match(await s.locator('li.ilac').first().innerText(), /Ruhsatlı ürünler \(7\) ▸/);
});

test('oneri: kilo 450 ve oran 0,1 → 45 ml, oran ifadesi ve KUB cumlesi', async () => {
  const s = await sayfaAc({ degistir: oranli });
  await kiloGir(s, 450);
  await kartaGec(s);
  const kart = s.locator('.oneri-kart');
  assert.match(await kart.innerText(), /Hayvan: Dana \(besi\) · 450 kg/);
  assert.equal((await kart.locator('.ml-buyuk').first().innerText()).trim(), '→ 45 ml');
  // B7: tek uygulama, tekrar ve süre KÜB'de; B4: ürünün kendi yolu
  assert.match(await kart.locator('.ml-satir').innerText(), /→ 45 ml \(bir uygulama\)/);
  assert.match(await kart.innerText(), /Tekrar ve süre: KÜB: Doz/);
  assert.match(await kart.innerText(), /Bu ürün: kas içi/);
  assert.match(await kart.innerText(), /\(1 ml\/10 kg canlı ağırlık\)/);
  assert.match(await kart.locator('.kub-cumle').innerText(), /Her 10 kg canlı ağırlık için 1 ml, kas içi yolla uygulanır\./);
  assert.equal(await kart.locator('.ml-buyuk').first().evaluate((n) => !!n.closest('[data-kub]')), true);
  assert.equal(await kart.locator('.kub-cumle').getAttribute('data-kub'), '');
  assert.doesNotMatch(await kartDisiMetin(s), /mg\/kg|ml\/kg/);
  assert.deepEqual(s.hatalar, []);
});

test('oneri: kilo yok → Kilo girin, oran var ml yok; kart ici kilo tani ekranina yansir', async () => {
  const s = await sayfaAc({ degistir: oranli });
  await s.git('#/tani');
  await s.click('[data-yas="dana"]');
  await kartaGec(s);
  const kart = s.locator('.oneri-kart');
  assert.match(await kart.innerText(), /Kilo girin, ml hesaplansın/);
  assert.equal(await kart.locator('.ml-buyuk').count(), 0);
  await s.fill('#kart-kilo', '300');
  assert.equal((await kart.locator('.ml-buyuk').first().innerText()).trim(), '→ 30 ml');
  assert.match(await kart.innerText(), /Hayvan: Dana \(besi\) · 300 kg/);
  await s.evaluate(() => { location.hash = '#/tani'; });
  await s.waitForSelector('main h1:text-is("Tanı")');
  assert.equal(await s.inputValue('#kilo'), '300');
  await s.reload();
  await s.waitForSelector('main h1');
  assert.equal(await s.inputValue('#kilo'), '300');
});

test('oneri: oran yok → KUB metnine bakin; yumusak kilo uyarisi ml hesaplar; gecersiz kilo ml vermez', async () => {
  const s = await sayfaAc();
  await kiloGir(s, 450);
  await kartaGec(s);
  assert.match(await s.locator('.oneri-kart').innerText(), /KÜB'de kiloya göre tek oran yok — KÜB metnine bakın/);
  // B11: oran yok nötr (sarı uyarı değil)
  assert.equal(await s.locator('.oneri-kart .oneri-uyari').count(), 0);
  const s2 = await sayfaAc({ degistir: oranli });
  await kiloGir(s2, 300, 'buzagi');
  await kartaGec(s2);
  assert.match(await s2.locator('.oneri-kart .oneri-uyari').innerText(), /Kilo yaş grubuyla uyumsuz görünüyor, kontrol edin/);
  assert.equal((await s2.locator('.oneri-kart .ml-buyuk').first().innerText()).trim(), '→ 30 ml');
  await s2.fill('#kart-kilo', '5');
  assert.match(await s2.locator('.oneri-kart').innerText(), /Kilo olağan dışı, kontrol edin/);
  assert.equal(await s2.locator('.oneri-kart .ml-buyuk').count(), 0);
});

test('oneri: tedavi kipi yasak → Tedavi onerilmez; yalniz-buzagi urunu inekte kartta yok', async () => {
  const s = await sayfaAc();
  await s.git('#/hastalik/ornek_sarbon');
  const kart = s.locator('.oneri-kart');
  assert.match(await kart.innerText(), /Tedavi önerilmez — ihbar adımlarını izleyin/);
  assert.equal(await kart.locator('li.urun').count(), 0);
  // B11: ilaç önerilmiyorsa kapanış doz notu yok
  assert.doesNotMatch(await kart.innerText(), /Doz ürünün KÜB'ünden otomatik hesaplandı/);
  const buzagi = (yol, j) => (yol === 'urunler.json' ? j.map((u) => ({ ...u, hedefTurler: ['buzagi'] })) : undefined);
  const s2 = await sayfaAc({ degistir: buzagi });
  await s2.git('#/hastalik/ornek_solunum');
  assert.equal(await s2.locator('.oneri-kart li.urun').count(), 0);
  assert.match(await s2.locator('.oneri-kart').innerText(), /Listede ruhsatlı sığır ürünü yok/);
  // buzağı seçilince aynı ürün kartta
  await s2.evaluate(() => { location.hash = '#/tani'; });
  await s2.waitForSelector('main h1:text-is("Tanı")');
  await s2.click('[data-yas="buzagi"]');
  await kartaGec(s2);
  assert.equal(await s2.locator('.oneri-kart li.urun').count(), 1);
});

// --- K8 düzeltme dalgası B (kart) ---
const hastalikDegis = (dosya, id, fn) => (yol, j) => (yol === `hastaliklar/${dosya}.json` ? j.map((h) => (h.id === id ? fn(h) : h)) : undefined);
const u1Degis = (fn) => kubDegis((u) => ({ 'ornek-u1': fn(u['ornek-u1']) }));

test('oneri B1: hastaligin yas grubuna uymayan hayvanda kart basinda uyari, urun var ml yok', async () => {
  const s = await sayfaAc({ degistir: oranli });
  await kiloGir(s, 450, 'inek');
  await kartaGec(s);
  const kart = s.locator('.oneri-kart');
  assert.match(await kart.locator('.oneri-uyari').first().innerText(),
    /^Bu hastalık buzağı\/dana \(besi\) hastalığı — seçili hayvan: inek\. Hayvanı düzeltin\.$/);
  assert.equal(await kart.locator('li.urun').count(), 1);
  assert.equal(await kart.locator('.ml-buyuk').count(), 0);
  assert.match(await kart.innerText(), /Yaş grubu bu hastalığa uymuyor — ml hesaplanmadı/);
  assert.deepEqual(s.hatalar, []);
});

test('oneri B5: BIRI basliginda satirlar arasinda ya da; metabolikte gerektiginde birlikte; digerde secenekler', async () => {
  const ikiAb = hastalikDegis('solunum', 'ornek_solunum', (h) => ({
    ...h, protokol: { ...h.protokol, ilaclar: h.protokol.ilaclar.map((i) => ({ ...i, sinif: 'antimikrobiyal' })) },
  }));
  const s = await sayfaAc({ degistir: ikiAb });
  await s.git('#/hastalik/ornek_solunum');
  const kart = s.locator('.oneri-kart');
  assert.match(await kart.locator('h3.grup-baslik').first().innerText(), /^Antimikrobiyal — aşağıdakilerden BİRİ/);
  const liste = kart.locator('ul.oneri-liste').first();
  assert.equal(await liste.locator(':scope > li.oneri-satir').count(), 2);
  assert.equal(await liste.locator(':scope > li.ya-da').count(), 1);
  assert.equal((await liste.locator(':scope > li.ya-da').innerText()).trim(), 'ya da');
  // metabolik grupta ayırıcı yok
  const s2 = await sayfaAc();
  await s2.git('#/hastalik/ornek_metabolik');
  assert.match(await s2.locator('.oneri-kart h3.grup-baslik').first().innerText(), /^Metabolik \/ sıvı — gerektiğinde birlikte/);
  assert.equal(await s2.locator('.oneri-kart li.ya-da').count(), 0);
  const diger = hastalikDegis('metabolik', 'ornek_metabolik', (h) => ({
    ...h, protokol: { ...h.protokol, ilaclar: h.protokol.ilaclar.map((i) => ({ ...i, sinif: 'diger' })) },
  }));
  const s3 = await sayfaAc({ degistir: diger });
  await s3.git('#/hastalik/ornek_metabolik');
  assert.match(await s3.locator('.oneri-kart h3.grup-baslik').first().innerText(), /^Diğer — seçenekler/);
});

test('oneri B6: yer bolme siniri ve yolu, tam hesap, sinirsiz buyuk hacim notu', async () => {
  const yerli = u1Degis((k) => ({ ...k, yollar: ['IM', 'IV'], oran: { ...ORAN, mlPerKg: 0.025, yerBasinaMaxMl: 5, yerBasinaYol: 'IM' } }));
  const s = await sayfaAc({ degistir: yerli });
  await kiloGir(s, 450);
  await kartaGec(s);
  const kart = s.locator('.oneri-kart');
  assert.equal((await kart.locator('.ml-buyuk').innerText()).trim(), '→ 11,5 ml');
  assert.match(await kart.locator('.ml-ham').innerText(), /tam hesap 11,25 ml/);
  assert.doesNotMatch(await kart.innerText(), /ham:/);
  assert.equal((await kart.locator('.ml-yer').innerText()).trim(), 'Kas içi verilirse 3 ayrı yere bölün (yer başına en çok 5 ml)');
  assert.equal(await kart.locator('.ml-yer').getAttribute('data-kub'), '');
  assert.doesNotMatch(await kart.innerText(), /Büyük hacim/);
  // yolsuz sınır
  const s2 = await sayfaAc({ degistir: u1Degis((k) => ({ ...k, yollar: ['IM'], oran: { ...ORAN, yerBasinaMaxMl: 20 } })) });
  await kiloGir(s2, 450);
  await kartaGec(s2);
  assert.equal((await s2.locator('.oneri-kart .ml-yer').innerText()).trim(), '3 ayrı yere bölün (yer başına en çok 20 ml)');
  // IM, 45 ml, KÜB sınır vermiyor
  const s3 = await sayfaAc({ degistir: oranli });
  await kiloGir(s3, 450);
  await kartaGec(s3);
  assert.match(await s3.locator('.oneri-kart').innerText(), /Büyük hacim — KÜB sınır vermiyor; bölmeyi değerlendirin/);
  assert.equal(await s3.locator('.oneri-kart .ml-yer').count(), 0);
});

test('oneri B3 B4 B10 B14: sagmal kirmizi, arinma okunamadi, urun yolu, protokol yolu soluk, kisitlar aynen', async () => {
  const kisitlar = [
    { tur: 'kosullu', metin: 'Bir haftadan küçük buzağılarda 0,5 mg/kg dozda kullanmayınız.' },
    { tur: 'olumsuz', metin: 'Gebelikte kullanılmaz.' },
  ];
  const degis = birlikte(
    hastalikDegis('solunum', 'ornek_solunum', (h) => ({
      ...h,
      yasGruplari: ['inek'],
      protokol: { ...h.protokol, ilaclar: h.protokol.ilaclar.map((i) => (i.etkenId === 'ornek_antibiyotik' ? { ...i, yol: 'IV / IM' } : i)) },
    })),
    u1Degis((k) => ({ ...k, yollar: ['IM'], sigir: { et_gun: 28, sut: 'kullanilmaz', guven: 'dusuk' }, oran: { ...ORAN, kisitlar } })),
  );
  const s = await sayfaAc({ degistir: degis });
  await kiloGir(s, 450, 'inek');
  await kartaGec(s);
  const kart = s.locator('.oneri-kart');
  assert.equal((await kart.locator('.ml-buyuk').innerText()).trim(), '→ 45 ml');
  assert.equal((await kart.locator('.oneri-kirmizi').first().innerText()).trim(), 'Sağmal inekte kullanılmaz');
  assert.match(await kart.innerText(), /Arınma: otomatik okunamadı — KÜB: Arınma'yı açın/);
  assert.equal(await kart.locator('.arinma-etiket').count(), 0);
  assert.equal((await kart.locator('.urun-yol').innerText()).trim(), 'Bu ürün: kas içi');
  assert.equal(await kart.locator('.oneri-etken .protokol-yol.soluk').count(), 1);
  const k = kart.locator('.kisit');
  assert.equal(await k.count(), 2);
  assert.equal((await k.nth(0).innerText()).trim(), 'Koşullu kısıt: Bir haftadan küçük buzağılarda 0,5 mg/kg dozda kullanmayınız.');
  assert.equal(await k.nth(0).getAttribute('data-kub'), '');
  assert.equal((await k.nth(1).innerText()).trim(), 'Gebelikte kullanılmaz.');
  assert.match(await k.nth(1).getAttribute('class'), /olumsuz/);
  assert.doesNotMatch(await kartDisiMetin(s), /mg\/kg|ml\/kg/);
  // protokol yolu ürünün yolundan geniş değilse soluk değil
  const s1 = await sayfaAc({ degistir: oranli });
  await kiloGir(s1, 450);
  await kartaGec(s1);
  assert.equal(await s1.locator('.oneri-kart .oneri-etken .protokol-yol.soluk').count(), 0);
  // B14: buzağı kapsamlı oran yetişkinde hesaplanmaz, not var
  const s2 = await sayfaAc({ degistir: u1Degis((k2) => ({ ...k2, yollar: ['IM'], oran: { ...ORAN, kapsam: 'buzagi' } })) });
  await kiloGir(s2, 450);
  await kartaGec(s2);
  assert.equal(await s2.locator('.oneri-kart .ml-buyuk').count(), 0);
  assert.match(await s2.locator('.oneri-kart').innerText(), /Bu doz yalnız buzağı\/genç sığır için/);
  assert.deepEqual(s.hatalar, []);
});

test('oneri B2 B9 B11: hekim secer baglantisi, sabit doz notr, ilac tanimsiz, ihbar once', async () => {
  // metabolik satır, oranı olmayan ürün → ürün hekim seçer
  const mineral = birlikte(
    (yol, j) => (yol === 'urunler.json' ? [...j, { ...j[0], urunId: 'ornek-min', ad: 'Mineral Ürün (test)', etkenler: ['ornek_mineral'] }] : undefined),
    kubDegis((u) => ({ 'ornek-min': { ...u['ornek-u1'], yollar: ['IV'] } })),
  );
  const s = await sayfaAc({ degistir: mineral });
  await s.git('#/hastalik/ornek_metabolik');
  const kart = s.locator('.oneri-kart');
  assert.match(await kart.innerText(), /Ürün hekim seçer \(derişim\/hacim ürüne göre değişir\) — ruhsatlı ürünler \(1\) ▸/);
  assert.equal(await kart.locator('a[href="#/etken/ornek_mineral"]', { hasText: 'ruhsatlı ürünler (1) ▸' }).count(), 1);
  assert.equal(await kart.locator('li.urun').count(), 0);
  assert.equal(await kart.locator('.oneri-uyari').count(), 0);
  // sabit doz: nötr not
  const sabitOran = { mlPerKg: null, ifade: null, cumle: null, kaynak: null, kapsam: null, guven: 'dusuk', yerBasinaMaxMl: null, yerBasinaYol: null, kisitlar: [], sabitDoz: true };
  const s2 = await sayfaAc({ degistir: u1Degis((k) => ({ ...k, yollar: ['IM'], oran: sabitOran })) });
  await kiloGir(s2, 450);
  await kartaGec(s2);
  const sabit = s2.locator('.oneri-kart .oneri-neden', { hasText: 'Doz kiloya bağlı değil' });
  assert.equal((await sabit.innerText()).trim(), 'Doz kiloya bağlı değil (hayvan / meme lobu başına) — KÜB: Doz');
  assert.equal(await s2.locator('.oneri-kart .oneri-uyari').count(), 0);
  // birinci seçenek yok (ornek_ishal yalnız 2. seçenek); ihbarlı + semptomatik → önce bildir
  const s3 = await sayfaAc({ degistir: hastalikDegis('sindirim', 'ornek_ishal', (h) => ({ ...h, ihbari: true })) });
  await s3.git('#/hastalik/ornek_ishal');
  const k3 = s3.locator('.oneri-kart');
  assert.match(await k3.innerText(), /Birinci seçenek ilaç tanımlı değil — aşağıdaki protokole bakın/);
  assert.equal((await k3.locator('.oneri-ihbar').innerText()).trim(), 'İhbarı mecburi — önce bildirin');
  assert.match(await k3.innerText(), /Doz ürünün KÜB'ünden otomatik hesaplandı/);
  assert.deepEqual(s3.hatalar, []);
});

test('390 px: acik KUB kutulari yatay tasma yapmaz', async () => {
  const uzun = 'A'.repeat(300);
  const s = await sayfaAc({ degistir: kubDegis((u) => ({ 'ornek-u1': { ...u['ornek-u1'], doz: `${uzun}\n${u['ornek-u1'].doz}` } })) });
  for (const r of ['#/etken/ornek_antibiyotik', '#/hastalik/ornek_solunum']) {
    await s.git(r);
    if (r.startsWith('#/hastalik')) await s.waitForSelector('.oneri-kart');
    for (const d of await s.locator('details.kub-kutu').all()) await d.locator('summary').click();
    const [sw, iw] = await s.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sw <= iw, `${r}: scrollWidth ${sw} > ${iw}`);
  }
});

// --- K7 düzeltmeleri: yanlış belge, tablolu doz, hedef türü sığır olmayan ürün, ad farkı, eski biçim ---
const UYUMSUZ = { doz: null, arinma: null, sigir: { et_gun: null, sut: null, guven: 'dusuk' }, metinYok: true,
  belgeUyumsuz: true, belgeNeden: 'KÜB bileşiminde ürünün etkeni yok: ornek_antibiyotik' };
const kubUrlli = (yol, j) => (yol === 'urunler.json' ? j.map((u) => ({ ...u, kubUrl: 'https://example.invalid/kub.pdf' })) : undefined);
const birlikte = (...fn) => (yol, j) => fn.reduce((acc, f) => f(yol, acc) ?? acc, j);

test('belgeUyumsuz: etken sayfasinda alinti ve etiket yok, eslesmiyor notu ve KUB baglantisi var; kartta urun onerilmez', async () => {
  const s = await sayfaAc({ degistir: birlikte(kubUrlli, kubDegis({ 'ornek-u1': UYUMSUZ })) });
  await s.git('#/etken/ornek_antibiyotik');
  const kart = s.locator('li.urun', { hasText: 'Örnek Ürün %10' }).first();
  assert.match(await kart.innerText(), /Bakanlık sitesindeki KÜB bu ürünle eşleşmiyor — KÜB'e bakın/);
  assert.equal(await kart.locator('a[href="https://example.invalid/kub.pdf"]').count(), 1);
  assert.equal(await kart.locator('details.kub-kutu').count(), 0);
  assert.equal(await kart.locator('.arinma-etiket').count(), 0);
  assert.doesNotMatch(await kart.innerText(), /Et \d+ gün|KÜB'den alıntı/);
  // yanlış belgeli ürün öneri kartına girmez
  await s.git('#/hastalik/ornek_solunum');
  assert.equal(await s.locator('.oneri-kart li.urun').count(), 0);
  assert.equal(await s.locator('.oneri-kart .ml-buyuk').count(), 0);
  assert.deepEqual(s.hatalar, []);
});

test('tablo: doz es aralikli blokta, not var, sayfa 390 px yana kaymaz', async () => {
  const tablo = 'Pratik doz tablosu:\n       200 kg                                                            1 tablet\n'
    + '       300 kg                  1 tablet\nDüz metin satırı uzun olabilir ve sarılarak gösterilir; '.padEnd(400, 'x');
  const s = await sayfaAc({ degistir: kubDegis((u) => ({ 'ornek-u1': { ...u['ornek-u1'], doz: tablo, tablo: true } })) });
  await s.git('#/etken/ornek_antibiyotik');
  const kutu = s.locator('details.kub-kutu:has(summary:text-is("KÜB: Doz"))');
  await kutu.locator('summary').click();
  assert.match(await kutu.innerText(), /Bu bölümde tablo var — düzen bozulmuş olabilir, KÜB'ün aslına bakın/);
  const blok = kutu.locator('.kub-tablo');
  assert.match(await blok.evaluate((n) => getComputedStyle(n).fontFamily), /mono|Consolas|Menlo/i);
  assert.equal(await blok.evaluate((n) => getComputedStyle(n).overflowX), 'auto');
  // tablo satırı boşluklarıyla aynen (sütun konumu): 200 kg satırında "1 tablet" 300 kg satırındakinden sağda
  const satirlar = await blok.locator('.tablo-satir').allTextContents();
  assert.equal(satirlar.length, 2);
  assert.ok(satirlar[0].indexOf('1 tablet') > satirlar[1].indexOf('1 tablet') + 20, JSON.stringify(satirlar));
  assert.equal(await blok.locator('.tablo-satir').first().evaluate((n) => getComputedStyle(n).whiteSpace), 'pre');
  const [sw, iw, bw, bs] = await s.evaluate(() => {
    const b = document.querySelector('.kub-tablo');
    return [document.documentElement.scrollWidth, innerWidth, b.clientWidth, b.scrollWidth];
  });
  assert.ok(sw <= iw, `scrollWidth ${sw} > ${iw}`);
  assert.ok(bs > bw, 'tablo bloğu kendi içinde yana kayar');
  // tablosuz kayıtta düz kutu
  const s2 = await sayfaAc();
  await s2.git('#/etken/ornek_antibiyotik');
  assert.equal(await s2.locator('.kub-tablo').count(), 0);
  assert.deepEqual(s.hatalar, []);
});

test('sigirHedefDegil: urun etken ve hastalik sigir listelerinde gizli', async () => {
  const ek = (yol, j) => (yol === 'urunler.json'
    ? [...j, { ...j[0], urunId: 'ornek-u2', ad: 'Koyun Ürünü (test)' }] : undefined);
  const hedef = kubDegis((u) => ({ 'ornek-u2': { ...u['ornek-u1'], sigirHedefDegil: true } }));
  const s = await sayfaAc({ degistir: birlikte(ek, hedef) });
  await s.git('#/etken/ornek_antibiyotik');
  assert.match(await metin(s), /Örnek Ürün %10/);
  assert.doesNotMatch(await metin(s), /Koyun Ürünü \(test\)/);
  await s.git('#/hastalik/ornek_solunum');
  const satir = s.locator('li.ilac').first();
  assert.doesNotMatch(await satir.innerText(), /Koyun Ürünü \(test\)/);
  assert.match(await satir.innerText(), /Ruhsatlı ürünler \(1\)/);
  // bayrak yokken ikisi de listede
  const s2 = await sayfaAc({ degistir: ek });
  await s2.git('#/etken/ornek_antibiyotik');
  assert.match(await metin(s2), /Koyun Ürünü \(test\)/);
  assert.deepEqual(s.hatalar, []);
});

test('kubAdi ve eskiBicim notlari; eski bicimde etiket yok', async () => {
  const s = await sayfaAc({ degistir: kubDegis((u) => ({ 'ornek-u1': { ...u['ornek-u1'], kubAdi: 'SANTADOKS %10' } })) });
  await s.git('#/etken/ornek_antibiyotik');
  assert.match(await metin(s), /KÜB başka ticari adla yayımlanmış: SANTADOKS %10/);
  const s2 = await sayfaAc({ degistir: kubDegis((u) => ({ 'ornek-u1': ornekKayit(u, { guven: 'dusuk' }, { eskiBicim: true }) })) });
  await s2.git('#/etken/ornek_antibiyotik');
  assert.match(await metin(s2), /Eski biçim KÜB — aslına bakın/);
  assert.equal(await s2.locator('.arinma-etiket').count(), 0);
  assert.equal(await s2.locator('details.kub-kutu').count(), 2);
});

test('ihbar, zoonoz, antibiyotik ve ayirici tani gosterilir', async () => {
  const s = await sayfaAc();
  await s.git('#/hastalik/ornek_sarbon');
  const t = await metin(s);
  assert.match(t, /İhbarı mecburi — bildirin/);
  assert.match(t, /resmî veteriner hekime bildirin/);
  assert.match(t, /Zoonoz/);
  assert.match(t, /Antibiyotik endike değil/);
  assert.match(t, /Tedavi kipi: Tedavi yasak/);
  assert.match(t, /nekropsi yapmayın/);
  await s.git('#/hastalik/ornek_ihbar');
  assert.ok(await s.locator('a[href="#/hastalik/ornek_solunum"]').isVisible());
});

test('etken sayfasi: nasil calisir, AMEG, urun ve urunsuz etken', async () => {
  const s = await sayfaAc();
  await s.git('#/etken/ornek_antibiyotik');
  const t = await metin(s);
  assert.match(t, /Nasıl çalışır/);
  assert.match(t, /Hedef: Örnek: bakteri ribozomu/);
  assert.match(t, /Spektrum/);
  assert.match(t, /Dikkat: Örnek etkileşim notu/);
  assert.match(t, /AMEG: C/);
  assert.match(t, /Örnek Ürün %10/);
  assert.match(t, /liste tarihi: 01\.11\.2026/);
  assert.match(t, /taslak/);
  assert.doesNotMatch(t, /mg\/kg/);
  await s.git('#/etken/ornek_nsaii');
  assert.match(await metin(s), /Bu etken için listede ruhsatlı ürün bulunamadı/);
  assert.deepEqual(s.hatalar, []);
});

test('AMEG A ve B uyarilari', async () => {
  const degis = (yol, j) => (yol === 'etkenler.json'
    ? j.map((e) => (e.id === 'ornek_antibiyotik' ? { ...e, ameg: 'A' } : e.id === 'ornek_nsaii' ? { ...e, ameg: 'B' } : e)) : undefined);
  const s = await sayfaAc({ degistir: degis });
  await s.git('#/etken/ornek_antibiyotik');
  assert.match(await metin(s), /Gıda hayvanında kullanılmaz/);
  await s.git('#/etken/ornek_nsaii');
  assert.match(await metin(s), /Antibiyogramsız ilk seçenek olmaz/);
});

test('sigir eslesmesi buyuk-kucuk harf ve aksan duyarsiz', async () => {
  const degis = (yol, j) => (yol === 'urunler.json'
    ? j.map((u) => ({ ...u, hedefTurler: ['SIĞIR'] })) : undefined);
  const s = await sayfaAc({ degistir: degis });
  await s.git('#/etken/ornek_antibiyotik');
  assert.match(await metin(s), /Örnek Ürün %10/);
  const koyun = (yol, j) => (yol === 'urunler.json' ? j.map((u) => ({ ...u, hedefTurler: ['koyun'] })) : undefined);
  const s2 = await sayfaAc({ degistir: koyun });
  await s2.git('#/etken/ornek_antibiyotik');
  assert.match(await metin(s2), /ruhsatlı ürün bulunamadı/);
});

test('yalniz buzagi urunu listelenir ve etiketlenir; kombine urunde diger etken ve AMEG uyarisi', async () => {
  const degis = (yol, j) => {
    if (yol === 'etkenler.json') return j.map((e) => (e.id === 'ornek_antibiyotik' ? { ...e, ameg: 'B' } : e));
    if (yol === 'urunler.json') {
      return [...j,
        { ...j[0], urunId: undefined, ad: 'Buzağı Ürünü (test)', etkenler: ['ornek_nsaii'], hedefTurler: ['buzagi', 'kuzu'], kub: [] },
        { ...j[0], urunId: undefined, ad: 'Kombine Ürün (test)', etkenler: ['ornek_nsaii', 'ornek_antibiyotik'], hedefTurler: ['sigir'], kub: [] }];
    }
    return undefined;
  };
  const s = await sayfaAc({ degistir: degis });
  await s.git('#/etken/ornek_nsaii');
  const t = await metin(s);
  assert.match(t, /Buzağı Ürünü \(test\) \(yalnız buzağı\)/);
  assert.match(t, /Kombine ürünler/);
  const kombine = await s.locator('.kombine-liste .urun').innerText();
  assert.match(kombine, /Kombine Ürün \(test\)/);
  assert.match(kombine, /Birlikte: Örnek antibiyotik \(test\) \(AMEG B\)/);
  assert.match(kombine, /AMEG B .*Antibiyogramsız ilk seçenek olmaz/);
  assert.match(kombine, /Antibiyotik içerir — sağmal inekte seçmeden önce bileşimi ve süt koşulunu KÜB'den doğrulayın/);
  assert.match(t, /KÜB bağlantısı yok — Bakanlık ürün sorgusundan bakın/);
  assert.doesNotMatch(t, /ruhsatlı ürün bulunamadı/);
  assert.deepEqual(s.hatalar, []);
});

test('hastalik: protokol satirindan ruhsatli urunlere gecis; urunsuz etkende not', async () => {
  const s = await sayfaAc();
  await s.git('#/hastalik/ornek_solunum');
  const t = await metin(s);
  assert.match(t, /Ruhsatlı ürünler \(1\) ▸/);
  assert.match(t, /Listede ruhsatlı sığır ürünü yok\./);
  await s.click('a.dugme.ikincil');
  await s.waitForSelector('main h1:has-text("Örnek antibiyotik")');
  // Uygulama içinden gelindi: Geri hastalığa döner.
  await s.click('#geri');
  await s.waitForSelector('main h1:has-text("Örnek solunum")');
});

test('dogrudan acilan sayfada Geri Taniya gider', async () => {
  const s = await sayfaAc();
  await s.goto(adres + '#/hastalik/ornek_solunum');
  await s.waitForSelector('main h1:has-text("Örnek solunum")');
  await s.click('#geri');
  await s.waitForSelector('main h1:text-is("Tanı")');
});

test('arayuz savunmasi: yasak kipte ilac ve AMEG A satiri gosterilmez', async () => {
  const degis = (yol, j) => {
    if (yol === 'etkenler.json') return j.map((e) => (e.id === 'ornek_antibiyotik' ? { ...e, ameg: 'A' } : e));
    if (yol === 'hastaliklar/ihbar_zehir.json') {
      return j.map((h) => (h.tedaviKipi === 'yasak'
        ? { ...h, protokol: { ...h.protokol, ilaclar: [{ etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'IV', not: null, kaynak: { tur: 'KUB', urun: null, bolum: null } }] } }
        : h));
    }
    return undefined;
  };
  const s = await sayfaAc({ degistir: degis });
  const uyarilar = [];
  s.on('console', (m) => { if (m.type() === 'warning') uyarilar.push(m.text()); });
  await s.git('#/hastalik/ornek_sarbon');
  assert.match(await metin(s), /Tedavi kipi: Tedavi yasak/);
  assert.equal(await s.locator('.ilac').count(), 0);
  await s.git('#/hastalik/ornek_solunum');
  await s.waitForSelector('.ilac');
  assert.doesNotMatch(await s.locator('.ilaclar').innerText(), /Örnek antibiyotik/);
  assert.ok(uyarilar.some((u) => /AMEG A/.test(u)), JSON.stringify(uyarilar));
});

test('bilinmeyen kimlik ve bozuk hash bulunamadi gosterir', async () => {
  const s = await sayfaAc();
  await s.git('#/etken/yok');
  assert.match(await metin(s), /Bulunamadı/);
  await s.git('#/hastalik/yok');
  assert.match(await metin(s), /Bulunamadı/);
  await s.git('#/hastalik/%E0%A4%A');
  assert.match(await metin(s), /Bulunamadı/);
  assert.deepEqual(s.hatalar, []);
});

test('390 px genislikte yatay kaydirma yok, dokunma hedefleri 44 px', async () => {
  const s = await sayfaAc();
  const rotalar = ['#/tani', '#/sonuc', '#/hastalik/ornek_solunum', '#/hastalik/ornek_sarbon', '#/etken/ornek_antibiyotik',
    '#/hastaliklar', '#/ilaclar', '#/hakkinda'];
  for (const r of rotalar) {
    await s.git(r);
    assert.doesNotMatch(await metin(s), /null|undefined/, `${r}: null metni`);
    const [sw, iw] = await s.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sw <= iw, `${r}: scrollWidth ${sw} > ${iw}`);
  }
  await s.git('#/tani');
  await belirtiSec(s, 'öksürük', 'oksuruk');
  for (const sec of ['.secenek', '.cip-secili', '#goster', '.onay-kutusu', '#isi', '#ara']) {
    for (const kutu of await Promise.all((await s.locator(sec).all()).map((l) => l.boundingBox()))) {
      assert.ok(kutu.height >= 44, `${sec} yükseklik ${kutu.height}`);
    }
  }
  // K6 C-8: hastalık sayfasındaki ayırıcı tanı bağlantıları, ürün düğmesi ve Geri de 44 px.
  await s.git('#/hastalik/ornek_ihbar');
  await s.waitForSelector('.ayirici a');
  for (const sec of ['.ayirici a', '#geri']) {
    for (const kutu of await Promise.all((await s.locator(sec).all()).map((l) => l.boundingBox()))) {
      assert.ok(kutu.height >= 44, `${sec} yükseklik ${kutu.height}`);
    }
  }
  await s.git('#/hastalik/ornek_solunum');
  await s.waitForSelector('a.dugme.ikincil');
  assert.ok((await s.locator('a.dugme.ikincil').boundingBox()).height >= 44);
});

test('listeler: A-Z, arama, bos mesaji', async () => {
  const s = await sayfaAc();
  await s.git('#/hastaliklar');
  const adlar = await s.locator('.liste-satir').allInnerTexts();
  assert.ok(adlar.length >= 5);
  const sirali = [...adlar].sort((a, b) => a.localeCompare(b, 'tr'));
  assert.deepEqual(adlar.map((a) => a.replace(/\s*taslak$/, '')), sirali.map((a) => a.replace(/\s*taslak$/, '')));
  await s.fill('#liste-ara', 'brusella');
  assert.equal(await s.locator('.liste-satir').count(), 1);
  await s.fill('#liste-ara', 'zzzz');
  assert.match(await metin(s), /Eşleşen kayıt yok/);
  await s.git('#/ilaclar');
  assert.equal(await s.locator('.liste-satir').count(), 3);
  await s.git('#/hakkinda');
  await s.waitForSelector('main h1:text-is("Hakkında")');
  const t = await metin(s);
  assert.match(t, /uzman tahmini/);
  assert.match(t, /Sıralama hastalığın sıklığını da hesaba katar/);
  assert.match(t, /Hekim kararının yerine geçmez/);
});

test('bozuk depolanmis durum normalize edilir', async () => {
  const s = await sayfaAc();
  await s.goto(adres + '#/tani');
  await s.evaluate(() => sessionStorage.setItem('vet-defter-durum',
    JSON.stringify({ girdi: { yas: 'xx', baglam: 5, isi: '99', belirtiler: ['yok_boyle', 'ates', 'oksuruk', 7] } })));
  await s.reload();
  await s.waitForSelector('main h1:text-is("Tanı")');
  assert.equal(await s.locator('.secenek[data-yas="inek"][aria-pressed="true"]').count(), 1);
  assert.equal(await s.locator('.cip-secili').count(), 1); // yalnız oksuruk; ates elle seçilmez
  await s.evaluate(() => sessionStorage.setItem('vet-defter-durum', '{bozuk'));
  await s.reload();
  await s.waitForSelector('main h1:text-is("Tanı")');
  assert.deepEqual(s.hatalar, []);
});

test('hizli rota degisiminde yalniz son rota cizilir', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  await s.evaluate(() => { location.hash = '#/hakkinda'; location.hash = '#/hastaliklar'; location.hash = '#/ilaclar'; });
  await s.waitForSelector('main h1:text-is("İlaçlar")');
  await s.waitForTimeout(300);
  assert.equal(await s.textContent('main h1'), 'İlaçlar');
});

test('veri yuklenemezse Turkce hata ve yeniden dene', async () => {
  const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const s = await baglam.newPage();
  await s.route('**/veri/meta.json', (r) => r.abort());
  await s.goto(adres + '#/tani');
  await s.waitForSelector('main:has-text("Veri yüklenemedi")');
  assert.ok(await s.locator('button:has-text("Yeniden dene")').isVisible());
});

test('gercek (bos olabilen) veri ile Tani acilir ve sonuc cokmez', async () => {
  const s = await sayfaAc({ ornek: false });
  await s.git('#/tani');
  assert.ok(await s.locator('#goster').isVisible());
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  assert.match(await metin(s), /Yetersiz girdi/);
  await s.git('#/hastaliklar');
  await s.git('#/ilaclar');
  await s.git('#/hakkinda');
  assert.deepEqual(s.hatalar, []);
});

test('gercek veri: hicbir hastalik ve etken sayfasinda olasilik ya da doz yok', async () => {
  // final-review M1: "olasılık" veri üzerinden de ekrana gelmesin (tr küçük harf); taslakta mg/kg yok.
  const s = await sayfaAc({ ornek: false });
  const oku = (y) => JSON.parse(readFileSync(join(KOK, 'veri', y), 'utf8'));
  const hastaliklar = oku('hastaliklar/index.json').flatMap((d) => oku(`hastaliklar/${d}`));
  const sayfalar = [...hastaliklar.map((h) => [`#/hastalik/${h.id}`, h.ad]), ...oku('etkenler.json').map((e) => [`#/etken/${e.id}`, e.ad])];
  await s.git('#/tani');
  await s.fill('#kilo', '450'); // kartta ml, oran ve KÜB cümlesi de çizilsin
  for (const [hash, ad] of sayfalar) {
    await s.evaluate((h) => { location.hash = h; }, hash);
    await s.waitForFunction((a) => document.querySelector('main h1')?.textContent.startsWith(a), ad);
    const t = (await metin(s)).toLocaleLowerCase('tr');
    assert.doesNotMatch(t, /olasılı|ihtimal/, hash);
    // Doz/oran yalnız KÜB kaynaklı öğelerde (data-kub) ya da açılır KÜB kutularında; kalan metinde yok.
    const disi = (await s.evaluate(() => {
      const m = document.querySelector('main').cloneNode(true);
      m.querySelectorAll('[data-kub], details.kub-kutu').forEach((n) => n.remove());
      return m.innerText;
    })).toLocaleLowerCase('tr');
    assert.doesNotMatch(disi, /mg\/kg|ml\/kg/, hash);
  }
  assert.deepEqual(s.hatalar, []);
});

test('bos hastalik listesi bos oldugunu soyler', async () => {
  const bos = (yol, j) => (yol.startsWith('hastaliklar/') && yol !== 'hastaliklar/index.json' ? [] : undefined);
  const s = await sayfaAc({ degistir: bos });
  await s.git('#/hastaliklar');
  assert.match(await metin(s), /Henüz hastalık kaydı yok/);
});

test('kilo girilir, sonuc ozetinde gorunur, yenilenince korunur, Yeni vaka temizler', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  assert.equal(await s.getAttribute('#kilo', 'inputmode'), 'decimal');
  await s.fill('#kilo', '450');
  await s.fill('#yas-ay', '36');
  await belirtiSec(s, 'öksürük', 'oksuruk');
  await s.reload();
  await s.waitForSelector('main h1');
  assert.equal(await s.inputValue('#kilo'), '450');
  assert.equal(await s.inputValue('#yas-ay'), '36');
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  assert.match(await metin(s), /İnek · 450 kg/);
  await s.click('#yeni-vaka');
  await s.waitForSelector('main h1:text-is("Tanı")');
  assert.equal(await s.inputValue('#kilo'), '');
  assert.equal(await s.inputValue('#yas-ay'), '');
  assert.deepEqual(s.hatalar, []);
});

test('kilo uyarilari: olagan disi ve yas grubuyla uyumsuz', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  await s.fill('#kilo', '10');
  assert.match(await s.locator('#kilo-ipucu').innerText(), /Kilo olağan dışı, kontrol edin/);
  await s.fill('#kilo', '300');
  await s.click('[data-yas="buzagi"]');
  assert.match(await s.locator('#kilo-ipucu').innerText(), /yaş grubuyla uyumsuz/);
  await s.fill('#kilo', '450');
  await s.click('[data-yas="inek"]');
  assert.equal(await s.locator('#kilo-ipucu').innerText(), '');
});
