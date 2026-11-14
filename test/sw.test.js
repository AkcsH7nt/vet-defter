// sw.js önbellek listesi: uygulama ve veri dosyalarının hepsi listede, listedekilerin hepsi diskte;
// içerik değişince SURUM artırılmış olmalı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { icerikOzetiHesapla, kayitliOzet, swDosyalari } from '../scripts/surum.mjs';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(KOK, 'sw.js'), 'utf8');
const dosyalar = swDosyalari(sw);

const listele = (dizin, uzanti) => (existsSync(join(KOK, dizin))
  ? readdirSync(join(KOK, dizin)).filter((d) => d.endsWith(uzanti)).map((d) => `${dizin}/${d}`)
  : []);

test('tumUygulamaVeVeriDosyalariOnbellekte', () => {
  const gereken = [
    ...listele('lib', '.js'), ...listele('ui', '.js'),
    ...listele('veri', '.json'), ...listele('veri/hastaliklar', '.json'),
  ];
  assert.ok(gereken.includes('veri/meta.json') && gereken.includes('lib/veri.js'));
  for (const d of gereken) assert.ok(dosyalar.includes(d), `sw.js DOSYALAR içinde yok: ${d}`);
});

test('kokDosyalariVeSimgelerOnbellekte', () => {
  // final-review M9: kabuk, stil, giriş betiği, manifest ve index.html'in istediği simgeler.
  for (const d of ['./', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'ikon.svg', 'apple-touch-icon.png']) {
    assert.ok(dosyalar.includes(d), `sw.js DOSYALAR içinde yok: ${d}`);
  }
  const manifest = JSON.parse(readFileSync(join(KOK, 'manifest.webmanifest'), 'utf8'));
  for (const i of manifest.icons ?? []) assert.ok(dosyalar.includes(i.src.replace(/^\.\//, '')), `manifest simgesi önbellekte yok: ${i.src}`);
});

test('listedekiHerDosyaVar', () => {
  for (const d of dosyalar) {
    if (d === './') continue;
    assert.ok(existsSync(join(KOK, d)), `diskte yok: ${d}`);
  }
});

test('surumIkiVeyaUstu', () => {
  const surum = Number(sw.match(/const SURUM = 'vet-defter-v(\d+)'/)[1]);
  assert.ok(surum >= 2);
});

test('icerikDegisinceSurumArtirilmis', () => {
  // final-review I4: önbellekteki bir dosya değişip SURUM artırılmazsa kurulu telefonlar eski içeriği gösterir.
  assert.equal(kayitliOzet(sw), icerikOzetiHesapla(KOK, sw),
    'sw.js içerik özeti eski: önbellekteki dosyalar değişmiş → `npm run surum` çalıştırın (SURUM artar)');
});
