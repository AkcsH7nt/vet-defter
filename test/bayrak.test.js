// Kırmızı bayrak katmanı (spec §9, §4): ihbar / zoonoz şüphesi puandan bağımsız, sonuçların üstünde.
// Örnek veride spec'teki beş kural: şap, şarbon, kuduz, brusella, LSD (test/ornek/veri/bayraklar.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dizindenOku } from '../scripts/dogrula.mjs';
import { veriYukle } from '../lib/veri.js';
import { yetersizMi, puanla } from '../lib/puan.js';
import { bayraklar } from '../lib/bayrak.js';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const ORNEK = join(KOK, 'test', 'ornek');
const ornek = () => veriYukle(dizindenOku(ORNEK));

const SAP = 'ornek_ihbar_bayragi';
const SARBON = 'ornek_sarbon_bayragi';
const KUDUZ = 'ornek_kuduz_bayragi';
const BRUSELLA = 'ornek_bruselloz_bayragi';
const LSD = 'ornek_lsd_bayragi';

const girdi = (ek = {}) => ({
  tur: 'sigir',
  yas: 'inek',
  baglam: { dogumSonrasi: false, suru: false, aniOlum: false },
  isi: null,
  belirtiler: [],
  ...ek,
});
const idler = (sonuc) => sonuc.map((b) => b.id);

/** Tek kurallı küçük veri: koşul semantiği testleri için. */
const kural = (id, kosul) => ({
  id, hastalikId: 'h', kosul, baslik: `B ${id}`, uyarilar: [`U ${id}`], onay: { durum: 'taslak' },
});

// --- Spec §9'daki beş kural ---

test('sapVezikulSalyaTopallik', async () => {
  const veri = await ornek();
  const sonuc = bayraklar(girdi({ belirtiler: ['vezikul_agiz', 'salya', 'topallik'] }), veri);
  assert.deepEqual(idler(sonuc), [SAP]);
  // İkisi yetmez.
  assert.deepEqual(bayraklar(girdi({ belirtiler: ['vezikul_agiz', 'salya'] }), veri), []);
});

test('bayrakSekli', async () => {
  const veri = await ornek();
  const [b] = bayraklar(girdi({ belirtiler: ['vezikul_agiz', 'salya', 'topallik'] }), veri);
  assert.deepEqual(Object.keys(b).sort(), ['baslik', 'hastalikId', 'id', 'uyarilar']);
  assert.equal(b.hastalikId, 'ornek_ihbar');
  assert.equal(typeof b.baslik, 'string');
  assert.ok(Array.isArray(b.uyarilar) && b.uyarilar.length > 0);
  // Dönen dizi veriyi paylaşmaz: değiştirmek kuralı bozmaz.
  b.uyarilar.push('eklendi');
  const [tekrar] = bayraklar(girdi({ belirtiler: ['vezikul_agiz', 'salya', 'topallik'] }), veri);
  assert.ok(!tekrar.uyarilar.includes('eklendi'));
});

test('sarbonAniOlumBaglamiVeDogalDeliklerdenKan', async () => {
  const veri = await ornek();
  const aniOlum = { dogumSonrasi: false, suru: false, aniOlum: true };
  const sonuc = bayraklar(girdi({ baglam: aniOlum, belirtiler: ['dogal_deliklerden_kan'] }), veri);
  assert.deepEqual(idler(sonuc), [SARBON]);
  assert.equal(sonuc[0].hastalikId, 'ornek_sarbon');
  assert.ok(sonuc[0].uyarilar.some((u) => /nekropsi/i.test(u)), JSON.stringify(sonuc[0].uyarilar));
  // Ani ölüm bağlamı olmadan tutmaz; bağlam tek başına da tutmaz.
  assert.deepEqual(bayraklar(girdi({ belirtiler: ['dogal_deliklerden_kan'] }), veri), []);
  assert.deepEqual(bayraklar(girdi({ baglam: aniOlum }), veri), []);
  // Bağlam nesnesi hiç yoksa da atmaz, tutmaz.
  assert.deepEqual(bayraklar({ belirtiler: ['dogal_deliklerden_kan'] }, veri), []);
});

test('kuduzSinirselBelirtiArtiSalya', async () => {
  const veri = await ornek();
  for (const sinirsel of ['saldirganlik', 'kas_titremesi']) {
    const sonuc = bayraklar(girdi({ belirtiler: [sinirsel, 'salya'] }), veri);
    assert.deepEqual(idler(sonuc), [KUDUZ], sinirsel);
    assert.ok(sonuc[0].uyarilar.some((u) => /çıplak el/i.test(u)), JSON.stringify(sonuc[0].uyarilar));
  }
  assert.deepEqual(bayraklar(girdi({ belirtiler: ['salya'] }), veri), []);
  assert.deepEqual(bayraklar(girdi({ belirtiler: ['saldirganlik', 'kas_titremesi'] }), veri), []);
});

test('tekBelirtiAbortBrusellaVeYetersizGirdideDeCalisir', async () => {
  const veri = await ornek();
  const g = girdi({ belirtiler: ['abort'] });
  assert.equal(yetersizMi(g), true);
  const sonuc = bayraklar(g, veri);
  assert.deepEqual(idler(sonuc), [BRUSELLA]);
  assert.equal(sonuc[0].hastalikId, 'ornek_bruselloz');
});

test('lsdDeriNoduluArtiIsidanAtes', async () => {
  const veri = await ornek();
  assert.deepEqual(idler(bayraklar(girdi({ isi: 40.5, belirtiler: ['deri_nodulu'] }), veri)), [LSD]);
  // Ateş yalnız ısıdan türetilir: elle "ates" seçmek ya da normal ısı tutmaz.
  assert.deepEqual(bayraklar(girdi({ isi: null, belirtiler: ['deri_nodulu', 'ates'] }), veri), []);
  assert.deepEqual(bayraklar(girdi({ isi: 38.6, belirtiler: ['deri_nodulu'] }), veri), []);
  // Buzağıda ateş eşiği 39,8 (puan.js ile aynı).
  assert.deepEqual(bayraklar(girdi({ yas: 'buzagi', isi: 39.6, belirtiler: ['deri_nodulu'] }), veri), []);
  assert.deepEqual(idler(bayraklar(girdi({ yas: 'buzagi', isi: 40.0, belirtiler: ['deri_nodulu'] }), veri)), [LSD]);
});

test('hicbirKuralTutmazsaBosDizi', async () => {
  const veri = await ornek();
  assert.deepEqual(bayraklar(girdi(), veri), []);
  assert.deepEqual(bayraklar(girdi({ isi: 40.5, belirtiler: ['oksuruk', 'burun_akintisi', 'istahsizlik'] }), veri), []);
});

// --- Sıra, tekrarsızlık, puandan bağımsızlık ---

test('birdenCokBayrakVeriSirasiyla', async () => {
  const veri = await ornek();
  const g = girdi({
    baglam: { dogumSonrasi: false, suru: true, aniOlum: true },
    isi: 41.0,
    // Girdi sırası veri sırasının tersi: sonuç yine veri sırasında.
    belirtiler: ['deri_nodulu', 'abort', 'saldirganlik', 'dogal_deliklerden_kan', 'topallik', 'salya', 'vezikul_agiz'],
  });
  assert.deepEqual(idler(bayraklar(g, veri)), [SAP, SARBON, KUDUZ, BRUSELLA, LSD]);
  veri.bayraklar.reverse();
  assert.deepEqual(idler(bayraklar(g, veri)), [LSD, BRUSELLA, KUDUZ, SARBON, SAP]);
});

test('ayniKimlikliKuralBirKezDoner', () => {
  const veri = { bayraklar: [kural('k1', { hepsi: ['a'] }), kural('k2', { hepsi: ['a'] }), kural('k1', { hepsi: ['a'] })] };
  const sonuc = bayraklar(girdi({ belirtiler: ['a'] }), veri);
  assert.deepEqual(idler(sonuc), ['k1', 'k2']);
});

test('puandanBagimsizHastalikSiralamadaYokkenDeCikar', async () => {
  const veri = await ornek();
  const g = girdi({ belirtiler: ['abort', 'oksuruk', 'istahsizlik'] });
  // Hastalık kaydı olmasa (sıralamada hiç görünmese) da bayrak çıkar: kural tablosu puandan ayrı.
  veri.hastaliklar = veri.hastaliklar.filter((h) => h.id !== 'ornek_bruselloz');
  assert.ok(!puanla(g, veri).some((s) => s.id === 'ornek_bruselloz'));
  assert.deepEqual(idler(bayraklar(g, veri)), [BRUSELLA]);
});

// --- Koşul semantiği ---

test('herhangiEnAzBiriYeter', () => {
  const veri = { bayraklar: [kural('k', { herhangi: ['a', 'b'] })] };
  assert.deepEqual(idler(bayraklar(girdi({ belirtiler: ['b'] }), veri)), ['k']);
  assert.deepEqual(idler(bayraklar(girdi({ belirtiler: ['a', 'b'] }), veri)), ['k']);
  assert.deepEqual(bayraklar(girdi({ belirtiler: ['c'] }), veri), []);
});

test('hepsiVeHerhangiBirlikteIkisiDeTutmali', () => {
  const veri = { bayraklar: [kural('k', { hepsi: ['a', 'b'], herhangi: ['c', 'd'] })] };
  assert.deepEqual(idler(bayraklar(girdi({ belirtiler: ['a', 'b', 'd'] }), veri)), ['k']);
  assert.deepEqual(bayraklar(girdi({ belirtiler: ['a', 'b'] }), veri), []);
  assert.deepEqual(bayraklar(girdi({ belirtiler: ['a', 'c', 'd'] }), veri), []);
});

test('bosHerhangiYokSayilirBosHepsiYokSayilir', () => {
  const veri = { bayraklar: [kural('k1', { hepsi: ['a'], herhangi: [] }), kural('k2', { hepsi: [], herhangi: ['a'] })] };
  assert.deepEqual(idler(bayraklar(girdi({ belirtiler: ['a'] }), veri)), ['k1', 'k2']);
});

test('belirtisizKosulHicTutmaz', () => {
  const veri = { bayraklar: [kural('k1', { hepsi: [] }), kural('k2', { baglam: { aniOlum: true } }), kural('k3', {})] };
  const g = girdi({ baglam: { dogumSonrasi: true, suru: true, aniOlum: true }, belirtiler: ['a'] });
  assert.deepEqual(bayraklar(g, veri), []);
});

test('baglamAnahtarlariHepsiTrueOlmali', () => {
  const veri = { bayraklar: [kural('k', { hepsi: ['a'], baglam: { suru: true, dogumSonrasi: true } })] };
  const b = (baglam) => idler(bayraklar(girdi({ baglam, belirtiler: ['a'] }), veri));
  assert.deepEqual(b({ dogumSonrasi: true, suru: true, aniOlum: false }), ['k']);
  assert.deepEqual(b({ dogumSonrasi: true, suru: false, aniOlum: false }), []);
  assert.deepEqual(b({ dogumSonrasi: 'evet', suru: true, aniOlum: false }), []); // yalnız true sayılır
  assert.deepEqual(b(undefined), []);
});

// --- Sağlamlık ---

test('bilinmeyenKimliklerYokSayilir', async () => {
  const veri = await ornek();
  assert.deepEqual(bayraklar(girdi({ belirtiler: ['uydurma_belirti'] }), veri), []);
  assert.deepEqual(idler(bayraklar(girdi({ belirtiler: ['uydurma_belirti', 'abort'] }), veri)), [BRUSELLA]);
});

test('bosYaDaBozukVerideAtmaz', () => {
  const g = girdi({ belirtiler: ['abort'] });
  for (const veri of [undefined, null, {}, { bayraklar: [] }, { bayraklar: null }, { bayraklar: 'x' }]) {
    assert.deepEqual(bayraklar(g, veri), [], JSON.stringify(veri));
  }
  // Bozuk kural satırları atlanır, sağlamlar yine döner.
  const veri = { bayraklar: [null, 7, { id: 'kosulsuz' }, kural('k', { hepsi: 'a' }), kural('saglam', { hepsi: ['abort'] })] };
  assert.deepEqual(idler(bayraklar(g, veri)), ['saglam']);
  // Girdi eksikse de atmaz.
  assert.deepEqual(bayraklar(undefined, veri), []);
  assert.deepEqual(bayraklar({}, veri), []);
});

// --- Veri ---

test('ornekVerideBesSpecKurali', async () => {
  const veri = await ornek();
  assert.deepEqual(idler(veri.bayraklar), [SAP, SARBON, KUDUZ, BRUSELLA, LSD]);
  const hastaliklar = new Set(veri.hastaliklar.map((h) => h.id));
  for (const b of veri.bayraklar) {
    assert.ok(hastaliklar.has(b.hastalikId), `${b.id}: hastalık verisinde yok: ${b.hastalikId}`);
    assert.equal(b.onay.durum, 'taslak');
  }
});

test('gercekVeriBosKuralTablosuylaAtmaz', async () => {
  const veri = await veriYukle(dizindenOku(KOK));
  assert.ok(Array.isArray(veri.bayraklar));
  assert.ok(Array.isArray(bayraklar(girdi({ belirtiler: ['abort'] }), veri)));
});
