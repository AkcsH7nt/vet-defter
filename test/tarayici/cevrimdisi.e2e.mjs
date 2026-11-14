// Çevrimdışı ve alt yol: ilk açılış → SW hazır → ağ kesik → yeniden yükle → ekranlar gerçek veriyle açılır.
// Ayrıca uygulama /vet-defter/ alt yolunda (GitHub Pages gibi) sunulunca da çalışır.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { sunucuBaslat } from '../../scripts/sunucu.mjs';

const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const SURUM = sw.match(/const SURUM = '([^']+)'/)[1];
const DOSYALAR = JSON.parse(sw.match(/const DOSYALAR = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));

let kokSunucu, altSunucu, tarayici;
before(async () => {
  kokSunucu = await sunucuBaslat(0);
  altSunucu = await sunucuBaslat(0, 'vet-defter');
  tarayici = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await tarayici?.close();
  kokSunucu?.close();
  altSunucu?.close();
});

async function swHazir(sayfa) {
  await sayfa.evaluate(async () => { await navigator.serviceWorker.ready; });
  await sayfa.waitForFunction(async (surum) => {
    const r = await navigator.serviceWorker.getRegistration();
    return r?.active?.state === 'activated' && (await caches.keys()).includes(surum);
  }, SURUM);
}

test('cevrimdisiTaniHastalikVeEtkenAcilir', async () => {
  const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 } });
  const sayfa = await baglam.newPage();
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(String(e)));
  const adres = `http://localhost:${kokSunucu.address().port}/`;
  await sayfa.goto(adres);
  await sayfa.waitForSelector('main h1');
  await swHazir(sayfa);

  const onbellekte = await sayfa.evaluate(async (surum) => {
    const c = await caches.open(surum);
    return (await c.keys()).map((i) => new URL(i.url).pathname);
  }, SURUM);
  for (const d of DOSYALAR) {
    const beklenen = d === './' ? '/' : `/${d}`;
    assert.ok(onbellekte.includes(beklenen), `önbellekte yok: ${d}`);
  }

  await baglam.setOffline(true);
  await sayfa.goto(adres);
  await sayfa.waitForSelector('main h1');
  assert.equal(await sayfa.textContent('main h1'), 'Tanı');
  assert.ok((await sayfa.locator('main input, main button').count()) > 0);

  await sayfa.goto(`${adres}#/hastalik/sigir_solunum_kompleksi`);
  await sayfa.waitForSelector('main h1:has-text("olunum")');
  assert.doesNotMatch(await sayfa.textContent('main'), /Bulunamadı/);

  await sayfa.goto(`${adres}#/etken/oksitetrasiklin`);
  await sayfa.waitForSelector('main h1:has-text("ksitetrasiklin")');
  assert.doesNotMatch(await sayfa.textContent('main'), /Bulunamadı/);
  assert.deepEqual(hatalar, []);
  await baglam.close();
});

test('altYoldaTaniAcilirVeServiceWorkerKaydolur', async () => {
  const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 } });
  const sayfa = await baglam.newPage();
  const hatalar = [];
  sayfa.on('pageerror', (e) => hatalar.push(String(e)));
  sayfa.on('console', (m) => { if (m.type() === 'error') hatalar.push(m.text()); });
  const taban = `http://localhost:${altSunucu.address().port}/vet-defter/`;
  await sayfa.goto(taban);
  await sayfa.waitForSelector('main h1');
  assert.equal(await sayfa.textContent('main h1'), 'Tanı');
  await swHazir(sayfa);
  const kapsam = await sayfa.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
  assert.equal(kapsam, taban);
  const manifest = await sayfa.evaluate(() => fetch(document.querySelector('link[rel=manifest]').href).then((r) => r.json()));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  await sayfa.goto(`${taban}#/hastalik/sigir_solunum_kompleksi`);
  await sayfa.waitForSelector('main h1:has-text("olunum")');
  assert.deepEqual(hatalar, []);
  await baglam.close();
});
