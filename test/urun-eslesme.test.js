import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { etkenIndeksi, urunEtkenleri, oncekiKubuKoru } from '../scripts/urun-cek.mjs';

const etkenler = JSON.parse(readFileSync(new URL('../veri/etkenler.json', import.meta.url), 'utf8'));
const idx = etkenIndeksi(etkenler);
const coz = (maddeler, yol = 'enjeksiyon') => urunEtkenleri(maddeler, yol, idx);

test('sodyumKlorurMagnezyumaEslesmez', () => {
  assert.deepEqual(coz(['sodyum klorür']).ids, []);
  assert.deepEqual(coz(['sodyum klorür']).eslesmeyen, ['sodyum klorür']);
});
test('magnezyumKlorurMagnezyumaEslesir', () => {
  assert.deepEqual(coz(['magnezyum klorür']).ids, ['magnezyum']);
  assert.deepEqual(coz(['magnezyum klorür hekzahidrat']).ids, ['magnezyum']);
});
test('sulfonamidTekBasinaEslesmez', () => {
  assert.deepEqual(coz(['sülfadimidin sodyum']).ids, []);
  assert.deepEqual(coz(['trimetoprim']).ids, []);
});
test('sulfonamidTrimetoprimBirlikteEslesir', () => {
  assert.deepEqual(coz(['sülfadiazin', 'trimetoprim']).ids, ['sulfonamid_trimetoprim']);
});
test('tetrasiklinOksitetrasikline Eslesmez'.replace(' ', ''), () => {
  // tetrasiklin ayrı etkendir: kendi kimliğine eşlenir, oksitetrasikline asla.
  assert.deepEqual(coz(['tetrasiklin HCl']).ids, ['tetrasiklin']);
  assert.deepEqual(coz(['oksitetrasiklin dihidrat']).ids, ['oksitetrasiklin']);
});
test('kalsiyumKlorurYalnizOralde', () => {
  assert.deepEqual(coz(['kalsiyum klorür'], 'perfüzyon').ids, []);
  assert.deepEqual(coz(['kalsiyum klorür'], 'oral').ids, ['oral_kalsiyum']);
});
test('kalsiyumGlukonatBoroglukonattanAyri', () => {
  assert.deepEqual(coz(['kalsiyum glukonat', 'magnezyum klorür hekzahidrat']).ids, ['kalsiyum_glukonat', 'magnezyum']);
  assert.deepEqual(coz(['kalsiyum boroglukonat']).ids, ['kalsiyum_boroglukonat']);
  // glukoheptonat / sakkarat tahminle kalsiyum_glukonat'a eşlenmez
  assert.deepEqual(coz(['kalsiyum glukoheptonat']).ids, []);
});
test('kristalizePenisilinProkaindenAyri', () => {
  assert.deepEqual(coz(['benzilpenisilin potasyum', 'prokain benzilpenisilin', 'streptomisin sülfat']).ids,
    ['penisilin_g_kristalize', 'penisilin_g_prokain', 'streptomisin']);
  assert.deepEqual(coz(['prokain benzilpenisilin']).ids, ['penisilin_g_prokain']);
});
test('selenyumYalnizEVitaminiyleBirlikte', () => {
  assert.deepEqual(coz(['sodyum selenit', 'Vitamin E asetat']).ids, ['selenyum_e_vitamini']);
  assert.deepEqual(coz(['bakır glukonat', 'çinko glukonat', 'sodyum selenit']).ids, []);
  assert.deepEqual(coz(['Vitamin E asetat', 'Vitamin D3']).ids, []);
});
test('kalsiyumGlukonatBorikAsitleBirlikteBoroglukonattir', () => {
  // K6 Ö-5: Calciject vb. (kalsiyum glukonat + borik asit) = kalsiyum boroglukonat çözeltisi.
  assert.deepEqual(coz(['kalsiyum glukonat', 'borik asit']), { ids: ['kalsiyum_boroglukonat'], eslesmeyen: [] });
  assert.deepEqual(coz(['Borik asit', 'Kalsiyum glukonat monohidrat', 'magnezyum klorür hekzahidrat']).ids,
    ['kalsiyum_boroglukonat', 'magnezyum']);
  // Borik asitsiz kalsiyum glukonat kendi kimliğinde kalır; tek başına borik asit hiçbir etkene eşlenmez.
  assert.deepEqual(coz(['kalsiyum glukonat']).ids, ['kalsiyum_glukonat']);
  assert.deepEqual(coz(['borik asit']).ids, []);
});
test('urunListesiYenilenirkenKubDogrulamasiKorunur', () => {
  // final-review I3: liste yenilemesi hekim doğrulamasını sessizce silmesin (urunId, yoksa ad|firma ile).
  const kub = [{ tur: 'sigir', yol: 'IM', doz: null, et_gun: 28, sut: 'belirtilmemis' }];
  const dogru = { kim: 'hekim', tarih: '2026-11-14', icerikOzeti: 'abcd1234' };
  const onceki = [
    { urunId: '5', ad: 'A', firma: 'F', kub, kubDogrulandi: dogru },
    { ad: 'B', firma: 'G', kubUrl: 'https://hbs.tarbil.gov.tr/x?urunId=9', kub, kubDogrulandi: dogru },
    { ad: 'C', firma: 'H', kub, kubDogrulandi: null },
  ];
  const yeni = [
    { urunId: '5', ad: 'A yeni ad', firma: 'F', kub: [], kubDogrulandi: null },
    { urunId: '9', ad: 'B', firma: 'G', kub: [], kubDogrulandi: null },
    { urunId: null, ad: 'C', firma: 'H', kub: [], kubDogrulandi: null },
    { urunId: '77', ad: 'D', firma: 'I', kub: [], kubDogrulandi: null },
  ];
  const sonuc = oncekiKubuKoru(yeni, onceki);
  assert.deepEqual(sonuc.map((u) => u.kubDogrulandi), [dogru, dogru, null, null]);
  assert.deepEqual(sonuc[0].kub, kub);
  assert.deepEqual(sonuc[2].kub, kub);
  assert.deepEqual(sonuc[3].kub, []);
});
