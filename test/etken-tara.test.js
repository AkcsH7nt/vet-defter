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

test('K8A_digerEtkenAdlari: Bakanlık listesinde eşlenmeyen madde KÜB §2 etkin kısmında aynen aranır', async () => {
  const { digerEtkenAdlari } = await import('../scripts/etken-tara.mjs');
  assert.deepEqual(digerEtkenAdlari(ornek('amoklizon-1-4'), ['prednizolon'], ETKENLER), ['Prednizolon']);
  assert.deepEqual(digerEtkenAdlari(ornek('ubrostar-bilesim'), ['benetamin penisilin', 'framisetin sülfat'], ETKENLER),
    ['Benetamin penisilin', 'Framisetin sülfat']);
  assert.deepEqual(digerEtkenAdlari(ornek('fosbayvit-1-3'), ['Vitamin B12 (siyanokobalamin)'], ETKENLER), ['Siyanokobalamin (Vitamin B12)']);
  assert.deepEqual(digerEtkenAdlari(ornek('cloxalene-1-4'), ['dikloksasilin sodyum'], ETKENLER), ['Dikloksasilin baz']);
  // KÜB yoksa / okunamıyorsa ya da bileşimde bulunamazsa Bakanlık adı (inceleme turu 1, I1); bilinen etkenin yazımı değilse
  assert.deepEqual(digerEtkenAdlari(ornek('amoklizon-1-4'), ['tiyabendazol'], ETKENLER), ['tiyabendazol']);
  assert.deepEqual(digerEtkenAdlari(null, ['tiyabendazol'], ETKENLER), ['tiyabendazol']);
  assert.deepEqual(digerEtkenAdlari('okunamayan kısa metin', ['Vitamin B12 (siyanokobalamin)'], ETKENLER), ['Vitamin B12 (siyanokobalamin)']);
  assert.deepEqual(digerEtkenAdlari(null, ['deksametazon 21 izonikotinat'], ETKENLER), []);
  assert.deepEqual(digerEtkenAdlari(null, [], ETKENLER), []);
});

test('K8A_digerEtkenAdlari: bilinen etkenin adı olan parça atlanır, aynı sözcüğün sonraki geçişi alınır', async () => {
  const { digerEtkenAdlari } = await import('../scripts/etken-tara.mjs');
  // "Benzilpenisilin prokain" penisilin_g_prokain'dir; "Prokain hidroklorür" ayrı (lokal anestezik) madde
  assert.deepEqual(digerEtkenAdlari(ornek('contropen-1-3'), ['prokain HCl'], ETKENLER), ['Prokain hidroklorür']);
  // "Kalsiyum glukonat" etkendir; glukoheptonat / hipofosfit / D-sakkarat değildir (katyon adı tek başına ayırt etmez)
  assert.deepEqual(digerEtkenAdlari(ornek('kalsimin-prospektus'), ['kalsiyum d sakkarat', 'kalsiyum glukoheptonat', 'kalsiyum hipofosfit'], ETKENLER),
    ['Kalsiyum D-sakkarat', 'Kalsiyum glukoheptonat', 'Kalsiyum hipofosfit']);
});
