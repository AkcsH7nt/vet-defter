// Service worker güncellemesi (fix-wave-rereview N1): A sürümü kurulu ve açık bir sayfa varken sunucu B sürümüne
// geçer. B'deki ui/sonuc.js, A'daki ortak.js'te olmayan bir dışa aktarımı ister. Sayfa elle yenilenmeden Sonuçlar
// doğru çizilmeli (sw.js activate açık pencereleri yeniden yükler); girdi sessionStorage'da kalır. İlk kurulumda
// sayfa yeniden yüklenmez (döngü yok).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { sunucuBaslat } from '../../scripts/sunucu.mjs';
import { swDosyalari } from '../../scripts/surum.mjs';

const KOK = fileURLToPath(new URL('../..', import.meta.url));
const sw = readFileSync(join(KOK, 'sw.js'), 'utf8');
let dizin, sunucu, tarayici;

const yaz = (yol, metin) => writeFileSync(join(dizin, yol), metin);
const oku = (yol) => readFileSync(join(dizin, yol), 'utf8');

before(async () => {
  dizin = mkdtempSync(join(tmpdir(), 'vet-defter-guncelleme-'));
  for (const d of [...swDosyalari(sw).filter((x) => x !== './'), 'sw.js']) {
    mkdirSync(dirname(join(dizin, d)), { recursive: true });
    cpSync(join(KOK, d), join(dizin, d));
  }
  yaz('sw.js', sw.replace(/const SURUM = '[^']+';/, "const SURUM = 'vet-defter-test-a';"));
  sunucu = await sunucuBaslat(0, '', dizin);
  tarayici = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await tarayici?.close();
  sunucu?.close();
  rmSync(dizin, { recursive: true, force: true });
});

test('yeniSurumDevralincaAcikSayfaKendiligindenYenilenirSonucDogruCizilir', async () => {
  const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 } });
  const sayfa = await baglam.newPage();
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(String(e)));
  const adres = `http://localhost:${sunucu.address().port}/`;

  // A sürümü: ilk kurulum. Sonuçlar ekranı henüz açılmadı (ui/sonuc.js modül haritasında yok, ortak.js var).
  await sayfa.goto(`${adres}#/tani`);
  await sayfa.waitForSelector('main h1:text-is("Tanı")');
  await sayfa.evaluate(async () => {
    await navigator.serviceWorker.ready;
    sessionStorage.setItem('vet-defter-durum', JSON.stringify({ girdi: {
      yas: 'dana', baglam: { suru: true }, isi: 40.8, belirtiler: ['oksuruk', 'burun_akintisi', 'hizli_solunum'],
    } }));
  });
  await sayfa.waitForFunction(async () => (await caches.keys()).includes('vet-defter-test-a')
    && !!navigator.serviceWorker.controller);
  // İlk kurulumda (eski önbellek yok) sayfa yeniden yüklenmez.
  await sayfa.evaluate(() => { window.__isaret = 'a'; });
  await sayfa.waitForTimeout(500);
  assert.equal(await sayfa.evaluate(() => window.__isaret), 'a');

  // B sürümü: SURUM değişir; ortak.js yeni bir dışa aktarım kazanır ve ui/sonuc.js onu kullanır.
  yaz('sw.js', sw.replace(/const SURUM = '[^']+';/, "const SURUM = 'vet-defter-test-b';"));
  yaz('ui/ortak.js', `${oku('ui/ortak.js')}\nexport const TEST_SURUM_B = 'B sürümü çizdi';\n`);
  yaz('ui/sonuc.js', oku('ui/sonuc.js')
    .replace("from './ortak.js';", "from './ortak.js';\nimport { TEST_SURUM_B } from './ortak.js';")
    .replace("el('h1', {}, 'Sonuçlar'),", "el('h1', {}, 'Sonuçlar'), el('p', { id: 'surum-b' }, TEST_SURUM_B),"));

  const yenilendi = sayfa.waitForEvent('load', { timeout: 15000 });
  await sayfa.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await yenilendi; // elle yenileme yok: sw.js activate pencereyi yeniden yükledi
  await sayfa.waitForSelector('main h1');
  assert.equal(await sayfa.evaluate(() => window.__isaret), undefined);
  assert.ok(await sayfa.evaluate(async () => (await caches.keys()).includes('vet-defter-test-b')));

  // Kullanıcı Sonuçları açar: B modülleri B ortak.js ile bağlanır, girdi korunmuştur.
  await sayfa.click('#goster');
  await sayfa.waitForSelector('main h1:text-is("Sonuçlar")');
  const metin = await sayfa.locator('main').innerText();
  assert.doesNotMatch(metin, /yüklenemedi|Bulunamadı/);
  assert.match(metin, /B sürümü çizdi/);
  assert.doesNotMatch(metin, /Yetersiz girdi/);
  assert.ok(await sayfa.locator('.sonuc').count() >= 1);

  // Döngü yok: bir süre sonra aynı sayfa yerinde durur.
  await sayfa.evaluate(() => { window.__isaret = 'b'; });
  await sayfa.waitForTimeout(800);
  assert.equal(await sayfa.evaluate(() => window.__isaret), 'b');
  assert.deepEqual(hatalar, []);
  await baglam.close();
});
