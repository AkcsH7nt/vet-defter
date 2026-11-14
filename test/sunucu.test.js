// Geliştirme sunucusu (final-review M5): kök çalışma dizininden bağımsız; nokta ile başlayan yollar sunulmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';

test('sunucuKokuCalismaDizinindenBagimsizVeGizliDosyalarKapali', async () => {
  const eski = process.cwd();
  process.chdir(tmpdir());
  let sunucu;
  try {
    const { sunucuBaslat } = await import('../scripts/sunucu.mjs');
    sunucu = await sunucuBaslat(0);
    const adres = `http://localhost:${sunucu.address().port}`;
    const durum = async (yol) => (await fetch(adres + yol)).status;
    assert.equal(await durum('/'), 200);
    assert.equal(await durum('/veri/meta.json'), 200);
    for (const yol of ['/.git/HEAD', '/.gitignore', '/.superpowers/sdd/2026-11-14-vet-defter/final-review.md', '/%2e%2e/%2e%2e/Windows/win.ini', '/%2e%2e/.git/HEAD', '/x/../.git/config']) {
      assert.equal(await durum(yol), 404, yol);
    }
  } finally {
    sunucu?.close();
    process.chdir(eski);
  }
});
