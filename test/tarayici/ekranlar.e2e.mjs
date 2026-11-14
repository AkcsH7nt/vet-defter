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
  assert.doesNotMatch((await s.locator('body').innerText()).toLowerCase(), /olasılık/);
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
  assert.match(await s.locator('.ipucu').first().innerText(), /ateş/);
  assert.equal(await s.getAttribute('#isi', 'inputmode'), 'decimal');
  await s.fill('#isi', '406');
  assert.match(await s.locator('.ipucu').first().innerText(), /30–45/);
});

test('sap belirtileri ustte kirmizi bayrak gosterir', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  await belirtiSec(s, 'kabarcık', 'vezikul_agiz');
  await belirtiSec(s, 'salya', 'salya');
  await belirtiSec(s, 'topallık', 'topallik');
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  const ilk = s.locator('main > :nth-child(2)');
  assert.match(await ilk.innerText(), /ŞAP ŞÜPHESİ — İHBAR EDİN/);
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

test('belirti secmeden yetersiz girdi', async () => {
  const s = await sayfaAc();
  await s.git('#/tani');
  await s.click('#goster');
  await s.waitForSelector('main h1:text-is("Sonuçlar")');
  assert.match(await metin(s), /Yetersiz girdi — belirti ekleyin/);
});

test('taslak hastalikta mg/kg yok, taslak etiketi var', async () => {
  const s = await sayfaAc();
  await s.git('#/hastalik/ornek_ishal');
  const t = await metin(s);
  assert.doesNotMatch(t, /mg\/kg/);
  assert.ok(await s.locator('h1 .etiket').isVisible());
  // onaylı ama ürünün KÜB'ü doğrulanmamış: yine doz yok
  await s.git('#/hastalik/ornek_solunum');
  const t2 = await metin(s);
  assert.doesNotMatch(t2, /mg\/kg/);
  assert.match(t2, /KÜB'e bakın/);
  assert.equal(await s.locator('h1 .etiket').count(), 0);
});

test('doz yalniz onayli hastalik ve dogrulanmis KUB ile gorunur', async () => {
  const dogrula = (yol, j) => (yol === 'urunler.json'
    ? j.map((u) => ({ ...u, kubDogrulandi: { kim: 'test', tarih: '2026-11-14' } })) : undefined);
  const s = await sayfaAc({ degistir: dogrula });
  await s.git('#/hastalik/ornek_solunum');
  assert.match(await metin(s), /10 mg\/kg/);
  // içerik değişince özet tutmaz → taslak sayılır → doz gizlenir
  const bozuk = (yol, j) => (yol === 'hastaliklar/solunum.json'
    ? j.map((h) => ({ ...h, ad: `${h.ad} değişti` })) : dogrula(yol, j));
  const s2 = await sayfaAc({ degistir: bozuk });
  await s2.git('#/hastalik/ornek_solunum');
  const t = await metin(s2);
  assert.doesNotMatch(t, /mg\/kg/);
  assert.match(t, /taslak/);
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
  assert.match(t, /Etkileşim: Örnek etkileşim notu/);
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
  const t = await metin(s);
  assert.match(t, /uzman tahmini/);
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

test('bos hastalik listesi bos oldugunu soyler', async () => {
  const bos = (yol, j) => (yol.startsWith('hastaliklar/') && yol !== 'hastaliklar/index.json' ? [] : undefined);
  const s = await sayfaAc({ degistir: bos });
  await s.git('#/hastaliklar');
  assert.match(await metin(s), /Henüz hastalık kaydı yok/);
});
