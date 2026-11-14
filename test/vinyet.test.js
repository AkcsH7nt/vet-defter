// Altın vaka (vinyet) testi (Görev 9): test/vinyetler.json'daki klinik vakaların en az %80'inde beklenen hastalık
// gerçek veriyle puanla() sonucunun ilk 3'ünde olmalı. Başarısız vakalar adıyla yazdırılır.
// Tarih sabit: mevsim çarpanı (h.mevsim) sonucu etkilediğinden test takvime göre değişmesin. Temmuz, kene /
// Culicoides mevsimidir (teileriyoz, babesiyoz, mavidil); Fable vinyetleri Kasım ve Temmuz için aynı sonucu bildirdi.
// Her iki tarih de denenir: vakaların yazıldığı mevsim varsayımı tek bir aya bağlı kalmasın.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dizindenOku } from '../scripts/dogrula.mjs';
import { veriYukle } from '../lib/veri.js';
import { puanla } from '../lib/puan.js';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const vakalar = JSON.parse(readFileSync(new URL('./vinyetler.json', import.meta.url), 'utf8'));
const ESIK = 0.8;
const TARIHLER = [['2026-07-15', new Date(2026, 6, 15)], ['2026-11-14', new Date(2026, 10, 14)]];

test('vinyetlerGecerliVeHerHastalikKapsanir', async () => {
  const veri = await veriYukle(dizindenOku(KOK));
  const hastaliklar = new Set(veri.hastaliklar.map((h) => h.id));
  const belirtiler = new Set(veri.belirtiler.map((b) => b.id));
  assert.ok(vakalar.length >= 48, `vaka sayısı ${vakalar.length}`);
  for (const v of vakalar) {
    assert.ok(hastaliklar.has(v.beklenenIlk3), `bilinmeyen hastalık: ${v.beklenenIlk3} (${v.ad})`);
    for (const b of v.girdi.belirtiler) assert.ok(belirtiler.has(b), `bilinmeyen belirti: ${b} (${v.ad})`);
  }
  for (const id of hastaliklar) assert.ok(vakalar.some((v) => v.beklenenIlk3 === id), `vinyeti olmayan hastalık: ${id}`);
});

for (const [etiket, tarih] of TARIHLER) {
  test(`vinyetlerin%80iIlk3te (${etiket})`, async () => {
    const veri = await veriYukle(dizindenOku(KOK));
    const basarisiz = [];
    for (const v of vakalar) {
      const sonuc = puanla(v.girdi, veri, tarih);
      const sira = sonuc.findIndex((s) => s.id === v.beklenenIlk3) + 1;
      if (sira < 1 || sira > 3) {
        basarisiz.push(`  ${v.beklenenIlk3} — "${v.ad}": sıra ${sira || 'yok'}; ilk 3: ${sonuc.slice(0, 3).map((s) => s.id).join(', ')}`);
      }
    }
    const oran = (vakalar.length - basarisiz.length) / vakalar.length;
    const ozet = `${etiket}: ilk 3'te ${vakalar.length - basarisiz.length} / ${vakalar.length} (%${(oran * 100).toFixed(1)})`;
    console.log(ozet + (basarisiz.length ? `\nİlk 3'te olmayan vakalar:\n${basarisiz.join('\n')}` : ''));
    assert.ok(oran >= ESIK, `${ozet} — eşik %${ESIK * 100}\n${basarisiz.join('\n')}`);
  });
}
