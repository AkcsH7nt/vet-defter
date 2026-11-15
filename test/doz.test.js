// Ürün türü yardımcıları ve arınma etiketi (spec §15: ürün onayı doz göstermeyi kapılamaz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dizindenOku } from '../scripts/dogrula.mjs';
import { veriYukle } from '../lib/veri.js';
import { sigirMi, yalnizBuzagiMi } from '../ui/hastalik.js';
import { arinmaEtiketi } from '../ui/kub.js';

test('arinmaEtiketiYalnizYuksekGuvendeVeBicimleri', () => {
  const y = (sigir) => arinmaEtiketi({ guven: 'yuksek', ...sigir });
  assert.deepEqual(y({ et_gun: 28, sut: { saat: 240 } }), ['Et 28 gün', 'Süt 10 gün']);
  assert.deepEqual(y({ et_gun: 0, sut: { saat: 36 } }), ['Et 0 gün', 'Süt 36 saat']);
  assert.deepEqual(y({ et_gun: 3, sut: 'kullanilmaz' }), ['Et 3 gün', 'Süt: sağmal inekte kullanılmaz']);
  assert.deepEqual(y({ et_gun: 3, sut: 'belirtilmemis' }), ['Et 3 gün', "Süt: KÜB'de belirtilmemiş"]);
  assert.deepEqual(y({ et_gun: 3, sut: null }), ['Et 3 gün']);
  // düşük güven: sayı varken bile etiket yok
  assert.deepEqual(arinmaEtiketi({ et_gun: 28, sut: { saat: 240 }, guven: 'dusuk' }), []);
  assert.deepEqual(arinmaEtiketi(null), []);
});

test('sigirVeBuzagiUrunleriSigirSayilir', () => {
  assert.equal(sigirMi({ hedefTurler: ['sigir'] }), true);
  assert.equal(sigirMi({ hedefTurler: ['buzagi'] }), true);
  assert.equal(sigirMi({ hedefTurler: ['Buzağı'] }), true);
  assert.equal(sigirMi({ hedefTurler: ['koyun', 'kuzu'] }), false);
  assert.equal(yalnizBuzagiMi({ hedefTurler: ['buzagi', 'kuzu'] }), true);
  assert.equal(yalnizBuzagiMi({ hedefTurler: ['sigir', 'buzagi'] }), false);
});

test('gercekVerideToltrazurilVeHalofuginonUrunleriVar', async () => {
  const veri = await veriYukle(dizindenOku(fileURLToPath(new URL('..', import.meta.url))));
  for (const id of ['toltrazuril', 'halofuginon']) {
    assert.ok(veri.urunler.some((u) => u.etkenler.includes(id) && sigirMi(u)), id);
  }
});
