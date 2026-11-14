// Sonuç ekranının saf mantığı: bayrak birleştirme (tekrarsız uyarı) ve sonuç listeleri
// (Türkiye'de görülmeyen hastalıklar ayrı bölümde; kendi bayrağı tutarsa normal sıralamada).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dizindenOku } from '../scripts/dogrula.mjs';
import { veriYukle } from '../lib/veri.js';
import { bayraklariBirlestir, sonucListeleri } from '../ui/sonuc.js';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const gercek = () => veriYukle(dizindenOku(KOK));
const KASIM = new Date(2026, 10, 14);
const girdi = (ek = {}) => ({
  tur: 'sigir', yas: 'inek', baglam: { dogumSonrasi: false, suru: false, aniOlum: false }, isi: null, belirtiler: [], ...ek,
});

// --- bayraklariBirlestir ---

test('birlesikBantUyarilariBoslukVeNoktalamaFarkindaTekrarsiz', () => {
  const b = bayraklariBirlestir([
    { id: 'a', hastalikId: 'h', baslik: 'A', uyarilar: ['Hayvanı ayırın; süt çıkışını durdurun.', 'Bildirin.'] },
    { id: 'b', hastalikId: 'h', baslik: 'B', uyarilar: ['hayvanı  ayırın, süt çıkışını durdurun', 'Başka uyarı.'] },
  ]);
  assert.equal(b.length, 1);
  assert.equal(b[0].baslik, 'A');
  assert.deepEqual(b[0].uyarilar, ['Hayvanı ayırın; süt çıkışını durdurun.', 'Bildirin.', 'Başka uyarı.']);
});

test('kisaBicimUzunBicimIcindeyseUzunuKalir', () => {
  // Canlı sitede görülen: aynı cümlenin kısa ve uzun biçimi iki satır olarak çıkıyordu (K6 C-4).
  const kisa = 'Çizme, kıyafet ve aleti dezenfekte etmeden işletmeden ayrılmayın.';
  const uzun = 'Çizme, kıyafet ve aleti dezenfekte etmeden işletmeden ayrılmayın; aynı gün başka işletmeye girmeyin.';
  const ikiSira = (x, y) => bayraklariBirlestir([
    { id: 'a', hastalikId: 'sap', baslik: 'A', uyarilar: ['Önce.', x] },
    { id: 'b', hastalikId: 'sap', baslik: 'B', uyarilar: [y, 'Sonra.'] },
  ])[0].uyarilar;
  assert.deepEqual(ikiSira(uzun, kisa), ['Önce.', uzun, 'Sonra.']);
  assert.deepEqual(ikiSira(kisa, uzun), ['Önce.', uzun, 'Sonra.']);
});

test('farkliHastaliklarAyriBantKalir', () => {
  const b = bayraklariBirlestir([
    { id: 'a', hastalikId: 'x', baslik: 'X', uyarilar: ['Bildirin.'] },
    { id: 'b', hastalikId: 'y', baslik: 'Y', uyarilar: ['Bildirin.'] },
  ]);
  assert.deepEqual(b.map((x) => x.hastalikId), ['x', 'y']);
});

test('gercekVeriSapVakasindaCizmeUyarisiBirKez', async () => {
  const veri = await gercek();
  const { bayraklar } = sonucListeleri(girdi({ isi: 40.5, belirtiler: ['vezikul_agiz', 'salya', 'topallik', 'ayakta_vezikul'] }), veri, KASIM);
  const sap = bayraklar.find((b) => b.hastalikId === 'sap');
  assert.equal(sap.uyarilar.filter((u) => u.startsWith('Çizme')).length, 1, JSON.stringify(sap.uyarilar));
});

// --- sonucListeleri ---

const CBPP = 'sigir_pleuropnomonisi';
const cbppVakasi = (belirtiler) => girdi({
  baglam: { dogumSonrasi: false, suru: true, aniOlum: false }, isi: 40.6, belirtiler,
});

test('turkiyedeGorulmeyenHastalikIlk5yeGirmezAyriBolumde', async () => {
  const veri = await gercek();
  // Bayrak tutmasın diye ağrı/inleme yok: CBPP yalnız ayrı bölümde.
  const s = sonucListeleri(cbppVakasi(['oksuruk', 'solunum_guclugu', 'boyun_uzatma', 'hareket_istememe']), veri, KASIM);
  assert.ok(!s.bayraklar.some((b) => b.hastalikId === CBPP));
  assert.ok(!s.ana.some((x) => x.id === CBPP));
  assert.ok(s.egzotik.some((x) => x.id === CBPP));
  assert.ok(s.ana.length <= 5);
  for (const x of s.ana) assert.notEqual(veri.hastaliklar.find((h) => h.id === x.id).turkiyedeGorulmez, true);
});

test('kendiBayragiTutanEgzotikHastalikNormalSiradaGorunur', async () => {
  const veri = await gercek();
  const s = sonucListeleri(cbppVakasi(['oksuruk', 'solunum_guclugu', 'agri_inleme', 'boyun_uzatma', 'hareket_istememe']), veri, KASIM);
  assert.ok(s.bayraklar.some((b) => b.hastalikId === CBPP));
  assert.ok(s.ana.some((x) => x.id === CBPP));
  assert.ok(!s.egzotik.some((x) => x.id === CBPP));
});

test('egzotikBolumYalnizEslesenBulgusuOlanlari', async () => {
  const veri = await gercek();
  const s = sonucListeleri(girdi({ belirtiler: ['kasinti', 'kil_dokulmesi', 'deri_kabuklanma'] }), veri, KASIM);
  for (const x of s.egzotik) assert.ok(x.eslesen.length > 0, x.id);
});

test('yetersizGirdideListeYokBayrakVar', async () => {
  const veri = await gercek();
  const s = sonucListeleri(girdi({ baglam: { dogumSonrasi: false, suru: false, aniOlum: true } }), veri, KASIM);
  assert.equal(s.yetersiz, true);
  assert.deepEqual(s.ana, []);
  assert.deepEqual(s.egzotik, []);
  assert.ok(s.bayraklar.some((b) => b.hastalikId === 'sarbon'));
});

test('gucluUyanKayitYoksaIsaretlenir', async () => {
  const veri = await gercek();
  // K6 Ö-7: listeriyoz tablosu (veride listeriyoz yok) → ilk 5 ilgisiz ve zayıf; ekranda not çıkmalı.
  const listeriyoz = sonucListeleri(girdi({ isi: 40.2, belirtiler: ['dairesel_yurume', 'yuz_felci', 'salya'] }), veri, KASIM);
  assert.equal(listeriyoz.uyanKayitYok, true, JSON.stringify(listeriyoz.ana.map((x) => [x.id, x.uyum])));
  const solunum = sonucListeleri(girdi({ yas: 'dana', isi: 40.8, belirtiler: ['oksuruk', 'burun_akintisi', 'hizli_solunum', 'istahsizlik'] }), veri, KASIM);
  assert.equal(solunum.uyanKayitYok, false);
});

test('tekHayvandaCbppTablosuAyriBolumdeGorunur', async () => {
  // Re-review C1 kararı: egzotik hastalıklar sürü işareti olmadan da puanlanır, ayrı bölüme düşer.
  const veri = await gercek();
  const tek = girdi({ isi: 40.6, belirtiler: ['oksuruk', 'solunum_guclugu', 'agri_inleme', 'boyun_uzatma', 'hareket_istememe'] });
  const s = sonucListeleri(tek, veri, KASIM);
  assert.ok(!s.bayraklar.some((b) => b.hastalikId === CBPP)); // bayrak kuralı sürü ister (değişmedi)
  assert.ok(!s.ana.some((x) => x.id === CBPP));
  assert.ok(s.egzotik.some((x) => x.id === CBPP), JSON.stringify(s.egzotik.map((x) => x.id)));
  for (const h of veri.hastaliklar.filter((x) => x.turkiyedeGorulmez)) {
    assert.ok(!Object.values(h.baglam).includes('zorunlu'), `${h.id}: egzotik hastalıkta zorunlu bağlam`);
  }
});
