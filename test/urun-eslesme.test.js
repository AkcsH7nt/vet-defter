import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { etkenIndeksi, urunEtkenleri } from '../scripts/urun-cek.mjs';

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
