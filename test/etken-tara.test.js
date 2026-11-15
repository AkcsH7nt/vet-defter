// KÜB bölüm 2 (bileşim) ile ürün etken listesi taraması (K8-A8, scripts/etken-tara.mjs).
// Fikstürler gerçek PDF'lerin ilk satırları (bölüm 1 → 4.x başı; Kalsimin prospektüsünün başı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eksikEtkenler, etkinKisim } from '../scripts/etken-tara.mjs';

const DIZIN = fileURLToPath(new URL('./ornek/kub/', import.meta.url));
const ornek = (ad) => readFileSync(join(DIZIN, `${ad}.txt`), 'utf8');
const ETKENLER = JSON.parse(readFileSync(fileURLToPath(new URL('../veri/etkenler.json', import.meta.url)), 'utf8'));
const eksik = (ad, etkenler) => eksikEtkenler(ornek(ad), { ad, etkenler }, ETKENLER).map((e) => e.id);

test('K8A8_vetampliusBromheksin: bileşimde "bromhekzin", etken listesinde yoksa eksik', () => {
  assert.deepEqual(eksik('vetamplius-1-4', ['ampisilin']), ['bromheksin']);
  assert.deepEqual(eksik('vetamplius-1-4', ['ampisilin', 'bromheksin']), []);
});

test('K8A8_amoksisilinKlavulanatBileseniEksikSayilmaz', () => {
  assert.deepEqual(eksik('amoklizon-1-4', ['amoksisilin_klavulanat']), []);
  assert.deepEqual(eksik('amoklizon-1-4', ['prednizolon_yok']), ['amoksisilin_klavulanat']);
});

test('K8A8_sozcukOrtasiEslesmez: "Dikloksasilin" kloksasilin değildir', () => {
  assert.deepEqual(eksik('cloxalene-1-4', ['ampisilin']), []);
});

test('K8A8_prospektusBilesimi: Kalsimin borik asit + kalsiyum glukonat; endikasyon metnindeki "bakır" sayılmaz', () => {
  assert.deepEqual(eksik('kalsimin-prospektus', ['kalsiyum_glukonat', 'magnezyum']), ['kalsiyum_boroglukonat']);
  assert.deepEqual(eksik('kalsimin-prospektus', ['kalsiyum_boroglukonat', 'magnezyum']), []);
  assert.equal(etkinKisim('Etkin madde: X 10 mg\nYardımcı maddeler: propilen glikol'), 'Etkin madde: X 10 mg\n');
});
