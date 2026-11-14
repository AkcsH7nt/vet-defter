// sw.js önbellek listesi: uygulama ve veri dosyalarının hepsi listede, listedekilerin hepsi diskte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(KOK, 'sw.js'), 'utf8');
const dosyalar = JSON.parse(
  sw.match(/const DOSYALAR = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'),
);

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
