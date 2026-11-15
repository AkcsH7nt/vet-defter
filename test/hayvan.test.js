// Kilo ve yaş (ay) okuma + uyarı kuralları.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kiloOku, yasAyOku, kiloUyarisi } from '../lib/hayvan.js';
import { girdiNormalize } from '../ui/ortak.js';
import { isiOku } from '../lib/puan.js';

test('kiloOku virgul, bosluk ve kg ekini okur; gecersiz null', () => {
  assert.equal(kiloOku('450'), 450);
  assert.equal(kiloOku('450,5'), 450.5);
  assert.equal(kiloOku(' 450 kg '), 450);
  assert.equal(kiloOku(450), 450);
  for (const x of ['abc', '0', '-5', '', null, undefined, NaN, Infinity, '12abc']) assert.equal(kiloOku(x), null, String(x));
});

test('yasAyOku 0-360 ay', () => {
  assert.equal(yasAyOku('18'), 18);
  assert.equal(yasAyOku('2,5'), 2.5);
  assert.equal(yasAyOku('0'), 0);
  assert.equal(yasAyOku('360'), 360);
  for (const x of ['361', '-1', 'x', '', null]) assert.equal(yasAyOku(x), null, String(x));
});

test('kiloUyarisi esikleri', () => {
  assert.equal(kiloUyarisi(10, 'inek').tur, 'gecersiz');
  assert.equal(kiloUyarisi(1300, 'inek').tur, 'gecersiz');
  assert.equal(kiloUyarisi(10, 'inek').metin, 'Kilo olağan dışı, kontrol edin');
  assert.equal(kiloUyarisi(300, 'buzagi').tur, 'yumusak');
  assert.equal(kiloUyarisi(120, 'inek').tur, 'yumusak');
  assert.equal(kiloUyarisi(120, 'boga').tur, 'yumusak');
  assert.equal(kiloUyarisi(120, 'inek').metin, 'Kilo yaş grubuyla uyumsuz görünüyor, kontrol edin');
  assert.equal(kiloUyarisi(450, 'inek'), null);
  assert.equal(kiloUyarisi(250, 'buzagi'), null);
  assert.equal(kiloUyarisi(150, 'inek'), null);
  assert.equal(kiloUyarisi(120, 'dana'), null);
  assert.equal(kiloUyarisi(null, 'inek'), null);
});

test('girdiNormalize kilo ve yasAy sayi ya da null', () => {
  assert.equal(girdiNormalize({ kilo: 'x' }, isiOku).kilo, null);
  assert.equal(girdiNormalize({ kilo: 450 }, isiOku).kilo, 450);
  assert.equal(girdiNormalize({ kilo: '450' }, isiOku).kilo, 450);
  assert.equal(girdiNormalize({}, isiOku).kilo, null);
  assert.equal(girdiNormalize({}, isiOku).yasAy, null);
  assert.equal(girdiNormalize({ yasAy: 24 }, isiOku).yasAy, 24);
});
