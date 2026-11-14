// İskelet testi: 390x844'te açılır, 4 gezinme düğmesi görünür, bilinmeyen kimlik "Bulunamadı" gösterir, konsol temiz.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { sunucuBaslat } from '../../scripts/sunucu.mjs';

const PORT = 5192;
const ADRES = `http://localhost:${PORT}/`;
let sunucu, tarayici, sayfa;
const hatalar = [];

before(async () => {
  sunucu = await sunucuBaslat(PORT);
  tarayici = await chromium.launch({ channel: 'chrome' });
  const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 } });
  sayfa = await baglam.newPage();
  sayfa.on('console', (m) => { if (m.type() === 'error') hatalar.push(m.text()); });
  sayfa.on('pageerror', (e) => hatalar.push(String(e)));
  await sayfa.goto(ADRES);
});

after(async () => {
  await tarayici?.close();
  sunucu?.close();
});

test('dortGezinmeDugmesiGorunur', async () => {
  const dugmeler = sayfa.locator('nav.alt-gezinme a');
  assert.equal(await dugmeler.count(), 4);
  assert.deepEqual(await dugmeler.allTextContents(), ['Tanı', 'Hastalıklar', 'İlaçlar', 'Hakkında']);
  for (let i = 0; i < 4; i++) {
    assert.ok(await dugmeler.nth(i).isVisible());
    const kutu = await dugmeler.nth(i).boundingBox();
    assert.ok(kutu.height >= 44, `dokunma hedefi ${kutu.height}`);
  }
});

test('varsayilanRotaTani', async () => {
  await sayfa.waitForSelector('main h1');
  assert.match(sayfa.url(), /#\/tani$/);
  assert.equal(await sayfa.locator('nav a[aria-current="page"]').textContent(), 'Tanı');
});

test('gezinmeRotaDegistirir', async () => {
  await sayfa.click('nav a[href="#/ilaclar"]');
  // hashchange sonrası çizim eşzamansız: başlığın değişmesini bekle.
  await sayfa.waitForSelector('main h1:text-is("İlaçlar")');
  assert.equal(await sayfa.textContent('main h1'), 'İlaçlar');
  assert.equal(await sayfa.locator('nav a[aria-current="page"]').textContent(), 'İlaçlar');
  await sayfa.click('nav a[href="#/hakkinda"]');
  await sayfa.waitForSelector('main h1:text-is("Hakkında")');
  assert.match(await sayfa.textContent('main'), /Hekim kararının yerine geçmez/);
});

test('bilinmeyenKimlikBulunamadiGosterir', async () => {
  await sayfa.goto(`${ADRES}#/hastalik/yok`);
  await sayfa.waitForSelector('main:has-text("Bulunamadı")');
  await sayfa.goto(`${ADRES}#/boyle-bir-rota`);
  await sayfa.waitForSelector('main:has-text("Bulunamadı")');
});

test('olasilikKelimesiGecmez', async () => {
  assert.doesNotMatch((await sayfa.textContent('body')).toLowerCase(), /olasılık/);
});

test('veriTarayicidaYuklenir', async () => {
  const sonuc = await sayfa.evaluate(async () => {
    const { veriYukle } = await import('./lib/veri.js');
    const v = await veriYukle();
    return { anahtarlar: Object.keys(v).sort(), semaSurumu: v.meta.semaSurumu, hastaliklarDizi: Array.isArray(v.hastaliklar) };
  });
  assert.deepEqual(sonuc.anahtarlar, ['bayraklar', 'belirtiler', 'etkenler', 'hastaliklar', 'ihbar', 'meta', 'urunler', 'yasaklar']);
  assert.equal(sonuc.semaSurumu, 1);
  assert.ok(sonuc.hastaliklarDizi);
});

test('serviceWorkerKaydolurVeKonsolTemiz', async () => {
  const surum = await sayfa.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return (await caches.keys())[0];
  });
  // Beklenen sürüm sw.js'den okunur: SURUM her yayında artar, test elle güncellenmez.
  const beklenen = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8').match(/const SURUM = '([^']+)'/)[1];
  assert.equal(surum, beklenen);
  assert.deepEqual(hatalar, []);
});
