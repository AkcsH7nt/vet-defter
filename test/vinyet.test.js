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
import { bayraklar } from '../lib/bayrak.js';
import { sonucListeleri } from '../ui/sonuc.js';

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

test('herIhbariHastalikVinyetlerininEnAzBirindeKendiBayraginiVerir', async () => {
  const veri = await veriYukle(dizindenOku(KOK));
  const eksik = [];
  for (const h of veri.hastaliklar.filter((x) => x.ihbari)) {
    const kendi = vakalar.filter((v) => v.beklenenIlk3 === h.id);
    if (!kendi.some((v) => bayraklar(v.girdi, veri).some((b) => b.hastalikId === h.id))) eksik.push(h.id);
  }
  assert.deepEqual(eksik, []);
});

// İhbari olmayan vinyetlerde çıkan ihbar bayrakları: her biri klinik olarak gerekçeli (fix dalgası raporu).
// Yeni bir çift çıkarsa kural fazla geniş olabilir: önce klinik gerekçeyi yazın, sonra buraya ekleyin.
const GEREKCELI_IHBAR_BAYRAKLARI = new Set([
  'buzagi_difterisi > kuduz', // salya + yutamama: "KUDUZU DIŞLAYIN — ağza çıplak elle girmeyin"
  'ibr > bruselloz', 'bvd_md > bruselloz', 'retensiyo_sekundinarum > bruselloz', // her atık brusella şüphesidir
  'hipomagnezemi > kuduz', 'organofosfat_zehirlenmesi > kuduz', 'kursun_zehirlenmesi > kuduz', // salya + sinirsel bulgu
  'buzagi_beyaz_kas_hastaligi > sarbon', 'nitrat_zehirlenmesi > sarbon', // ani ölüm: nekropsiden önce şarbonu dışla
  'buzagi_beyaz_kas_hastaligi > kuduz', // yutamama + sinirsel bulgu
]);

test('ihbariOlmayanVinyetlerdeYalnizGerekceliIhbarBayraklari', async () => {
  const veri = await veriYukle(dizindenOku(KOK));
  const ihbari = new Set(veri.hastaliklar.filter((h) => h.ihbari).map((h) => h.id));
  const yeni = new Set();
  for (const v of vakalar) {
    if (ihbari.has(v.beklenenIlk3)) continue;
    for (const b of bayraklar(v.girdi, veri)) {
      const cift = `${v.beklenenIlk3} > ${b.hastalikId}`;
      if (ihbari.has(b.hastalikId) && !GEREKCELI_IHBAR_BAYRAKLARI.has(cift)) yeni.add(`${cift} (${b.id}, "${v.ad}")`);
    }
  }
  assert.deepEqual([...yeni], []);
});

// Ekrandaki gerçek liste: Türkiye'de görülmeyen hastalıklar bayrakları tutmadıkça ilk 5'te değil ayrı bölümde.
// Beklenen hastalık egzotikse ilk 3'te (bayrağı tuttuysa) ya da ayrı bölümde olmalı.
test('ekranListesiVinyetlerin%80iIlk3teEgzotiklerAyriBolumde', async () => {
  const veri = await veriYukle(dizindenOku(KOK));
  const egzotik = new Set(veri.hastaliklar.filter((h) => h.turkiyedeGorulmez).map((h) => h.id));
  for (const [etiket, tarih] of TARIHLER) {
    const basarisiz = [];
    for (const v of vakalar) {
      const s = sonucListeleri(v.girdi, veri, tarih);
      const ilk3 = s.ana.slice(0, 3).some((x) => x.id === v.beklenenIlk3);
      const ayrida = egzotik.has(v.beklenenIlk3) && s.egzotik.some((x) => x.id === v.beklenenIlk3);
      if (!ilk3 && !ayrida) basarisiz.push(`${v.beklenenIlk3} — "${v.ad}"`);
      for (const x of s.ana) {
        if (egzotik.has(x.id)) assert.ok(s.bayraklar.some((b) => b.hastalikId === x.id), `${x.id} bayraksız ilk 5'te (${v.ad})`);
      }
    }
    const oran = (vakalar.length - basarisiz.length) / vakalar.length;
    assert.ok(oran >= ESIK, `${etiket}: ${basarisiz.join('\n')}`);
  }
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
