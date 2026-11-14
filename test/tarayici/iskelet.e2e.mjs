// İskelet testi: 390x844'te açılır, 4 gezinme düğmesi görünür, bilinmeyen kimlik "Bulunamadı" gösterir, konsol temiz.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(await sayfa.textContent('main h1'), 'İlaçlar');
  assert.equal(await sayfa.locator('nav a[aria-current="page"]').textContent(), 'İlaçlar');
  await sayfa.click('nav a[href="#/hakkinda"]');
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

test('serviceWorkerKaydolurVeKonsolTemiz', async () => {
  const surum = await sayfa.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return (await caches.keys())[0];
  });
  assert.equal(surum, 'vet-defter-v1');
  assert.deepEqual(hatalar, []);
});
