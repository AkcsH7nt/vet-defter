// İçerik özeti ve onay durumu: anahtar sırası özeti değiştirmez, içerik değişince özet tutmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icerikOzeti, onayliMi, fnv1a, siraliJson, kubOzeti, kubDogruMu } from '../lib/onay.js';

const kayit = () => ({
  id: 'x',
  ad: 'Örnek',
  belirtiler: [{ id: 'ates', agirlik: 'kardinal', yoklugu_dusurur: false }],
  protokol: { ilaclar: [], ihbarAdimlari: ['Bildir'] },
  onay: { durum: 'taslak' },
});

test('ozet8HaneliOnaltilik', () => {
  assert.match(icerikOzeti(kayit()), /^[0-9a-f]{8}$/);
});

test('alanSirasiDegisinceOzetAyni', () => {
  const a = kayit();
  const b = {
    onay: { durum: 'onayli' },
    protokol: { ihbarAdimlari: ['Bildir'], ilaclar: [] },
    belirtiler: [{ yoklugu_dusurur: false, agirlik: 'kardinal', id: 'ates' }],
    ad: 'Örnek',
    id: 'x',
  };
  assert.equal(icerikOzeti(a), icerikOzeti(b));
});

test('onayAlaniOzeteGirmez', () => {
  const a = kayit();
  const b = { ...kayit(), onay: { durum: 'onayli', kim: 'hekim', tarih: '2026-11-14', icerikOzeti: 'abc' } };
  assert.equal(icerikOzeti(a), icerikOzeti(b));
});

test('icerikDegisinceOzetFarkli', () => {
  const a = kayit();
  const b = kayit(); b.ad = 'Örnek2';
  const c = kayit(); c.belirtiler[0].agirlik = 'tipik';
  const d = kayit(); d.protokol.ihbarAdimlari.push('Ayır');
  assert.notEqual(icerikOzeti(a), icerikOzeti(b));
  assert.notEqual(icerikOzeti(a), icerikOzeti(c));
  assert.notEqual(icerikOzeti(a), icerikOzeti(d));
});

test('diziSirasiOzetiDegistirir', () => {
  const a = { liste: ['a', 'b'] };
  const b = { liste: ['b', 'a'] };
  assert.notEqual(icerikOzeti(a), icerikOzeti(b));
});

test('fnv1aBilinenDegerler', () => {
  // FNV-1a 32-bit resmî test vektörleri.
  assert.equal(fnv1a(''), '811c9dc5');
  assert.equal(fnv1a('a'), 'e40c292c');
  assert.equal(fnv1a('foobar'), 'bf9cf968');
});

test('ozetSiraliJsonUzerinden', () => {
  assert.equal(
    siraliJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 'ş' } }),
    '{"a":{"c":"ş","d":[2,{"y":2,"z":1}]},"b":1}',
  );
  assert.equal(icerikOzeti({ b: 1, a: 2, onay: { durum: 'onayli' } }), fnv1a('{"a":2,"b":1}'));
  // UTF-8 baytları üzerinden: Türkçe harfler doğru karışır.
  assert.notEqual(fnv1a('ş'), fnv1a('s'));
});

test('onayliMiOzeteUyar', () => {
  const k = kayit();
  assert.equal(onayliMi(k), false, 'taslak onaylı sayılmaz');
  k.onay = { durum: 'onayli', kim: 'hekim', tarih: '2026-11-14', icerikOzeti: icerikOzeti(k) };
  assert.equal(onayliMi(k), true);
  // alan sırası değişse de onaylı kalır
  const yeniden = { onay: k.onay, protokol: k.protokol, belirtiler: k.belirtiler, ad: k.ad, id: k.id };
  assert.equal(onayliMi(yeniden), true);
  // içerik değişince onay düşer
  k.ad = 'Değişti';
  assert.equal(onayliMi(k), false);
});

test('onaysizKayitOnayliDegil', () => {
  assert.equal(onayliMi({ id: 'x' }), false);
  assert.equal(onayliMi({ id: 'x', onay: null }), false);
  assert.equal(onayliMi(null), false);
});

// --- KÜB doğrulaması (final-review I3): doğrulamadan sonra kub[] değişirse doğrulama geçersiz ---

const urun = () => ({
  ad: 'Ü', kub: [{ tur: 'sigir', yol: 'IM', doz: { miktar: 10, birim: 'mg/kg', aralik: null, sure: null }, et_gun: 28, sut: { saat: 168 } }],
  kubDogrulandi: null,
});

test('kubDogruMuOzetTutarsaTrue', () => {
  const u = urun();
  assert.equal(kubDogruMu(u), false);
  u.kubDogrulandi = { kim: 'hekim', tarih: '2026-11-14', icerikOzeti: kubOzeti(u) };
  assert.equal(kubDogruMu(u), true);
});

test('kubDogruMuKubDegisinceFalse', () => {
  const u = urun();
  u.kubDogrulandi = { kim: 'hekim', tarih: '2026-11-14', icerikOzeti: kubOzeti(u) };
  u.kub[0].doz.miktar = 20;
  assert.equal(kubDogruMu(u), false);
});

test('kubDogruMuOzetsizDogrulamaGecersiz', () => {
  const u = urun();
  u.kubDogrulandi = { kim: 'hekim', tarih: '2026-11-14' };
  assert.equal(kubDogruMu(u), false);
  assert.equal(kubDogruMu(null), false);
});

test('kubOzetiYalnizKubAlanindan', () => {
  const a = urun();
  const b = { ...urun(), ad: 'başka ad' };
  assert.equal(kubOzeti(a), kubOzeti(b));
  assert.equal(kubOzeti(a), fnv1a(siraliJson(a.kub)));
});
