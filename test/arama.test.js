// Belirti arama: Türkçe harfler sadeleşir, kelime başı eşleşme önce gelir, ısıdan türetilen belirtiler çıkmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalize, belirtiAra } from '../lib/arama.js';

const belirtiler = JSON.parse(readFileSync(fileURLToPath(new URL('../veri/belirtiler.json', import.meta.url)), 'utf8'));
const ilkId = (sorgu, liste = belirtiler) => belirtiAra(sorgu, liste)[0]?.id;

test('normalizeTurkceHarfleriSadelestirir', () => {
  assert.equal(normalize('ÖKSÜRÜK'), 'oksuruk');
  assert.equal(normalize('Işık İnek ŞAĞ ÇÜĞ'), 'isik inek sag cug');
  assert.equal(normalize('  Burun   akıntısı '), 'burun akintisi');
  assert.equal(normalize('hâlsizlik'), 'halsizlik');
});

test('oksIlkSonucOksuruk', () => {
  assert.equal(ilkId('oks'), 'oksuruk');
});

test('buyukHarfVeTurkceKarakterliSorguAyniSonuc', () => {
  assert.equal(ilkId('ÖKSÜ'), 'oksuruk');
});

test('esAnlamlidanBulur', () => {
  const diare = belirtiler.find((b) => b.id === 'diare');
  assert.ok(diare.esAnlamlilar.some((e) => normalize(e) === 'ishal'), 'diare kaydının eş anlamlılarında "ishal" olmalı');
  assert.equal(ilkId('ishal'), 'diare');
});

test('secilemezBelirtilerHicDonmez', () => {
  for (const sorgu of ['ates', 'ateş', 'at', 'hipotermi', 'isi', 'vücut ısısı']) {
    const ids = belirtiAra(sorgu, belirtiler).map((b) => b.id);
    assert.ok(!ids.includes('ates') && !ids.includes('hipotermi'), `${sorgu}: ${ids}`);
  }
});

test('bosSorguBosListe', () => {
  assert.deepEqual(belirtiAra('', belirtiler), []);
  assert.deepEqual(belirtiAra('   ', belirtiler), []);
});

test('kelimeBasiEslesmeIcerenEslesmedenOnce', () => {
  const liste = [
    { id: 'icerir', ad: 'Eklem kesişimi', esAnlamlilar: [], genelSiklik: 0.3 },
    { id: 'es_kelime_basi', ad: 'Başka ad', esAnlamlilar: ['gaz şişme'], genelSiklik: 0.01 },
    { id: 'ad_kelime_basi', ad: 'Sol böğür şişmesi', esAnlamlilar: [], genelSiklik: 0.01 },
    { id: 'ad_basi', ad: 'Şişlik', esAnlamlilar: [], genelSiklik: 0.01 },
    { id: 'alakasiz', ad: 'Öksürük', esAnlamlilar: [], genelSiklik: 0.2 },
  ];
  assert.deepEqual(belirtiAra('şiş', liste).map((b) => b.id),
    ['ad_basi', 'ad_kelime_basi', 'es_kelime_basi', 'icerir']);
});

test('cokKelimeliSorguKelimeBaslarinaSirasizEslesir', () => {
  assert.equal(ilkId('akıntı burun'), 'burun_akintisi');
  assert.equal(ilkId('burun akı'), 'burun_akintisi');
});

test('secilebilirFalseSentetikListedeDeElenir', () => {
  const liste = [
    { id: 'a', ad: 'Deneme', esAnlamlilar: [], genelSiklik: 0.1, secilebilir: false },
    { id: 'b', ad: 'Deneme iki', esAnlamlilar: [], genelSiklik: 0.1 },
  ];
  assert.deepEqual(belirtiAra('den', liste).map((b) => b.id), ['b']);
});

test('sozlukteBayrakKurallarininBelirtileriVar', () => {
  const ids = new Set(belirtiler.map((b) => b.id));
  for (const id of ['oksuruk', 'burun_akintisi', 'vezikul_agiz', 'salya', 'topallik', 'ani_olum',
    'dogal_deliklerden_kan', 'sinirsel_belirti', 'abort', 'deri_nodulu', 'ates', 'hipotermi', 'diare']) {
    assert.ok(ids.has(id), `sözlükte yok: ${id}`);
  }
  assert.equal(belirtiler.find((b) => b.id === 'ates').secilebilir, false);
  assert.equal(belirtiler.find((b) => b.id === 'hipotermi').secilebilir, false);
  assert.ok(belirtiler.length >= 110, `belirti sayısı ${belirtiler.length}`);
});
